// "Galeri template": concepts, editor styles and voice-over scripts the admin publishes from the panel. They reach
// every app with the license session (server.mjs → session): the app sends the revision it has, the server answers
// with the whole list only when it changed. Templates are DATA only (no code): the app fills them in itself.
// Media (cover image, preview video) are files in TEMPLATE_MEDIA_DIR, served by nginx at TEMPLATE_MEDIA_URL.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit, db, getSetting, setSetting } from "./lib.mjs";

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('konsep','gaya','naskah')),
    title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
    cover TEXT, preview TEXT,                         -- public URLs (TEMPLATE_MEDIA_URL/…)
    data TEXT NOT NULL,                               -- JSON, shape per kind (cleanData)
    min_app TEXT NOT NULL DEFAULT '',                 -- '' = every app version
    active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), actor TEXT
  );
`);

export const MEDIA_DIR = process.env.TEMPLATE_MEDIA_DIR || "/srv/traktiva-download/templates";
export const MEDIA_URL = (process.env.TEMPLATE_MEDIA_URL || "https://download.traktiva.site/templates").replace(/\/+$/, "");
const MEDIA_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/webm": "webm" };
export const MEDIA_MAX = 12 * 1024 * 1024;

/** Bumped on every change; the app compares it with the one it has. */
export const templatesRev = () => Number(getSetting("templates_rev", 0)) || 0;
const bump = () => setSetting("templates_rev", templatesRev() + 1);

/** What the app gets: live templates only, newest first within the admin's order. */
export function publicTemplates() {
  return db
    .prepare("SELECT id, kind, title, summary, category, cover, preview, data, min_app AS minApp, updated_at AS updatedAt FROM templates WHERE active = 1 ORDER BY sort DESC, id DESC LIMIT 300")
    .all()
    .map((t) => ({ ...t, data: JSON.parse(t.data) }));
}

// ---------------------------------------------------------------- validation (the app checks again with zod)

const str = (v, max, min = 0, label = "Isian") => {
  const s = String(v ?? "").trim();
  if (s.length < min) throw new Error(`${label} minimal ${min} karakter.`);
  return s.slice(0, max);
};
const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const COLOR = /^#[0-9a-f]{6}$/i;

const ANIMS = ["none", "fade", "pop", "naik", "sapu", "zoom", "kiri", "pantul"];
/** Editor style: a partial caption look + effects + overlays (times as fractions of the video). */
function cleanStyle(d) {
  const cs = d.captionStyle && typeof d.captionStyle === "object" && !Array.isArray(d.captionStyle) ? d.captionStyle : {};
  const captionStyle = {};
  for (const [k, v] of Object.entries(cs).slice(0, 30)) {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
    if (typeof v === "boolean" || v === null) captionStyle[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) captionStyle[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === "string" && v.length <= 20) captionStyle[k] = v;
  }
  const overlays = (Array.isArray(d.overlays) ? d.overlays : []).slice(0, 8).map((o) => ({
    kind: oneOf(o?.kind, ["judul", "harga", "cta", "info"], "info"),
    text: str(o?.text, 200, 1, "Teks overlay"),
    x: num(o?.x, 0, 1, 0.5),
    y: num(o?.y, 0, 1, 0.2),
    size: num(o?.size, 0.02, 0.2, 0.05),
    anim: oneOf(o?.anim, ANIMS, "fade"),
    from: num(o?.from, 0, 1, 0),
    to: num(o?.to, 0, 1, 1),
  }));
  const fx = { transition: oneOf(d.fx?.transition, ["none", "zoom", "flash", "gelap"], "none"), kenburns: !!d.fx?.kenburns };
  const captions = d.captions === "none" || d.captions === "keep" ? d.captions : Number.isInteger(d.captions) ? num(d.captions, 1, 6, 2) : "keep";
  if (captionStyle.accent && !COLOR.test(captionStyle.accent)) delete captionStyle.accent;
  return { captionStyle, fx, overlays, captions, note: str(d.note, 300) };
}

/** Data per kind; throws a message the panel shows. */
export function cleanData(kind, d = {}) {
  if (kind === "konsep") {
    return {
      idea: str(d.idea, 1500, 10, "Ide video"),
      scenes: Math.round(num(d.scenes, 1, 12, 3)),
      background: str(d.background, 300) || "auto",
      cast: str(d.cast, 300),
      mood: oneOf(d.mood, ["natural", "energetic", "elegant", "funny"], "natural"),
      voice: oneOf(d.voice, ["female", "male", "none"], "female"),
      hook: str(d.hook, 150),
      bestFor: str(d.bestFor, 150),
    };
  }
  if (kind === "naskah") {
    // {nama} / {harga}; a [segment] holding {harga} is dropped when the product has no price
    const lines = (Array.isArray(d.lines) ? d.lines : []).map((l) => str(l, 600)).filter((l) => l.length >= 20).slice(0, 12);
    if (!lines.length) throw new Error("Isi minimal 1 naskah (20 karakter atau lebih).");
    return { hint: str(d.hint, 120), ai: str(d.ai, 200), lines };
  }
  if (kind === "gaya") return cleanStyle(d);
  throw new Error("Jenis template tidak dikenal.");
}

const cleanUrl = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!s.startsWith(`${MEDIA_URL}/`) && !/^https:\/\/[^\s"'<>]+$/.test(s)) throw new Error("Alamat media harus https.");
  return s.slice(0, 500);
};
const cleanVersion = (v) => {
  const s = String(v ?? "").trim();
  if (s && !/^\d+\.\d+\.\d+$/.test(s)) throw new Error("Versi minimal app harus seperti 1.4.0 (atau kosong).");
  return s;
};

function cleanRow(b) {
  const kind = oneOf(b.kind, ["konsep", "gaya", "naskah"], null);
  if (!kind) throw new Error("Jenis template tidak dikenal.");
  return {
    kind,
    title: str(b.title, 80, 1, "Judul"),
    summary: str(b.summary, 300),
    category: str(b.category, 40),
    cover: cleanUrl(b.cover),
    preview: cleanUrl(b.preview),
    data: JSON.stringify(cleanData(kind, b.data)),
    min_app: cleanVersion(b.minApp),
    sort: Math.round(num(b.sort, -1000, 1000, 0)),
  };
}

// ---------------------------------------------------------------- internal API routes (admin panel)

async function readBody(req, max = 65_536) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > max) throw new Error("too large");
  }
  return raw ? JSON.parse(raw) : {};
}
const reply = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const fail = (res, e) => reply(res, 400, { ok: false, message: e instanceof Error ? e.message : String(e) });

export const templateRoutes = {
  "GET /internal/templates": {
    fn: async (_req, res) =>
      reply(res, 200, {
        ok: true,
        rev: templatesRev(),
        mediaUrl: MEDIA_URL,
        templates: db.prepare("SELECT * FROM templates ORDER BY sort DESC, id DESC LIMIT 500").all().map((t) => ({ ...t, data: JSON.parse(t.data) })),
      }),
  },
  "POST /internal/templates": {
    fn: async (req, res, admin) => {
      try {
        const b = await readBody(req);
        const r = cleanRow(b);
        const id = Number(b.id) || 0;
        if (id) {
          const old = db.prepare("SELECT id FROM templates WHERE id = ?").get(id);
          if (!old) return reply(res, 404, { ok: false, message: "Template tidak ditemukan." });
          db.prepare("UPDATE templates SET kind=?, title=?, summary=?, category=?, cover=?, preview=?, data=?, min_app=?, sort=?, updated_at=unixepoch(), actor=? WHERE id=?")
            .run(r.kind, r.title, r.summary, r.category, r.cover, r.preview, r.data, r.min_app, r.sort, admin.name, id);
        } else {
          db.prepare("INSERT INTO templates (kind, title, summary, category, cover, preview, data, min_app, sort, actor) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .run(r.kind, r.title, r.summary, r.category, r.cover, r.preview, r.data, r.min_app, r.sort, admin.name);
        }
        bump();
        audit(id ? "template_updated" : "template_created", { actor: admin.name, detail: `${r.kind}: ${r.title}` });
        reply(res, 200, { ok: true });
      } catch (e) {
        fail(res, e);
      }
    },
  },
  "POST /internal/templates/:id": {
    fn: async (req, res, admin, id) => {
      const t = db.prepare("SELECT * FROM templates WHERE id = ?").get(Number(id));
      if (!t) return reply(res, 404, { ok: false, message: "Template tidak ditemukan." });
      const { action } = await readBody(req);
      if (action === "delete") db.prepare("DELETE FROM templates WHERE id = ?").run(t.id);
      else if (action === "on" || action === "off") db.prepare("UPDATE templates SET active = ?, updated_at = unixepoch() WHERE id = ?").run(action === "on" ? 1 : 0, t.id);
      else return reply(res, 400, { ok: false, message: "Aksi tidak dikenal." });
      bump();
      audit(`template_${action}`, { actor: admin.name, detail: `${t.kind}: ${t.title}` });
      reply(res, 200, { ok: true });
    },
  },
  // raw file body (content-type = the file's type) → MEDIA_DIR/<random>.<ext>; answers its public URL
  "POST /internal/template-media": {
    fn: async (req, res) => {
      const ext = MEDIA_TYPES[String(req.headers["content-type"] ?? "").split(";")[0].trim()];
      if (!ext) return reply(res, 400, { ok: false, message: "Format harus WebP, JPG, PNG, MP4, atau WebM." });
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MEDIA_MAX) return reply(res, 413, { ok: false, message: "File maksimal 12 MB. Kompres dulu videonya." });
        chunks.push(c);
      }
      if (!size) return reply(res, 400, { ok: false, message: "File kosong." });
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.concat(chunks), { mode: 0o644 });
      reply(res, 200, { ok: true, url: `${MEDIA_URL}/${name}` });
    },
  },
};
