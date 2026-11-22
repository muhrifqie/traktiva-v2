import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { googleAccounts, type VideoProject } from "@/lib/db/schema";
import fs from "node:fs/promises";
import { resolveMedia } from "@/lib/media";
import { askGemini, extractJson, type GeminiImage } from "@/lib/platforms/gemini";
import { askWriter } from "@/lib/writer";
import { writingRules } from "@/lib/settings";
import { applyRules, rulesPrompt } from "@/lib/writing";
import { provenHooksPrompt } from "@/lib/insights";
import { BACKDROPS, castOf, directionOf, EXPLAIN, isSilent, presetById } from "@/lib/presets";

/** The SET line of the writer brief: the chosen backdrop, or a pick-one list when it is "auto". */
const setLine = (bg?: string) =>
  bg && bg !== "auto"
    ? `- Use exactly this set (may be written in Indonesian by the owner; describe it in English in the prompts): ${bg}.`
    : `- Pick ONE set that suits this product and its buyers, then keep it for all scenes:\n${BACKDROPS.slice(1, 10).map((b) => `  • ${b.value}`).join("\n")}`;
import { CAPTION_ANIMS, CAPTION_FONTS, CAPTION_PRESETS, clamp, type CaptionStyle } from "@/lib/edit";

// Gemini writes the storyboard prompts: realistic phone-shot UGC that doesn't look AI-made,
// with casual Indonesian voice-over. Visual prompts stay English (Flow follows English best).

/** Mention the brand by name so Gemini anchors the logo instructions (brand comes from the product details). */
function brandHint(p: VideoProject) {
  const brand = p.product.details.match(/brand ([^,]+)/i)?.[1]?.trim();
  return brand ? ` (the "${brand}" logo)` : "";
}

export type WrittenScene = { label: string; imagePrompt: string; motionPrompt: string };

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Let Gemini LOOK at the product photos once and describe the product as it really is (shape, material/finish,
 * colours, cap/parts, where and how the logo is printed), locked to ONE colour variant. Without this the storyboard
 * prompts are written from the product name alone and invent details (e.g. "shiny stainless, engraved logo,
 * screw lid" for a matte pastel bottle with a printed vertical wordmark and a flip straw cap).
 */
export async function describeProduct(p: VideoProject): Promise<string | null> {
  const photos = p.product.photos.slice(0, 3);
  if (!photos.length) return null;
  const images: GeminiImage[] = [];
  for (const [i, rel] of photos.entries()) {
    const ext = rel.split(".").pop()?.toLowerCase() ?? "png";
    const buf = await fs.readFile(resolveMedia(rel)).catch(() => null);
    if (buf && buf.length < 8 * 1024 * 1024) images.push({ name: `produk-${i + 1}.${ext}`, mime: MIME[ext] ?? "image/png", base64: buf.toString("base64") });
  }
  if (!images.length) return null;
  const brand = p.product.details.match(/brand ([^,]+)/i)?.[1]?.trim() || p.product.name.split(/\s+/)[0];
  const g = await geminiAccount();
  const answer = await askGemini(
    g.sessionKey,
    `These are product photos of "${p.product.name}" (brand: ${brand}). Ignore marketing text, prices and backgrounds in the photos.
Describe the physical product exactly as it looks, for an image generator that must reproduce it: overall shape and proportions, material and surface finish, every visible part (cap/lid, handle, straw, buttons, labels), colours, and the brand logo/wordmark: its exact spelling (the brand name is "${brand}" — use those letters, in the case printed on the product), colour, orientation (horizontal/vertical) and position.
If several colour variants are shown, choose ONE (the most prominent) and describe only that one; say it is the only colour to use.
Output ONLY JSON: {"look":"<English, 50-80 words>","color":"<the chosen colour>"}`,
    images,
  );
  const j = extractJson<{ look?: string; color?: string }>(answer);
  const look = String(j?.look ?? "").replace(/\s+/g, " ").trim();
  if (look.split(" ").length < 15) return null;
  return `${look}${j.color ? ` Use only the ${j.color} variant; show exactly one product (one pair for paired items like shoes).` : ""}`.slice(0, 900);
}

function brief(p: VideoProject, only?: number) {
  const preset = presetById(p.presetId);
  const silent = isSilent(p.presetId, p.options);
  // Rewriting everything: send only each scene's role, not the old prompts — they may hold product details guessed
  // from the name (e.g. "unscrews the lid"), which Gemini then copies. One scene: keep its prompts (maybe hand-edited).
  const firstSentence = (t: string) => t.split(/(?<=[.!?])\s/)[0].slice(0, 160);
  const scenes = p.scenes.map((s, i) =>
    only != null && i === only
      ? { no: i + 1, label: s.label, hasStyleReference: !!s.styleRef, currentImagePrompt: s.imagePrompt, currentMotionPrompt: s.motionPrompt }
      : { no: i + 1, label: s.label, hasStyleReference: !!s.styleRef, intent: firstSentence(s.motionPrompt), spokenLine: s.motionPrompt.match(/["“]([^"”]+)["”]/)?.[1] ?? null },
  );
  const target = only != null ? `Rewrite ONLY scene number ${only + 1} ("${p.scenes[only]?.label}"). Return a JSON array with exactly ONE object.` : `Rewrite ALL ${p.scenes.length} scenes, same order and count. Return a JSON array with ${p.scenes.length} objects.`;
  return `You are a senior TikTok Shop affiliate UGC director and an expert prompt writer for Google Flow (image model "Nano Banana" makes the first frame, video model "Omni" animates it for ${p.clipSec} seconds).

PRODUCT
- Name: ${p.product.name}
- Details: ${p.product.details || "-"}
- Price: ${p.product.price || "-"}
${p.product.look ? `- LOOK (read from the product photos; follow it exactly, it overrides any guess from the name): ${p.product.look}` : ""}
- The product photos are given to the image model as references, so always say the product must look exactly like the reference photos (shape, color, logo, packaging).

VIDEO CONCEPT: ${preset?.title ?? p.presetId} — ${preset?.summary ?? ""}
${directionOf(p) ? `CONCEPT DIRECTION (follow it; where it differs from the generic rules below, this wins): ${directionOf(p)}\n` : ""}${castOf(p) && p.options.face ? `CHARACTER FACE: a face photo of the character is given to the image model as the FIRST reference image. Every imagePrompt must say the ${castOf(p)} is exactly the person in the face reference (same face, facial features and skin tone) and keep the face clearly visible; the other reference images are the product.\n` : ""}${p.options.concept ? `OWNER'S OWN CONCEPT "${p.options.conceptName ?? ""}" (written by the seller in Indonesian; it decides the story, shots and mood, follow it closely): ${p.options.concept}\n` : ""}Audience: Indonesian TikTok shoppers. Final video = all scenes joined in order.
${longBrief(p)}${p.scenes.length === 1 ? `ONE-CLIP VIDEO (${p.clipSec} s, this single clip IS the whole final video): the product is visible from frame 0; in ${p.clipSec} seconds show the hook, one strong benefit in use, and end on the spoken CTA. Max ${Math.round(p.clipSec * 2.5)} spoken words.` : ""}
${p.options.angle ? `STORY ANGLE of this version (other versions of this product use other angles, so this one must feel clearly different): ${p.options.angle}` : ""}
${p.options.refCaption ? `Caption of the best-selling reference video (match its vibe, never copy it word for word): "${p.options.refCaption}"` : ""}
Scenes marked hasStyleReference have a frame from a best-selling video attached: the shot should borrow that frame's camera angle and framing (the SET below still decides the background).

SET (tidy "aesthetic product background" like affiliate product shots on Pinterest/TikTok Shop; the SAME set in every scene so the joined video looks like one shoot):
${setLine(p.options.background)}
- The product is the hero: in the foreground, sharp, centered or on the rule of thirds, standing neatly on the surface; nothing overlaps it.
- At most 1–3 soft props behind it, slightly out of focus, colors that match the product; no clutter, no other branded products, no price tags, no text.
- Clean, styled, calm: soft natural or warm lamp light, gentle shadows, tidy edges; hands (if any) with neat nails and simple sleeves.
Voice-over: ${silent ? "NONE. The video is silent (music is added later). Motion prompts must say: no speech, no music, only soft natural ambient sound." : "yes, a natural Indonesian voice speaks in each clip."}

CURRENT SCENES (JSON) — use them ONLY to understand each scene's intent. Do NOT reuse their wording; write new, much more detailed prompts:
${JSON.stringify(scenes)}

EXAMPLE of the motion detail we want (different product, do not copy):
"Starts exactly on the first frame: a woman's left hand holds the serum bottle at chest height, label facing the lens. Over 6 seconds she slowly tilts the bottle about 20 degrees toward the window so light runs across the glass, then presses the dropper bulb once with her right hand and lifts the dropper a few centimeters. The bottle, label and cap keep the same shape and size the whole time; fingers stay on the surface with natural pressure. Phone camera held by the other person with a gentle sway, same warm afternoon light, background unchanged. Voice says: "Teksturnya ringan banget, cepet meresap."

WRITE FOR REALISM (must not look AI-generated):
- imagePrompt (English, 90–140 words): describe ONE concrete moment like a real phone photo by a normal person: shot type and distance, smartphone main camera look (around 26mm, natural depth of field), real Indonesian home or everyday location with a few believable everyday objects, natural window or room light with soft real shadows, real hands with visible skin texture (pores, small creases, natural nails), product held or used naturally, slight imperfections (minor clutter, slight tilt, mild sensor grain). Vertical 9:16. No text, captions, stickers or watermarks added to the image.
- NEVER use words like: perfect, flawless, ultra, hyperrealistic, 8k, 4k, cinematic, masterpiece, studio lighting, dramatic, award-winning, octane, render, CGI.

BRANDING & LOGO (very important, AI often breaks this):
- The product's brand logo, wordmark and printed text must be reproduced EXACTLY as in the reference photos: same letters, spelling, font style, color, size and position on the product${brandHint(p)}. Say where the logo sits (e.g. "the logo on the side panel stays clearly visible and sharp").
- Keep the logo facing the camera or at a readable angle in at least the hook and the last scene; never cover it with fingers.
- Never invent new text, slogans, extra logos, fake labels or price tags; never mirror or warp the lettering.
- Keep packaging, colors and materials true to the photos (no color shift, no added patterns). ${p.product.look ? "Describe the product with the LOOK above in every imagePrompt (material, finish, parts, colour, logo orientation) and keep the same single colour variant in all scenes; never show several colour variants." : ""}

MOTION CONTINUITY (the #1 giveaway of AI video):
- motionPrompt (English, 50–90 words) describes ONE continuous take of ${p.clipSec} seconds that starts exactly from the first-frame image: no cuts, no scene change, no zoom jumps, no teleporting.
- Actions must fit the product's real parts from the LOOK (a flip-up cap is flipped open, a pump is pressed, a screw cap is twisted); never invent parts or a way of opening it doesn't have.
- One simple action at real-time human speed, smooth and steady from start to end (e.g. slowly rotate the product 30 degrees, lift it toward the lens, press, open, wear). Describe the start pose, the movement, and the end pose.
- The product keeps the exact same shape, size, color, logo and number of parts for the whole clip: no morphing, melting, flickering, duplicating, or objects appearing/disappearing. Background, lighting and shadows stay consistent.
- Hands: anatomically correct, five fingers, a natural grip with believable contact and weight; fingers never pass through the product.
- Camera: handheld phone with very light natural sway only, or a slow push-in. No spinning, no fast pans, no sudden speed changes.
- People: ${castOf(p) ? `the same ${castOf(p)} in every scene with the face clearly visible; identity, hair, makeup and outfit stay consistent, expressions change naturally and smoothly.` : p.options.cast === "none" ? "no people at all, product-only shots." : p.options.cast ? "follow the CONCEPT DIRECTION above for who is on screen and how they are framed." : "prefer hands-only or face partly out of frame; if a face is visible it stays the same person with natural, small expressions."}
- ${silent ? "End with: no speech, no music, soft natural ambient sound only." : `Voice line in casual everyday Indonesian (light Jakarta slang is fine, like talking to a friend), spoken from the very first second at a brisk natural pace of about 2.5 words per second (max ${Math.round(p.clipSec * 2.5)} words, must fit inside the clip), written as: Voice says: "..." — lip movement only if a mouth is visible. Numbers and prices in the voice line are written with DIGITS copied exactly from the product data (e.g. "Rp179.000", "4,8", "3.915 terjual"), never spelled out in words; the app turns them into correct spoken Indonesian.`}

STORY
- Keep the scene "label" short (1–3 words, Indonesian).
- Scenes flow as one story: hook in the first scene, proof/benefit in the middle, a call to action at the end. Consecutive scenes keep the same location, lighting and hands so the joined video looks like one person filmed it.
- The product is clearly visible from the very first frame of the first scene (true for all 30 best-selling videos we studied).
${silent ? "" : `- Hook (first voice line) uses one proven pattern from best-selling Indonesian affiliate videos: price anchor ("looknya kayak jutaan, padahal cuma ..."), a "stop doing X" line ("di rumah jangan pakai daster terus"), a demo challenge ("kalian bisa gini ga?"), or "lagi rame/booming". Only quote a price that is in the product data.
- Last voice line = the spoken call to action from the owner's rules below, plus light urgency ("mumpung masih promo", "sebelum kehabisan") only if it fits the product data; never invent discounts, stock limits or fake claims. Never use absolute words like "dijamin", "100%", "pasti", "paling" and never say "kehabisan"/"stok terbatas"/"sebelum habis" unless the product data says stock is limited; neutral urgency like "mumpung masih promo" only if a promo is in the data, otherwise just the plain call to action.`}

${rulesPrompt(writingRules())}

${target}
Output ONLY the JSON, no explanation: [{"label":"...","imagePrompt":"...","motionPrompt":"..."}]`;
}

/**
 * QC before the expensive clip render: Gemini looks at the real product photos and the generated scene images in
 * ONE call and says per scene whether it shows the same product (shape, colour variant, logo spelling and
 * orientation, exactly one unit, no invented text). Writer ≠ checker: the prompts come from the writer model.
 */
export async function checkSceneImages(p: VideoProject, indices: number[]): Promise<Map<number, { ok: boolean; note: string }>> {
  const out = new Map<number, { ok: boolean; note: string }>();
  const todo = indices.filter((i) => p.scenes[i]?.image);
  if (!todo.length || !p.product.photos.length) return out;
  const load = async (rel: string, name: string): Promise<GeminiImage | null> => {
    const ext = rel.split(".").pop()?.toLowerCase() ?? "png";
    const buf = await fs.readFile(resolveMedia(rel)).catch(() => null);
    return buf && buf.length < 8 * 1024 * 1024 ? { name, mime: MIME[ext] ?? "image/png", base64: buf.toString("base64") } : null;
  };
  const refs = (await Promise.all(p.product.photos.slice(0, 2).map((r, k) => load(r, `produk-${k + 1}.png`)))).filter(Boolean) as GeminiImage[];
  const shots = (await Promise.all(todo.map((i) => load(p.scenes[i].image!, `adegan-${i + 1}.png`)))).filter(Boolean) as GeminiImage[];
  if (!refs.length || !shots.length) return out;
  const g = await geminiAccount();
  const answer = await askGemini(
    g.sessionKey,
    `The first ${refs.length} image(s) are the REAL product photos (ignore marketing text and backgrounds in them). The next ${shots.length} images are AI-generated video frames, in this order: ${todo.map((i) => `scene ${i + 1}`).join(", ")}.
${p.product.look ? `Expected product look: ${p.product.look}` : ""}
For each generated frame, judge strictly whether it shows the SAME product: same shape and parts, same colour variant, brand logo spelled correctly and in the same orientation, exactly one product (items sold in pairs, like shoes, socks or earrings, count as one pair), no invented text, labels or extra products. Ignore background, hands and camera angle.
Output ONLY JSON: [{"scene":1,"ok":true,"note":"<max 12 words in Indonesian: what is wrong, or 'cocok'>"}]`,
    [...refs, ...shots],
  );
  const list = extractJson<{ scene?: number; ok?: boolean; note?: string }[]>(answer);
  for (const r of Array.isArray(list) ? list : []) {
    const i = Number(r.scene) - 1;
    if (todo.includes(i)) out.set(i, { ok: !!r.ok, note: String(r.note ?? "").slice(0, 120) });
  }
  return out;
}

/** Brief lines for "Video Panjang": explanation type + the outline the user approved (one line per scene). */
function longBrief(p: VideoProject) {
  if (p.options.format !== "long") return "";
  const ex = EXPLAIN.find((e) => e.key === p.options.explain) ?? EXPLAIN[2];
  const outline = (p.options.outline ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const head = `LONG EXPLAINER (~${p.scenes.length * p.clipSec} s). Type: ${ex.brief} Every scene is its own beat; never repeat a shot. Keep it engaging: the first 3 seconds still decide if people stay.\n`;
  if (!outline.length) return head;
  return `${head}OUTLINE approved by the user (scene N follows line N; the label of each scene = the chapter title, max 4 words):\n${outline.map((l, k) => `${k + 1}. ${l}`).join("\n")}\n`;
}

/** Gemini drafts the chapter outline of a long explainer: exactly `n` lines "Judul bab: isi singkat" (Indonesian). */
export async function writeOutline(p: VideoProject, n: number): Promise<string[]> {
  const g = await geminiAccount();
  const ex = EXPLAIN.find((e) => e.key === p.options.explain) ?? EXPLAIN[2];
  const ask = `You plan a ${n}-scene vertical TikTok Shop affiliate video in Indonesian (each scene ${p.clipSec} seconds).
Product: ${p.product.name}${p.product.details ? ` (${p.product.details})` : ""}${p.product.price ? `, price ${p.product.price}` : ""}.
${p.product.look ? `Looks like: ${p.product.look}\n` : ""}Video type: ${ex.brief}
Scene 1 is the hook; the last scene ends with the spoken CTA "cek keranjang di bawah". Use only facts from the product info, never invent claims, results or numbers.
${rulesPrompt(writingRules())}
Return ONLY a JSON array of exactly ${n} strings in casual Indonesian, each "Judul bab (max 4 kata): apa yang terjadi/dikatakan di adegan itu (max 18 kata)".`;
  const list = extractJson<string[]>((await askWriter(g.sessionKey, ask)).text);
  if (!Array.isArray(list) || list.length < n) throw new Error("Gemini tidak memberi kerangka yang lengkap. Coba lagi.");
  return list.slice(0, n).map((l) => applyRules(String(l).replace(/\s+/g, " ").trim(), writingRules()).slice(0, 160));
}

/** First logged-in Google account (its Chrome profile carries the Gemini session). */
export async function geminiAccount() {
  const g = await db.select().from(googleAccounts).where(and(eq(googleAccounts.status, "active"))).get();
  if (!g) throw new Error("Tambahkan akun Google di Pengaturan dulu (dipakai untuk Gemini).");
  return g;
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** "No text, logos or watermarks" would tell the model to erase the product's own logo. Keep only "no added" wording. */
const fixLogoWording = (t: string) =>
  t
    .replace(/\bno (?:added )?(?:text|captions?)(?:,| or| and)? (?:logos?|badges?)(?:,| or| and)? (?:or |and )?watermarks?\.?/gi, "No added text or watermarks.")
    .replace(/\bno logos?\b/gi, "no extra logos");

export async function writeScenes(p: VideoProject, only?: number): Promise<WrittenScene[]> {
  const g = await geminiAccount();
  const proven = isSilent(p.presetId, p.options) ? "" : await provenHooksPrompt();
  const parse = (t: string) => {
    try {
      return extractJson<WrittenScene[]>(t);
    } catch {
      return null;
    }
  };
  // Gemini's web app sometimes refuses with a canned line ("I encountered an error…"); the reference caption
  // (hashtags, emoji, urgency words) makes that likelier, so the one retry goes without it
  let list = parse((await askWriter(g.sessionKey, `${brief(p, only)}

${proven}`)).text);
  if (!list) list = parse((await askWriter(g.sessionKey, `${brief({ ...p, options: { ...p.options, refCaption: "" } }, only)}

${proven}`)).text);
  if (!list) throw new Error("Gemini sedang menolak permintaan ini (jawabannya bukan storyboard). Coba lagi sebentar lagi.");
  const want = only != null ? 1 : p.scenes.length;
  if (!Array.isArray(list) || list.length < want) throw new Error("Jawaban Gemini tidak lengkap. Coba lagi.");
  const clean = (list: WrittenScene[]) =>
    list.slice(0, want).map((s, i) => ({
      label: String(s.label || p.scenes[only ?? i]?.label || `Adegan ${i + 1}`).slice(0, 60),
      imagePrompt: fixLogoWording(String(s.imagePrompt ?? "")).slice(0, 2000),
      motionPrompt: applyRules(fixLogoWording(String(s.motionPrompt ?? "")), writingRules()).slice(0, 2000),
    }));
  let out = clean(list);
  // Gemini sometimes answers too briefly: ask once more, insisting on the length
  if (out.some((s) => words(s.motionPrompt) < 40 || words(s.imagePrompt) < 60)) {
    const { text: retry } = await askWriter(g.sessionKey, `${brief(p, only)}

Your previous answer was too short. Every imagePrompt must be at least 90 words and every motionPrompt at least 50 words. Output ONLY the JSON.`);
    const again = clean(extractJson<WrittenScene[]>(retry));
    if (again.length >= want) out = again;
  }
  return out;
}

/**
 * "Tiru gaya video laris": Gemini looks at frames of the project's reference (best-selling) video and picks the
 * closest caption look from what the editor can draw. Returns a sanitized partial style and a short note.
 */
export async function matchCaptionStyle(p: VideoProject): Promise<{ style: Partial<CaptionStyle>; note: string }> {
  const frames = [...new Set(p.scenes.map((s) => s.styleRef).filter((x): x is string => !!x))].slice(0, 4);
  if (!frames.length) throw new Error("Proyek ini belum punya frame video referensi. Buat proyek dari KaloData (Riset → Buat video) supaya ada video laris yang ditiru.");
  const images: GeminiImage[] = [];
  for (const [i, rel] of frames.entries()) {
    const ext = rel.split(".").pop()?.toLowerCase() ?? "jpg";
    const buf = await fs.readFile(resolveMedia(rel)).catch(() => null);
    if (buf && buf.length < 8 * 1024 * 1024) images.push({ name: `frame-${i + 1}.${ext}`, mime: MIME[ext] ?? "image/jpeg", base64: buf.toString("base64") });
  }
  if (!images.length) throw new Error("Frame video referensi tidak ditemukan di folder proyek.");
  const fonts = CAPTION_FONTS.filter((f) => !f.hidden);
  const g = await geminiAccount();
  const answer = await askGemini(
    g.sessionKey,
    `These are frames from a best-selling TikTok Shop video. Look at the on-screen text / subtitles (if any) and describe how they look, so a video editor can copy the style.
Pick the closest values from these options only:
- preset: ${CAPTION_PRESETS.map((x) => x.id).join(", ")} (tiktok = white text with black outline; kuning = yellow with outline; minimal = small white thin outline + soft shadow; bersih = no outline, soft shadow; kotak = dark text on a light box; bubble = rounded pill box; merah = news bar box; neon = glow; komik = thick outline + hard shadow; gradasi = yellow-pink gradient)
- font: ${fonts.map((f) => `${f.id} (${f.label}, ${f.mood})`).join(", ")}
- anim: ${CAPTION_ANIMS.map((a) => a.id).join(", ")} (guess from the style; "none" if plain subtitles)
Output ONLY JSON: {"found":true|false,"preset":"...","font":"...","upper":true|false,"color":"#rrggbb","box":"#rrggbb or null","size":0.03-0.1 (font height / video width),"y":0-1 (vertical centre of the text),"stroke":0-0.3 (outline width / font size, 0 = none),"shadow":0-1,"anim":"...","note":"<one Indonesian sentence: what the text looks like>"}
If there is no on-screen text, set found false and still suggest a look that fits the video's mood.`,
    images,
  );
  const j = extractJson<Record<string, unknown>>(answer) ?? {};
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(clamp(v, lo, hi) * 1000) / 1000 : undefined);
  const style: Partial<CaptionStyle> = {};
  if (CAPTION_PRESETS.some((x) => x.id === j.preset)) style.preset = j.preset as CaptionStyle["preset"];
  if (fonts.some((f) => f.id === j.font)) style.font = j.font as CaptionStyle["font"];
  if (CAPTION_ANIMS.some((a) => a.id === j.anim)) style.anim = j.anim as CaptionStyle["anim"];
  if (typeof j.upper === "boolean") style.upper = j.upper;
  style.color = hex(j.color);
  style.box = hex(j.box);
  const size = num(j.size, 0.035, 0.1), y = num(j.y, 0.1, 0.9), stroke = num(j.stroke, 0, 0.3), shadow = num(j.shadow, 0, 1);
  if (size) style.size = size;
  if (y) style.y = y;
  if (stroke !== undefined) style.stroke = stroke;
  if (shadow !== undefined) style.shadow = shadow;
  if (!style.preset && !style.font) throw new Error("Gemini tidak memberi gaya yang bisa dipakai. Coba lagi.");
  const note = String(j.note ?? "").trim().slice(0, 200);
  return { style, note: j.found === false ? `Video referensi tanpa teks; gaya dipilih dari suasananya. ${note}` : note || "Gaya teks disalin dari video laris." };
}
