// YouTube → Editor settings, shared by the server renderer (lib/youtube-editor.ts) and the client panel.

export type Layout = "side" | "stack"; // kiri-kanan | atas-bawah
export const SIZES = { "1080x1920": "1080×1920 · Shorts", "720x1280": "720×1280 · ringan", "1080x1080": "1080×1080 · persegi", "1920x1080": "1920×1080 · landscape" } as const;
export type Size = keyof typeof SIZES;
/** cover = fill its part (cropped); contain = whole video, the rest filled with a blurred copy of itself */
export type Fit = "cover" | "contain";
export type EditorSettings = { layout: Layout; size: Size; ratio: 50 | 60 | 70; fitOriginal: Fit; fitGame: Fit };
export const DEFAULT_SETTINGS: EditorSettings = { layout: "side", size: "1080x1920", ratio: 50, fitOriginal: "cover", fitGame: "cover" };
