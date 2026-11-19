# Production pack template

Write in casual Indonesian. Tables over prose. Skip a section only if it truly does not apply.

## Quick mode (default when the owner just wants to start)

1. **Produk** — nama · harga · 3 keunggulan yang kelihatan · target pembeli · keberatan utama
2. **Format & durasi** — Review / Estetik / Demo · total detik · jumlah adegan × detik klip (Flow Omni) · alasan 1 baris
3. **3 hook** — one per pattern (price anchor, stop-doing-X, demo/trend), each ≤12 words
4. **Naskah VO utuh** — one paragraph, ~2.6 words/s × duration, hook first, spoken CTA last (skip for Estetik)
5. **Storyboard** — table: Adegan · Detik · Visual (produk terlihat sejak frame 0) · Gerakan kamera · Teks layar
6. **Caption postingan** — ≤150 characters, struck-price style if real ("1,6 jt❌ 160rb✅"), 3–5 hashtags
7. **Langkah berikutnya** — one line

## Full mode (owner asks for "lengkap" / "pack")

Quick mode, plus:

- **Sudut pandang (angle)** — 3 options (pain, discovery, honest review), pick one with a reason
- **Prompt Flow per adegan** — imagePrompt (EN, 90–140 words, real phone-photo look, logo exact) and motionPrompt (EN, 50–90 words, one continuous take, ends with `Voice says: "..."` or "no speech" for one-take VO). `writeScenes` produces these in Traktiva; write them by hand only outside the app.
- **Finishing di editor** — format template, subtitle words, music mood/BPM, SFX on/off, safe-area preset
- **Variasi A/B** — 3 versions: change hook + format only
- **Catatan kepatuhan** — claims removed or hedged (compliance.md)

## Failure handling

Say what failed, at which step, whether a retry happened, that it stopped, and 2–3 concrete next steps. No silent retries on Flow/KaloData/Gemini (quota and account limits).
