import { Anton, Bangers, Bebas_Neue, Lilita_One, Montserrat, Oswald, Pacifico, Permanent_Marker, Poppins } from "next/font/google";
import { CAPTION_FONTS, registerCaptionFonts, type CaptionFont } from "@/lib/edit";

// Caption fonts, self-hosted by next/font (downloaded at build time, shipped with the app, work offline in Electron).
// Imported by the editor only; lib/edit.ts stays free of next/* so scripts and the server can use it.
const montserrat = Montserrat({ subsets: ["latin"], weight: ["900"], display: "block" });
const poppins = Poppins({ subsets: ["latin"], weight: ["800"], display: "block" });
const anton = Anton({ subsets: ["latin"], weight: ["400"], display: "block" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: ["400"], display: "block" });
const oswald = Oswald({ subsets: ["latin"], weight: ["700"], display: "block" });
const lilita = Lilita_One({ subsets: ["latin"], weight: ["400"], display: "block" });
const bangers = Bangers({ subsets: ["latin"], weight: ["400"], display: "block" });
const pacifico = Pacifico({ subsets: ["latin"], weight: ["400"], display: "block" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: ["400"], display: "block" });

const FAMILIES: Partial<Record<CaptionFont, string>> = {
  montserrat: montserrat.style.fontFamily,
  poppins: poppins.style.fontFamily,
  anton: anton.style.fontFamily,
  bebas: bebas.style.fontFamily,
  oswald: oswald.style.fontFamily,
  lilita: lilita.style.fontFamily,
  bangers: bangers.style.fontFamily,
  pacifico: pacifico.style.fontFamily,
  marker: marker.style.fontFamily,
};
registerCaptionFonts(FAMILIES);

/** Make sure every caption font is loaded before the canvas measures or draws with it. */
export async function loadCaptionFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    CAPTION_FONTS.filter((f) => FAMILIES[f.id]).map((f) => document.fonts.load(`${f.weight} 40px ${FAMILIES[f.id]}`).catch(() => [])),
  );
}

/** CSS font-family for showing a font name in its own face (font picker). */
export const fontPreview = (id: CaptionFont) => FAMILIES[id] ?? '"Segoe UI", sans-serif';
