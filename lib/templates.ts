import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import pkg from "@/package.json";
import { DATA_DIR } from "@/lib/db";
import { DEFAULT_CAPTION_STYLE, DEFAULT_FX, DEFAULT_SAFE, type EditTemplate } from "@/lib/edit";
import { newerVersion, serverInfo } from "@/lib/server-info";

// "Galeri template" from the license server (server/license/templates.mjs): Electron writes DATA_DIR/templates.json
// whenever the admin changes the gallery (electron/license.js). Data only: concepts run through the free-form preset
// like the owner's own concepts, styles are EditTemplates, scripts are filled with the product's name and price.
// Every row is checked again here: a bad one is skipped, never breaks the page. Missing file (dev/web) = empty gallery.

const url = z.string().url().startsWith("https://").nullable().catch(null);
const Base = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(80),
  summary: z.string().max(300).catch(""),
  category: z.string().max(40).catch(""),
  cover: url,
  preview: url,
  minApp: z.string().catch(""),
  updatedAt: z.number().catch(0),
});
const Konsep = Base.extend({
  kind: z.literal("konsep"),
  data: z.object({
    idea: z.string().min(10).max(1500),
    scenes: z.number().int().min(1).max(12),
    background: z.string().max(300).catch("auto"),
    cast: z.string().max(300).catch(""),
    mood: z.enum(["natural", "energetic", "elegant", "funny"]).catch("natural"),
    voice: z.enum(["female", "male", "none"]).catch("female"),
    hook: z.string().max(150).catch(""),
    bestFor: z.string().max(150).catch(""),
  }),
});
const Naskah = Base.extend({
  kind: z.literal("naskah"),
  data: z.object({ hint: z.string().max(120).catch(""), ai: z.string().max(200).catch(""), lines: z.array(z.string().min(20).max(600)).min(1).max(12) }),
});
const Overlay = z.object({
  kind: z.enum(["judul", "harga", "cta", "info"]),
  text: z.string().min(1).max(200),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  size: z.number().min(0.02).max(0.2),
  anim: z.enum(["none", "fade", "pop", "naik", "sapu", "zoom", "kiri", "pantul"]),
  from: z.number().min(0).max(1),
  to: z.number().min(0).max(1),
});
const Gaya = Base.extend({
  kind: z.literal("gaya"),
  data: z.object({
    captionStyle: z.record(z.string(), z.union([z.string().max(20), z.number(), z.boolean(), z.null()])).catch({}),
    fx: z.object({ transition: z.enum(["none", "zoom", "flash", "gelap"]), kenburns: z.boolean() }).catch(DEFAULT_FX),
    overlays: z.array(Overlay).max(8).catch([]),
    captions: z.union([z.literal("keep"), z.literal("none"), z.number().int().min(1).max(6)]).catch("keep"),
    note: z.string().max(300).catch(""),
  }),
});
const Row = z.discriminatedUnion("kind", [Konsep, Naskah, Gaya]);

export type ServerConcept = z.infer<typeof Konsep>;
export type ServerScript = z.infer<typeof Naskah>;
export type ServerStyle = z.infer<typeof Gaya>;
export type ServerTemplate = z.infer<typeof Row>;

/** Recently added or changed (badge "Baru"). */
export const NEW_DAYS = 3;

/** The gallery this app may show: valid rows, for this app version. */
export function serverTemplates(): { at: number | null; list: ServerTemplate[] } {
  let raw: { at?: number; templates?: unknown[] };
  try {
    raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "templates.json"), "utf8"));
  } catch {
    return { at: null, list: [] };
  }
  const version = serverInfo()?.appVersion || pkg.version;
  const list = (raw.templates ?? []).flatMap((t) => {
    const r = Row.safeParse(t);
    return r.success && (!r.data.minApp || !newerVersion(r.data.minApp, version)) ? [r.data] : [];
  });
  return { at: raw.at ?? null, list };
}
export const serverConcepts = () => serverTemplates().list.filter((t): t is ServerConcept => t.kind === "konsep");
export const serverScripts = () => serverTemplates().list.filter((t): t is ServerScript => t.kind === "naskah");
export const serverStyles = () => serverTemplates().list.filter((t): t is ServerStyle => t.kind === "gaya");

/** A server style as the editor's EditTemplate ("Pakai" in Format video laris). */
export function styleTemplate(t: ServerStyle): EditTemplate {
  return {
    id: `tpl-${t.id}`,
    name: t.title,
    note: t.data.note || t.summary,
    captionStyle: { ...DEFAULT_CAPTION_STYLE, ...(t.data.captionStyle as Partial<EditTemplate["captionStyle"]>) },
    safe: DEFAULT_SAFE,
    fx: t.data.fx,
    overlays: t.data.overlays,
    captions: t.data.captions,
  };
}

/** Server scripts as voice-over styles (lib/vo-templates.ts builds the fill functions on either side). */
export const scriptStyles = () => serverScripts().map((t) => ({ id: `tpl-${t.id}`, label: t.title, hint: t.data.hint || t.summary, ai: t.data.ai || t.data.hint || t.title, lines: t.data.lines }));

/** Everything the gallery cards need (Galeri Template page, Buat Video Reels). */
export function galleryCards() {
  const { at, list } = serverTemplates();
  const fresh = (t: ServerTemplate) => Date.now() / 1000 - t.updatedAt < NEW_DAYS * 86400;
  const base = (t: ServerTemplate) => ({ id: t.id, title: t.title, summary: t.summary, category: t.category, fresh: fresh(t) });
  return {
    at,
    concepts: list.flatMap((t) => (t.kind === "konsep" ? [{ ...base(t), cover: t.cover, preview: t.preview, scenes: t.data.scenes, voice: t.data.voice, bestFor: t.data.bestFor, idea: t.data.idea }] : [])),
    styles: list.flatMap((t) => (t.kind === "gaya" ? [{ ...base(t), cover: t.cover, preview: t.preview, note: t.data.note }] : [])),
    scripts: list.flatMap((t) => (t.kind === "naskah" ? [{ ...base(t), hint: t.data.hint, lines: t.data.lines }] : [])),
  };
}
