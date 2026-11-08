// Run with `node scripts/test-subscribe-rate-limits.mjs`.
// Exercise the Worker entry point without contacting Resend or Turnstile.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

function moduleUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return `data:text/javascript,${encodeURIComponent(compiled)}`;
}

const domains = moduleUrl(await readFile(new URL("../worker/domains.ts", import.meta.url), "utf8"));
const source = (await readFile(new URL("../worker/index.ts", import.meta.url), "utf8"))
  .replace('"./domains"', JSON.stringify(domains));
const { default: worker } = await import(moduleUrl(source));
const originalFetch = globalThis.fetch;
const originalError = console.error;

try {
  for (const scenario of [
    { name: "both healthy", status: 200 },
    { name: "IP missing", ip: "missing", status: 503 },
    { name: "global missing", global: "missing", status: 503 },
    { name: "IP throws", ip: "throws", status: 503 },
    { name: "global throws", global: "throws", status: 503 },
    { name: "IP exhausted", ip: "limited", status: 429 },
    { name: "global exhausted", global: "limited", status: 429 },
    { name: "missing IP uses shared fallback key", noIp: true, status: 200 },
  ]) {
    const calls = [];
    const logs = [];
    const upstream = [];
    const limiter = (name, mode) => mode === "missing" ? undefined : {
      async limit({ key }) {
        calls.push({ name, key });
        if (mode === "throws") throw new Error("limiter unavailable");
        return { success: mode !== "limited" };
      },
    };
    console.error = (...args) => logs.push(args.map(String).join(" "));
    globalThis.fetch = async (url, init) => {
      upstream.push({ url, init });
      assert.equal(url, "https://api.resend.com/contacts");
      return new Response(JSON.stringify({ id: "test-contact" }), { status: 201 });
    };
    const request = new Request("https://canvasui.dev/api/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://canvasui.dev",
        ...(scenario.noIp ? {} : { "cf-connecting-ip": "192.0.2.1" }),
      },
      body: JSON.stringify({ email: "Reader@gmail.com" }),
    });
    const response = await worker.fetch(request, {
      ASSETS: { fetch() { throw new Error("Unexpected asset request"); } },
      RESEND_API_KEY: "test-key",
      RESEND_SEGMENT_ID: "test-segment",
      SUBSCRIBE_IP_LIMIT: limiter("IP", scenario.ip),
      SUBSCRIBE_GLOBAL_LIMIT: limiter("global", scenario.global),
    });
    assert.equal(response.status, scenario.status, scenario.name);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(upstream.length, scenario.status === 200 ? 1 : 0,
      `${scenario.name}: rejected requests must not consume Resend quota`);
    const expectedCalls = [];
    if (scenario.ip !== "missing") expectedCalls.push({ name: "IP", key: scenario.noIp ? "unknown" : "192.0.2.1" });
    if (!scenario.ip && scenario.global !== "missing") expectedCalls.push({ name: "global", key: "global" });
    assert.deepEqual(calls, expectedCalls, `${scenario.name}: limiter order and keys`);
    if (scenario.status === 503) {
      assert.deepEqual(await response.json(), { error: "Signups are unavailable right now." });
      assert.equal(logs.length, 1);
      assert.ok(logs[0].includes(scenario.ip ? "SUBSCRIBE_IP_LIMIT" : "SUBSCRIBE_GLOBAL_LIMIT"));
    } else {
      assert.deepEqual(logs, []);
      if (scenario.status === 429) {
        assert.deepEqual(await response.json(), { error: "Too many attempts. Please try again shortly." });
      } else {
        assert.deepEqual(await response.json(), { ok: true });
        assert.deepEqual(JSON.parse(upstream[0].init.body), {
          email: "reader@gmail.com", unsubscribed: false, segments: [{ id: "test-segment" }],
        });
      }
    }
    console.log(`PASS subscribe: ${scenario.name}`);
  }
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
