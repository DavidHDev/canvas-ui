export interface RepoRef {
  owner: string;
  name: string;
}

const SEGMENT = /^[\w.-]+$/;

export function parseRepo(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const host = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  const path = (host ? host[1] : trimmed).split(/[?#]/)[0];

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) return null;

  return { owner, name };
}

export const repoSlug = (repo: RepoRef) => `${repo.owner}/${repo.name}`;

export type StarResult =
  { ok: true; stars: number } | { ok: false; error: string };

export async function fetchStars(repo: RepoRef): Promise<StarResult> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
  } catch {
    return {
      ok: false,
      error: "Could not reach GitHub. Check your connection.",
    };
  }

  if (res.status === 404)
    return { ok: false, error: "That repository doesn't exist or is private." };
  if (res.status === 403 || res.status === 429)
    return {
      ok: false,
      error: "GitHub rate limit reached. Try again in a few minutes.",
    };
  if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}.` };

  const data = (await res.json()) as { stargazers_count?: unknown };
  if (typeof data.stargazers_count !== "number")
    return { ok: false, error: "Unexpected response from GitHub." };

  return { ok: true, stars: data.stargazers_count };
}

export interface Preset {
  id: string;
  label: string;
  hex: string;
}

export const PRESETS: Preset[] = [
  { id: "blue", label: "Blue", hex: "#4f8aff" },
  { id: "violet", label: "Violet", hex: "#9a6bff" },
  { id: "ember", label: "Ember", hex: "#ff7a1a" },
  { id: "rose", label: "Rose", hex: "#ff4d7d" },
  { id: "mint", label: "Mint", hex: "#2fd4a0" },
  { id: "gold", label: "Gold", hex: "#ffc247" },
];

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function lighten(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    rgb[0] + (1 - rgb[0]) * amount,
    rgb[1] + (1 - rgb[1]) * amount,
    rgb[2] + (1 - rgb[2]) * amount,
  ];
}
