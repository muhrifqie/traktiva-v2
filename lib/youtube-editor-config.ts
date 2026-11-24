// YouTube → Editor settings, shared by the server renderer (lib/youtube-editor.ts), settings.json and the client panel.

export type Layout = "side" | "stack" | "pip"; // kiri-kanan | atas-bawah | reaction (one full, one small in a corner)
export const SIZES = {
  "1080x1920": { label: "Shorts", note: "1080×1920" },
  "720x1280": { label: "Ringan", note: "720×1280" },
  "1080x1080": { label: "Persegi", note: "1080×1080" },
  "1920x1080": { label: "Landscape", note: "1920×1080" },
} as const;
export type Size = keyof typeof SIZES;
/** cover = fill its part (cropped); contain = whole video, the rest filled (blur of itself, black or white) */
export type Fit = "cover" | "contain";
export type Fill = "blur" | "black" | "white";
export type Corner = "tl" | "tr" | "bl" | "br";
export type Flip = "none" | "h" | "v" | "hv"; // mirror left-right, upside down, both
export type Seam = 0 | 24 | 64; // softened band (px) where the two videos meet: tajam | halus | lembut
export type EditorSettings = {
  layout: Layout;
  size: Size;
  ratio: number; // side/stack: the original's share of the frame, 20–80 (%)
  fitOriginal: Fit;
  fitGame: Fit;
  fill: Fill;
  pipMain: "original" | "game"; // reaction: which video fills the frame
  pipCorner: Corner; // reaction: where the small one sits
  pipSize: number; // reaction: small video width, 20–50 (% of the frame width)
  volOriginal: number; // 0–150 (%)
  volGame: number; // 0–100 (%)
  flipOriginal: Flip;
  flipGame: Flip;
  seam: Seam; // side/stack only
};
export const DEFAULT_SETTINGS: EditorSettings = {
  layout: "side",
  size: "1080x1920",
  ratio: 50,
  fitOriginal: "cover",
  fitGame: "cover",
  fill: "blur",
  pipMain: "original",
  pipCorner: "br",
  pipSize: 35,
  volOriginal: 100,
  volGame: 0,
  flipOriginal: "none",
  flipGame: "none",
  seam: 0,
};
export const RATIO_RANGE = [20, 80] as const;
export const PIP_RANGE = [20, 50] as const;
