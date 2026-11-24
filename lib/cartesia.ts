import "server-only";

// Cartesia Sonic text-to-speech (https://docs.cartesia.ai). Used for natural Indonesian voice-over that is
// mixed onto the Flow clips. The API key lives in local settings only (never sent to the browser).

const API = "https://api.cartesia.ai";
const VERSION = "2026-08-14";
export const CARTESIA_MODEL = "sonic-3.6";

export type CartesiaVoice = { id: string; name: string; description: string; gender: string | null; language: string };

async function call<T>(key: string, path: string, init: RequestInit = {}): Promise<{ res: Response; json?: T }> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": VERSION, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("API key Cartesia ditolak. Cek lagi key-nya di Pengaturan.");
    if (res.status === 402 || /credit|quota|insufficient/i.test(text)) throw new Error("Kredit Cartesia habis.");
    throw new Error(`Cartesia ${res.status}: ${text.slice(0, 160)}`);
  }
  return { res };
}

/** Voices that speak a language (default Indonesian), newest API shape: { data: [...] }. */
export async function listVoices(key: string, language = "id"): Promise<CartesiaVoice[]> {
  const out: CartesiaVoice[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ language, limit: "100", ...(after ? { starting_after: after } : {}) });
    const { res } = await call(key, `/voices?${q}`);
    const j = (await res.json()) as { data?: Record<string, unknown>[]; has_more?: boolean };
    const list = j.data ?? [];
    for (const v of list) {
      out.push({
        id: String(v.id),
        name: String(v.name ?? "Tanpa nama"),
        description: String(v.description ?? ""),
        gender: (v.gender as string) ?? null,
        language: String(v.language ?? language),
      });
    }
    if (!j.has_more || !list.length) break;
    after = String(list[list.length - 1].id);
  }
  return out;
}

/** Speak one line → WAV bytes (44.1 kHz, 16-bit). `speed` 0.6–1.5 (guidance, not exact). */
export async function synthesize(key: string, text: string, voiceId: string, opts: { language?: string; speed?: number } = {}): Promise<Buffer> {
  const { res } = await call(key, "/tts/bytes", {
    method: "POST",
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      language: opts.language ?? "id",
      output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
      ...(opts.speed && opts.speed !== 1 ? { generation_config: { speed: Math.min(1.5, Math.max(0.6, opts.speed)) } } : {}),
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}

export type WordTime = { word: string; start: number; end: number };

/**
 * Speak a whole script with word-level timestamps (SSE endpoint) → WAV bytes + when each word is spoken.
 * Used for the one-take voice-over, so subtitles and karaoke follow the real speech instead of an estimate.
 */
export async function synthesizeTimed(key: string, text: string, voiceId: string, opts: { language?: string; speed?: number } = {}): Promise<{ wav: Buffer; words: WordTime[] }> {
  const RATE = 44100;
  const res = await fetch(`${API}/tts/sse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Cartesia-Version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      language: opts.language ?? "id",
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: RATE },
      add_timestamps: true,
      ...(opts.speed && opts.speed !== 1 ? { generation_config: { speed: Math.min(1.5, Math.max(0.6, opts.speed)) } } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("API key Cartesia ditolak. Cek lagi key-nya di Pengaturan.");
    if (res.status === 402 || /credit|quota|insufficient/i.test(t)) throw new Error("Kredit Cartesia habis.");
    throw new Error(`Cartesia ${res.status}: ${t.slice(0, 160)}`);
  }
  const chunks: Buffer[] = [];
  const words: WordTime[] = [];
  for (const line of (await res.text()).split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    let ev: { type?: string; data?: string; word_timestamps?: { words: string[]; start: number[]; end: number[] }; title?: string; message?: string; error?: string };
    try {
      ev = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (ev.type === "chunk" && ev.data) chunks.push(Buffer.from(ev.data, "base64"));
    else if (ev.type === "timestamps" && ev.word_timestamps) {
      const w = ev.word_timestamps;
      w.words.forEach((word, i) => words.push({ word, start: w.start[i], end: w.end[i] }));
    } else if (ev.type === "error") throw new Error(`Cartesia: ${ev.title ?? ""} ${ev.message ?? ev.error ?? ""}`.trim());
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error("Cartesia tidak mengirim audio.");
  // 44-byte WAV header for 16-bit mono PCM
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([h, pcm]), words };
}

export const maskKey =(k: string) => (k.length > 12 ? `${k.slice(0, 8)}…${k.slice(-4)}` : "••••");
