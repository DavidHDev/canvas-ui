import { BLOCKED_DOMAINS, BLOCKED_TLDS, suggestDomain } from "./domains";

interface RateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_ENABLED?: string;
  ALLOWED_ORIGINS?: string;
  RESEND_SEGMENT_ID?: string;
  SUBSCRIBE_IP_LIMIT?: RateLimiter;
  SUBSCRIBE_GLOBAL_LIMIT?: RateLimiter;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const TOO_MANY = "Too many attempts. Please try again shortly.";
const UNAVAILABLE = "Signups are unavailable right now.";

function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  if (host === new URL(request.url).host) return true;

  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        return new URL(entry).host === host;
      } catch {
        return entry === host;
      }
    });
}

type LimitResult = "ok" | "limited" | "error";

async function checkLimit(
  limiter: RateLimiter | undefined,
  name: string,
  key: string,
): Promise<LimitResult> {
  if (!limiter) {
    console.error(`Rate limiter binding ${name} is not configured.`);
    return "error";
  }
  try {
    const { success } = await limiter.limit({ key });
    return success ? "ok" : "limited";
  } catch (error) {
    console.error(`Rate limiter ${name} check failed:`, error);
    return "error";
  }
}

async function verifyTurnstile(
  token: unknown,
  secret: string,
  ip: string,
): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  try {
    const result = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const payload = (await result.json()) as { success?: boolean };
    return payload.success === true;
  } catch {
    return false;
  }
}

async function subscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!sameOrigin(request, env)) {
    return json({ error: "Forbidden." }, 403);
  }

  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/json")
  ) {
    return json({ error: "Expected a JSON body." }, 415);
  }

  if (!env.RESEND_API_KEY || !env.RESEND_SEGMENT_ID) {
    return json({ error: UNAVAILABLE }, 503);
  }

  const turnstileRequired = env.TURNSTILE_ENABLED === "true";

  if (turnstileRequired && !env.TURNSTILE_SECRET_KEY) {
    return json({ error: UNAVAILABLE }, 503);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "";

  const ipLimit = await checkLimit(
    env.SUBSCRIBE_IP_LIMIT,
    "SUBSCRIBE_IP_LIMIT",
    ip || "unknown",
  );
  if (ipLimit === "error") {
    return json({ error: UNAVAILABLE }, 503);
  }
  if (ipLimit === "limited") {
    return json({ error: TOO_MANY }, 429);
  }

  const globalLimit = await checkLimit(
    env.SUBSCRIBE_GLOBAL_LIMIT,
    "SUBSCRIBE_GLOBAL_LIMIT",
    "global",
  );
  if (globalLimit === "error") {
    return json({ error: UNAVAILABLE }, 503);
  }
  if (globalLimit === "limited") {
    return json({ error: TOO_MANY }, 429);
  }

  let email: unknown;
  let token: unknown;
  let note: unknown;
  try {
    const body = (await request.json()) as {
      email?: unknown;
      token?: unknown;
      note?: unknown;
    };
    email = body?.email;
    token = body?.token;
    note = body?.note;
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  if (typeof note === "string" && note.trim()) {
    return json({ ok: true });
  }

  if (
    env.TURNSTILE_SECRET_KEY &&
    !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip))
  ) {
    return json({ error: "Could not verify your browser. Please retry." }, 403);
  }

  if (typeof email !== "string") {
    return json({ error: "Please enter your email address." }, 400);
  }

  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return json({ error: "Please enter your email address." }, 400);
  }

  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalized)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  const atIndex = normalized.lastIndexOf("@");
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const tld = domain.slice(domain.lastIndexOf(".") + 1);

  if (local.length > MAX_LOCAL_LENGTH) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  const suggestion = suggestDomain(domain);
  if (suggestion) {
    return json({ error: `Did you mean @${suggestion}?` }, 400);
  }

  if (BLOCKED_TLDS.has(tld) || BLOCKED_DOMAINS.has(domain)) {
    return json({ error: "Please use a permanent email address." }, 400);
  }

  const resendHeaders = {
    authorization: `Bearer ${env.RESEND_API_KEY}`,
    "content-type": "application/json",
  };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: resendHeaders,
      body: JSON.stringify({
        email: normalized,
        unsubscribed: false,
        segments: [{ id: env.RESEND_SEGMENT_ID }],
      }),
    });
  } catch {
    return json({ error: "Something went wrong. Please try again." }, 502);
  }

  if (!response.ok) {
    // Contacts are global in Resend. An address may already exist in another
    if (response.status === 409 || response.status === 422) {
      let segmentResponse: Response;
      try {
        segmentResponse = await fetch(
          `https://api.resend.com/contacts/${encodeURIComponent(normalized)}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`,
          { method: "POST", headers: resendHeaders },
        );
      } catch {
        return json({ error: "Something went wrong. Please try again." }, 502);
      }

      if (segmentResponse.ok || segmentResponse.status === 409) {
        return json({ ok: true });
      }

      if (response.status === 422) {
        return json({ error: "Please enter a valid email address." }, 400);
      }

      return json({ error: "Something went wrong. Please try again." }, 502);
    }

    if (response.status === 429) {
      return json(
        { error: "Too many attempts. Please try again shortly." },
        429,
      );
    }
    return json({ error: "Something went wrong. Please try again." }, 502);
  }

  return json({ ok: true });
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/subscribe") {
      return subscribe(request, env);
    }

    if (pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

export default handler;
