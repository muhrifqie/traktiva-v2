// Dev check for lib/platforms/tiktok-upload.ts: full upload flow as a DRY RUN (never presses Post).
// Usage: npx tsx --conditions=react-server scripts/try-upload.mts <sessionKey> <mp4> [productId]
import { uploadToTikTok } from "@/lib/platforms/tiktok-upload";

const [sessionKey, file, productId] = process.argv.slice(2);
const t0 = Date.now();
const r = await uploadToTikTok(
  { sessionKey, file, caption: "Uji coba Traktiva (tidak diposting)\n\n#test", productId: productId || null, productTitle: "Sepatu anak keren", dryRun: true, visible: true },
  (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${s}`),
).catch((e) => ({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }));
console.log("result:", JSON.stringify(r, null, 1));
process.exit(0);
