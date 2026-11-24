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
export type Shape = "rect" | "round" | "circle";
export const ASPECTS = { "9:16": 9 / 16, "3:4": 3 / 4, "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9 } as const;
export type Aspect = keyof typeof ASPECTS;
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
  // reaction: the small video is a free overlay: position, size, shape, crop, frame
  pipX: number; // 0–100: left edge … right edge of the free space
  pipY: number; // 0–100: top … bottom
  pipSize: number; // width, 15–90 (% of the frame width)
  pipShape: Shape;
  pipAspect: Aspect; // crop shape of the overlay (a circle is always 1:1)
  pipZoom: number; // crop zoom, 100–300 (%)
  pipFocusX: number; // which part stays after cropping, 0–100
  pipFocusY: number;
  pipBorder: 0 | 1 | 2 | 3; // frame: none, thin, medium, thick
  pipBorderColor: "white" | "black";
  gameStart: number; // where the overlay video starts (s); -1 = a random point each render
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
  pipX: 100,
  pipY: 100,
  pipSize: 35,
  pipShape: "round",
  pipAspect: "9:16",
  pipZoom: 100,
  pipFocusX: 50,
  pipFocusY: 50,
  pipBorder: 1,
  pipBorderColor: "white",
  gameStart: -1,
  volOriginal: 100,
  volGame: 0,
  flipOriginal: "none",
  flipGame: "none",
  seam: 0,
};
export const RATIO_RANGE = [20, 80] as const;
export const PIP_RANGE = [15, 90] as const;

export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Reaction overlay in output pixels: x/y/tw/th = outer box (frame included), w/h = the video inside, b = frame, r = corner radius.
 *  Shared by the ffmpeg filter and the monitor, so what you drag is what gets rendered. */
export function pipBox(o: EditorSettings, W: number, H: number) {
  const a = o.pipShape === "circle" ? 1 : ASPECTS[o.pipAspect] ?? 1;
  const b = Math.round(W * 0.005 * o.pipBorder);
  const m = Math.round(Math.min(W, H) * 0.035);
  let w = even((W * Math.min(Math.max(o.pipSize, PIP_RANGE[0]), PIP_RANGE[1])) / 100);
  let h = even(w / a);
  if (h + 2 * b > H - 2 * m) {
    h = even(H - 2 * m - 2 * b);
    w = even(h * a);
  }
  const tw = w + 2 * b;
  const th = h + 2 * b;
  const x = Math.round(m + Math.max(0, W - tw - 2 * m) * (Math.min(Math.max(o.pipX, 0), 100) / 100));
  const y = Math.round(m + Math.max(0, H - th - 2 * m) * (Math.min(Math.max(o.pipY, 0), 100) / 100));
  const r = o.pipShape === "circle" ? w / 2 : o.pipShape === "round" ? Math.round(Math.min(w, h) * 0.12) : 0;
  return { x, y, w, h, tw, th, b, r, m, a };
}
