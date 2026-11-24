import {
  Anton, Archivo_Black, Bangers, Bebas_Neue, Bricolage_Grotesque, Caveat, Dela_Gothic_One, DM_Serif_Display, Instrument_Serif, Lilita_One,
  Montserrat, Oswald, Pacifico, Permanent_Marker, Playfair_Display, Plus_Jakarta_Sans, Poppins, TikTok_Sans, Unbounded,
} from "next/font/google";
import type { CSSProperties } from "react";
import { CAPTION_FONTS, fontOf, registerCaptionFonts, type CaptionFont } from "@/lib/edit";

// Caption fonts, self-hosted by next/font (downloaded at build time, shipped with the app, work offline in Electron).
// Variable fonts (no weight given) carry every weight, so the "tipis" (light) toggle needs no extra files.
// Imported by the editor only; lib/edit.ts stays free of next/* so scripts and the server can use it.
// TikTok Sans is not in next/font's fallback-metrics list: no metric-adjusted fallback (silences a warning on every compile)
const tiktok = TikTok_Sans({ subsets: ["latin"], display: "block", adjustFontFallback: false, fallback: ["Arial", "sans-serif"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "block" });
const montserrat = Montserrat({ subsets: ["latin"], display: "block" });
const archivo = Archivo_Black({ subsets: ["latin"], display: "block", weight: "400" });
const anton = Anton({ subsets: ["latin"], display: "block", weight: "400" });
const bebas = Bebas_Neue({ subsets: ["latin"], display: "block", weight: "400" });
const instrument = Instrument_Serif({ subsets: ["latin"], display: "block", weight: "400", style: "italic" });
const dmserif = DM_Serif_Display({ subsets: ["latin"], display: "block", weight: "400" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "block" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "block" });
const poppins = Poppins({ subsets: ["latin"], display: "block", weight: ["600", "800"] });
const caveat = Caveat({ subsets: ["latin"], display: "block" });
const lilita = Lilita_One({ subsets: ["latin"], display: "block", weight: "400" });
const unbounded = Unbounded({ subsets: ["latin"], display: "block" });
const dela = Dela_Gothic_One({ subsets: ["latin"], display: "block", weight: "400" });
const oswald = Oswald({ subsets: ["latin"], display: "block" });
const bangers = Bangers({ subsets: ["latin"], display: "block", weight: "400" });
const pacifico = Pacifico({ subsets: ["latin"], display: "block", weight: "400" });
const marker = Permanent_Marker({ subsets: ["latin"], display: "block", weight: "400" });

const FAMILIES: Partial<Record<CaptionFont, string>> = {
  tiktok: tiktok.style.fontFamily,
  jakarta: jakarta.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  archivo: archivo.style.fontFamily,
  anton: anton.style.fontFamily,
  bebas: bebas.style.fontFamily,
  instrument: instrument.style.fontFamily,
  dmserif: dmserif.style.fontFamily,
  playfair: playfair.style.fontFamily,
  bricolage: bricolage.style.fontFamily,
  poppins: poppins.style.fontFamily,
  caveat: caveat.style.fontFamily,
  lilita: lilita.style.fontFamily,
  unbounded: unbounded.style.fontFamily,
  dela: dela.style.fontFamily,
  oswald: oswald.style.fontFamily,
  bangers: bangers.style.fontFamily,
  pacifico: pacifico.style.fontFamily,
  marker: marker.style.fontFamily,
};
registerCaptionFonts(FAMILIES);

/** Make sure every caption font (both weights) is loaded before the canvas measures or draws with it. */
export async function loadCaptionFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    CAPTION_FONTS.filter((f) => FAMILIES[f.id]).flatMap((f) =>
      [f.weight, f.light].filter(Boolean).map((w) => document.fonts.load(`${f.italic ? "italic " : ""}${w} 40px ${FAMILIES[f.id]}`).catch(() => [])),
    ),
  );
}

/** CSS for showing text in a caption font (font picker). */
export const fontPreview = (id: CaptionFont): CSSProperties => {
  const f = fontOf(id);
  return { fontFamily: FAMILIES[id] ?? '"Segoe UI", sans-serif', fontWeight: f.weight, fontStyle: f.italic ? "italic" : undefined };
};
