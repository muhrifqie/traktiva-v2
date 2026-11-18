import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { googleAccounts, type VideoProject } from "@/lib/db/schema";
import { askGemini, extractJson } from "@/lib/platforms/gemini";
import { isSilent, presetById } from "@/lib/presets";

// Gemini writes the storyboard prompts: realistic phone-shot UGC that doesn't look AI-made,
// with casual Indonesian voice-over. Visual prompts stay English (Flow follows English best).

/** Mention the brand by name so Gemini anchors the logo instructions (brand comes from the product details). */
function brandHint(p: VideoProject) {
  const brand = p.product.details.match(/brand ([^,]+)/i)?.[1]?.trim();
  return brand ? ` (the "${brand}" logo)` : "";
}

export type WrittenScene = { label: string; imagePrompt: string; motionPrompt: string };

function brief(p: VideoProject, only?: number) {
  const preset = presetById(p.presetId);
  const silent = isSilent(p.presetId, p.options);
  const scenes = p.scenes.map((s, i) => ({ no: i + 1, label: s.label, hasStyleReference: !!s.styleRef, currentImagePrompt: s.imagePrompt, currentMotionPrompt: s.motionPrompt }));
  const target = only != null ? `Rewrite ONLY scene number ${only + 1} ("${p.scenes[only]?.label}"). Return a JSON array with exactly ONE object.` : `Rewrite ALL ${p.scenes.length} scenes, same order and count. Return a JSON array with ${p.scenes.length} objects.`;
  return `You are a senior TikTok Shop affiliate UGC director and an expert prompt writer for Google Flow (image model "Nano Banana" makes the first frame, video model "Omni" animates it for ${p.clipSec} seconds).

PRODUCT
- Name: ${p.product.name}
- Details: ${p.product.details || "-"}
- Price: ${p.product.price || "-"}
- The product photos are given to the image model as references, so always say the product must look exactly like the reference photos (shape, color, logo, packaging).

VIDEO CONCEPT: ${preset?.title ?? p.presetId} — ${preset?.summary ?? ""}
Audience: Indonesian TikTok shoppers. Final video = all scenes joined in order.
${p.options.refCaption ? `Caption of the best-selling reference video (match its vibe, never copy it word for word): "${p.options.refCaption}"` : ""}
Scenes marked hasStyleReference have a frame from a best-selling video attached: the shot should borrow that frame's camera angle, framing and lighting.
Voice-over: ${silent ? "NONE. The video is silent (music is added later). Motion prompts must say: no speech, no music, only soft natural ambient sound." : "yes, a natural Indonesian voice speaks in each clip."}

CURRENT SCENES (JSON) — use them ONLY to understand each scene's intent. Do NOT reuse their wording; write new, much more detailed prompts:
${JSON.stringify(scenes)}

EXAMPLE of the motion detail we want (different product, do not copy):
"Starts exactly on the first frame: a woman's left hand holds the serum bottle at chest height, label facing the lens. Over 6 seconds she slowly tilts the bottle about 20 degrees toward the window so light runs across the glass, then unscrews the gold cap with her right hand in two small, unhurried turns and lifts it a few centimeters. The bottle, label and cap keep the same shape and size the whole time; fingers stay on the surface with natural pressure. Phone camera held by the other person with a gentle sway, same warm afternoon light, background unchanged. Voice says: "Teksturnya ringan banget, cepet meresap."

WRITE FOR REALISM (must not look AI-generated):
- imagePrompt (English, 90–140 words): describe ONE concrete moment like a real phone photo by a normal person: shot type and distance, smartphone main camera look (around 26mm, natural depth of field), real Indonesian home or everyday location with a few believable everyday objects, natural window or room light with soft real shadows, real hands with visible skin texture (pores, small creases, natural nails), product held or used naturally, slight imperfections (minor clutter, slight tilt, mild sensor grain). Vertical 9:16. No text, captions, stickers or watermarks added to the image.
- NEVER use words like: perfect, flawless, ultra, hyperrealistic, 8k, 4k, cinematic, masterpiece, studio lighting, dramatic, award-winning, octane, render, CGI.

BRANDING & LOGO (very important, AI often breaks this):
- The product's brand logo, wordmark and printed text must be reproduced EXACTLY as in the reference photos: same letters, spelling, font style, color, size and position on the product${brandHint(p)}. Say where the logo sits (e.g. "the logo on the side panel stays clearly visible and sharp").
- Keep the logo facing the camera or at a readable angle in at least the hook and the last scene; never cover it with fingers.
- Never invent new text, slogans, extra logos, fake labels or price tags; never mirror or warp the lettering.
- Keep packaging, colors and materials true to the photos (no color shift, no added patterns).

MOTION CONTINUITY (the #1 giveaway of AI video):
- motionPrompt (English, 50–90 words) describes ONE continuous take of ${p.clipSec} seconds that starts exactly from the first-frame image: no cuts, no scene change, no zoom jumps, no teleporting.
- One simple action at real-time human speed, smooth and steady from start to end (e.g. slowly rotate the product 30 degrees, lift it toward the lens, press, open, wear). Describe the start pose, the movement, and the end pose.
- The product keeps the exact same shape, size, color, logo and number of parts for the whole clip: no morphing, melting, flickering, duplicating, or objects appearing/disappearing. Background, lighting and shadows stay consistent.
- Hands: anatomically correct, five fingers, a natural grip with believable contact and weight; fingers never pass through the product.
- Camera: handheld phone with very light natural sway only, or a slow push-in. No spinning, no fast pans, no sudden speed changes.
- People: prefer hands-only or face partly out of frame; if a face is visible it stays the same person with natural, small expressions.
- ${silent ? "End with: no speech, no music, soft natural ambient sound only." : `Voice line in casual everyday Indonesian (light Jakarta slang is fine, like talking to a friend), spoken from the very first second at a brisk natural pace of about 2.5 words per second (max ${Math.round(p.clipSec * 2.5)} words, must fit inside the clip), written as: Voice says: "..." — lip movement only if a mouth is visible.`}

STORY
- Keep the scene "label" short (1–3 words, Indonesian).
- Scenes flow as one story: hook in the first scene, proof/benefit in the middle, a call to action at the end. Consecutive scenes keep the same location, lighting and hands so the joined video looks like one person filmed it.
- The product is clearly visible from the very first frame of the first scene (true for all 30 best-selling videos we studied).
${silent ? "" : `- Hook (first voice line) uses one proven pattern from best-selling Indonesian affiliate videos: price anchor ("looknya kayak jutaan, padahal cuma ..."), a "stop doing X" line ("di rumah jangan pakai daster terus"), a demo challenge ("kalian bisa gini ga?"), or "lagi rame/booming". Only quote a price that is in the product data.
- Last voice line = spoken CTA: "cek keranjang kuning" (or "link di kiri bawah") plus light urgency ("mumpung masih promo", "sebelum kehabisan") only if it fits the product data; never invent discounts, stock limits or fake claims.`}

${target}
Output ONLY the JSON, no explanation: [{"label":"...","imagePrompt":"...","motionPrompt":"..."}]`;
}

/** First logged-in Google account (its Camoufox profile carries the Gemini session). */
export async function geminiAccount() {
  const g = await db.select().from(googleAccounts).where(and(eq(googleAccounts.status, "active"))).get();
  if (!g) throw new Error("Tambahkan akun Google di Pengaturan AI dulu (dipakai untuk Gemini).");
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
  const answer = await askGemini(g.sessionKey, brief(p, only));
  const list = extractJson<WrittenScene[]>(answer);
  const want = only != null ? 1 : p.scenes.length;
  if (!Array.isArray(list) || list.length < want) throw new Error("Jawaban Gemini tidak lengkap. Coba lagi.");
  const clean = (list: WrittenScene[]) =>
    list.slice(0, want).map((s, i) => ({
      label: String(s.label || p.scenes[only ?? i]?.label || `Adegan ${i + 1}`).slice(0, 60),
      imagePrompt: fixLogoWording(String(s.imagePrompt ?? "")).slice(0, 2000),
      motionPrompt: fixLogoWording(String(s.motionPrompt ?? "")).slice(0, 2000),
    }));
  let out = clean(list);
  // Gemini sometimes answers too briefly: ask once more, insisting on the length
  if (out.some((s) => words(s.motionPrompt) < 40 || words(s.imagePrompt) < 60)) {
    const retry = await askGemini(g.sessionKey, `${brief(p, only)}

Your previous answer was too short. Every imagePrompt must be at least 90 words and every motionPrompt at least 50 words. Output ONLY the JSON.`);
    const again = clean(extractJson<WrittenScene[]>(retry));
    if (again.length >= want) out = again;
  }
  return out;
}
