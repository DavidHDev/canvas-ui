const TREATMENT = {
  dark: "&duotone=020a2e,6fb8ff&duotone-alpha=100&con=40&bri=10",
  light: "&duotone=0a6fd6,e1f2ff&duotone-alpha=100&con=20&bri=8",
} as const;

export type PhotoTone = keyof typeof TREATMENT;

const PHOTO_IDS = ["photo-1632231484562-3d2bed7e808d"] as const;

export function photoUrl(index = 0, tone: PhotoTone = "dark", width = 1600) {
  const id = PHOTO_IDS[index % PHOTO_IDS.length];
  return `https://images.unsplash.com/${id}?q=72&w=${width}&auto=format&fit=crop${TREATMENT[tone]}`;
}

export function photoSrcSet(index: number, tone: PhotoTone) {
  return [1280, 1920, 2800].map((width) => `${photoUrl(index, tone, width)} ${width}w`).join(", ");
}

export const PHOTOS = PHOTO_IDS.map((_, index) => photoUrl(index));
