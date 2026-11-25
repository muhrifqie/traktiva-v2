import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Electron passes userData via TRAKTIVA_DATA_DIR; web/dev falls back to ./data.
// turbopackIgnore keeps the build's file tracer out of ./data: otherwise it walks the DB and live browser
// profiles (locked files → build crash) and could ship dev data inside the installer.
export const DATA_DIR = process.env.TRAKTIVA_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const client = createClient({ url: `file:${path.join(DATA_DIR, "traktiva.db")}` });
// WAL: readers never block the writer; busy_timeout: a second writer (sync job, script, Electron + dev server)
// waits up to 5 s instead of failing at once with SQLITE_BUSY ("Failed query: insert ..." mid showcase sync).
void client
  .executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")
  // self-heal: an index that lost rows makes every query using it skip them silently (two YouTube channels
  // were never auto-synced because `accounts_platform_external_id` missed them). Rebuilding is cheap here.
  .then(() => client.execute("PRAGMA integrity_check"))
  .then(async (r) => {
    const bad = r.rows.map((x) => String(x[0])).filter((m) => /index/.test(m));
    if (!bad.length) return;
    console.warn("[db] rebuilding indexes:", bad.slice(0, 3).join("; "));
    await client.execute("REINDEX");
  })
  .catch((e) => console.warn("[db]", e instanceof Error ? e.message : e));

export const db = drizzle({ client, schema });
