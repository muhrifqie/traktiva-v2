---
name: affiliate-video-producer
description: Plan and produce a TikTok Shop / Reels / Shorts affiliate video for a product, grounded in measured best-seller data and in Traktiva's own pipeline (Flow images + Omni clips, Cartesia one-take voice-over, timeline editor). Use when the owner asks for a video idea, hook, script, storyboard, caption/hashtags, a "production pack", A/B variations, or to turn a product (KaloData link/ID, TikTok product, name, photo) into a Traktiva video project. Not for editing the Traktiva code itself.
---

# Affiliate Video Producer (Traktiva)

Turn a product into a ready-to-shoot / ready-to-generate affiliate video plan, then (if asked) build it in Traktiva. Output to the owner is casual Indonesian; Flow image/motion prompts stay English.

Ground every creative choice in data, not taste: `references/research-formats.md` (30 best-selling KaloData videos, measured) and `references/compliance.md`. If a claim is not in those files or in the product data, do not invent it.

## Workflow

1. **Input check.** Need at least one of: KaloData product ID/link, TikTok product ID, clear product name + price, or product photos. If none, ask for one in one short line. Never ask more than the missing brief fields (format, duration, audience); `rekomendasikan` = choose for them.
2. **Product facts.** Prefer real data over guesses:
   - KaloData: `kaloDetail(id, country)` (app/(dashboard)/kalodata/actions.ts) → price, rating, sold, top videos & creators. Each detail costs ~6 requests of the daily DETAIL quota; reuse the 24 h cache.
   - Top videos of the product or market: `kaloTopVideos` / `scripts/collect-kalo-videos.mts` + `analyze-kalo-videos.mts` + `transcribe-kalo-videos.py` when the owner wants fresh style data.
   - Write down: name, price (as sold), 3 visible selling points, audience, likely objection.
3. **Pick the format** (table in research-formats.md): Review (talking, default for most products), Estetik (music-only, fashion/beauty visuals), Demo cepat (gadgets). State the reason in one line.
4. **Pick duration + scene count** with Flow's clip length (Omni, 4–10 s per clip, default 6): Estetik 15–20 s (2–3 clips), Review 30–40 s (5 clips × 6–8 s), Demo 25–35 s (5–6 short clips). Longer = more Flow generations (time, quota, Google-account limit risk) — say so when going above 5 clips.
5. **Write the pack** using `references/pack-template.md` (full or quick mode). Hooks, script and CTA follow research-formats.md; claims pass compliance.md.
6. **Build it in Traktiva** only when asked:
   - New project from KaloData: `createVideoFromKalo(productId, country)` (uses the best-selling video's frames as style references), or Studio → choose a concept preset (`lib/presets.ts`).
   - Scenes: put the storyboard into the scene labels/prompts; `writeScenes` (lib/prompt-writer.ts) already applies the research rules (product visible from frame 0, ~2.5 words/s, hook patterns, spoken CTA).
   - Voice: one take is better than per-scene lines — editor Audio tab → "Voice-over utuh" (`draftFullScript` + `makeFullVoice`), then "Pas-kan klip ke suara" to cut silence.
   - Finish: Efek tab → "Format video laris" (Review / Estetik / Demo cepat), SFX otomatis, music from Pustaka (royalty-free only), export (−15 LUFS).
7. **Close** with one concrete next step (pick an angle, approve the script, start render, or export).

## Rules

- Product visible in the first frame; first spoken line is the hook (0–3 s); CTA is spoken ("cek keranjang di bawah"). Price badges, CTA stickers and flashy transitions were used by 0/30 best sellers: add them only if the owner asks.
- Text on screen stays small (Minimal preset, 1–2 word subtitles, or a 2-line "info" text at the top).
- Variations for testing = change the hook and format, keep the body; 3 versions max per run (AI Director in the editor does this).
- Automation on TikTok/Google accounts: mention ban/limit risk when a plan needs many generations or posts.
- Music must be royalty-free (Pixabay, YouTube Audio Library) or added later as a TikTok in-app sound; never rip copyrighted songs.
