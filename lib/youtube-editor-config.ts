// YouTube → Editor settings, shared by the server renderer (lib/youtube-editor.ts), settings.json and the client panel.

export type Layout = "side" | "stack"; // kiri-kanan | atas-bawah
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
export type EditorSettings = { layout: Layout; size: Size; ratio: 50 | 60 | 70; fitOriginal: Fit; fitGame: Fit; fill: Fill };
export const DEFAULT_SETTINGS: EditorSettings = { layout: "side", size: "1080x1920", ratio: 50, fitOriginal: "cover", fitGame: "cover", fill: "blur" };
