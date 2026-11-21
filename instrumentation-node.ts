// Runs once at server start: apply pending migrations so installed apps upgrade their DB on launch,
// then clean up work that could not survive a restart.
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { startAiStandby } from "@/lib/ai-standby";
import { startShowcaseAutoSync } from "@/lib/showcase";
import { failInterruptedJobs } from "@/lib/video";
import { startProfileAutoSync } from "@/lib/profile-autosync";
import { startUploadRunner } from "@/lib/uploads";

await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
await failInterruptedJobs();
startShowcaseAutoSync();
// AI browsers (Gemini, ChatGPT) open headless and stay parked on their page
if (process.env.TRAKTIVA_NO_STANDBY !== "1") startAiStandby();

// Jadwal Upload: posts due TikTok uploads one at a time while the app is open
startUploadRunner();
// Profil & Postingan: re-read each TikTok account after a new post goes live and every 30 minutes
startProfileAutoSync();
