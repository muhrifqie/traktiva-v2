// Apply pending migrations without restarting the dev server (the server also runs them at start).
// Usage: npx tsx --conditions=react-server scripts/migrate.mts
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";

await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
console.log("migrations applied");
process.exit(0);
