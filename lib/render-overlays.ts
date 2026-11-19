// Browser only: captions and stickers are drawn on a canvas (same code as the live preview), then burned in by ffmpeg.
import { loadCaptionFonts } from "@/lib/caption-fonts";
import { exportSize, layersOf, round2, type ProjectEdit } from "@/lib/edit";

export /** Draw every caption/sticker still at the export size (1080p) for the ffmpeg export; returns cropped PNGs. */
async function renderOverlays(edit: ProjectEdit) {
  await loadCaptionFonts();
  const { w: W, h: H } = exportSize(edit);
  const full = document.createElement("canvas");
  full.width = W;
  full.height = H;
  const fctx = full.getContext("2d")!;
  return layersOf(edit).map((l) => {
    fctx.clearRect(0, 0, W, H);
    const box = l.draw(fctx, W, H);
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, box.w);
    crop.height = Math.max(1, box.h);
    crop.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return { start: round2(l.start), end: round2(l.end), x: box.x, y: box.y, w: box.w, h: box.h, anim: l.anim, out: !!l.out, png: crop.toDataURL("image/png") };
  });
}

