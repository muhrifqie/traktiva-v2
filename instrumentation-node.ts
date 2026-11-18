// Runs once at server start: apply pending migrations so installed apps upgrade their DB on launch,
// then clean up work that could not survive a restart.
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { startShowcaseAutoSync } from "@/lib/showcase";
import { failInterruptedJobs } from "@/lib/video";
import { requeueInterruptedPosts, startPostingWorker } from "@/lib/posting";

await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
await failInterruptedJobs();
startShowcaseAutoSync();
await requeueInterruptedPosts();
startPostingWorker();
