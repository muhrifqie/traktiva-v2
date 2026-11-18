import type { ProjectEdit } from "@/lib/edit";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const PLATFORMS = ["tiktok", "instagram", "facebook", "youtube", "pinterest", "shopee"] as const;

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    profileDir: text("profile_dir"), // browser profile folder for this account
    externalId: text("external_id"), // platform user id (TikTok uid): stable even if username changes
    avatarUrl: text("avatar_url"),
    sessionKey: text("session_key"), // Electron session partition holding this account's cookies
    status: text("status", { enum: ["active", "disabled", "need_login"] }).notNull().default("need_login"),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    lastCheckAt: integer("last_check_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("accounts_platform_username").on(t.platform, t.username),
    uniqueIndex("accounts_platform_external_id").on(t.platform, t.externalId),
  ],
);

export type Account = typeof accounts.$inferSelect;

// One row per profile sync: keeps history so growth (followers/likes over time) can be charted later.
export const accountStats = sqliteTable("account_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  followers: integer("followers").notNull().default(0),
  following: integer("following").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  videoCount: integer("video_count").notNull().default(0),
  bio: text("bio"),
  bioLink: text("bio_link"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
  capturedAt: integer("captured_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Latest known state of each video (upserted on every sync).
export const accountPosts = sqliteTable(
  "account_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(), // TikTok video id
    caption: text("caption"),
    coverUrl: text("cover_url"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    durationSec: integer("duration_sec"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    postedAt: integer("posted_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("account_posts_account_external").on(t.accountId, t.externalId)],
);


// Google accounts logged in through Camoufox; their Flow session is registered in flow2api for API generation.
export const googleAccounts = sqliteTable("google_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  sessionKey: text("session_key").notNull(), // Camoufox profile (cfx_...) holding the Google login
  flowTokenId: integer("flow_token_id"), // token id inside flow2api
  credits: integer("credits"),
  status: text("status", { enum: ["active", "need_login", "error"] }).notNull().default("active"),
  lastError: text("last_error"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type GoogleAccount = typeof googleAccounts.$inferSelect;

// Video generation jobs (generated through the Flow API via flow2api; more engines can be added later).
export const VIDEO_ENGINES = ["flow"] as const;
export const videoJobs = sqliteTable("video_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  prompt: text("prompt").notNull(),
  engine: text("engine", { enum: VIDEO_ENGINES }).notNull().default("flow"),
  orientation: text("orientation", { enum: ["portrait", "landscape"] }).notNull().default("portrait"),
  durationSec: integer("duration_sec").notNull().default(8),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  progress: text("progress"), // human-readable step, e.g. "Membuat di Flow..."
  providerName: text("provider_name"), // which provider actually produced it
  model: text("model"),
  filePath: text("file_path"), // mp4 path relative to MEDIA_DIR (older rows: absolute path)
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

export type VideoJob = typeof videoJobs.$inferSelect;
export type AccountStats = typeof accountStats.$inferSelect;
export type AccountPost = typeof accountPosts.$inferSelect;

// Affiliate video projects built from a preset (lib/presets.ts). Media are files in the user's media folder;
// this row only keeps text + paths relative to MEDIA_DIR.
export type ProjectScene = {
  label: string;
  imagePrompt: string;
  motionPrompt: string;
  image?: string | null; // MEDIA_DIR-relative
  own?: boolean; // image uploaded by the user (skipped by "generate all")
  styleRef?: string | null; // MEDIA_DIR-relative frame from a reference video: AI copies its composition/lighting
  clip?: string | null;
  error?: string | null;
  // live run state (JSON only, no migration): queued → working → done | failed
  state?: "queued" | "working" | "done" | "failed" | null;
  stage?: string | null; // short status line while working
  pct?: number | null; // rough 0-100 progress while working
  queuedAt?: number | null; // ms epoch
  startedAt?: number | null;
  finishedAt?: number | null;
};
export type ProjectProduct = { name: string; details: string; price: string; photos: string[] };

export const videoProjects = sqliteTable("video_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  presetId: text("preset_id").notNull(),
  title: text("title").notNull(),
  step: integer("step").notNull().default(1), // wizard step the user was on (drafts resume here)
  product: text("product", { mode: "json" }).$type<ProjectProduct>().notNull(),
  options: text("options", { mode: "json" }).$type<Record<string, string>>().notNull(),
  scenes: text("scenes", { mode: "json" }).$type<ProjectScene[]>().notNull(),
  clipSec: integer("clip_sec").notNull().default(6),
  status: text("status", { enum: ["draft", "running", "done", "failed"] }).notNull().default("draft"),
  progress: text("progress"),
  error: text("error"),
  folder: text("folder").notNull(), // MEDIA_DIR-relative project folder
  finalPath: text("final_path"),
  caption: text("caption"),
  edit: text("edit", { mode: "json" }).$type<ProjectEdit>(), // timeline editor state (captions, voice, music)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type VideoProject = typeof videoProjects.$inferSelect;

// Products in each TikTok account's affiliate showcase (etalase), synced from TikTok Shop.
// Covers are cached in the media folder (TikTok CDN links expire).
export const showcaseProducts = sqliteTable(
  "showcase_products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    title: text("title").notNull(),
    price: text("price").notNull(),
    originalPrice: text("original_price"),
    commission: text("commission"),
    stock: integer("stock"),
    inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    shopName: text("shop_name"),
    cover: text("cover"), // MEDIA_DIR-relative cached cover
    labels: text("labels", { mode: "json" }).$type<string[]>().notNull(),
    position: integer("position").notNull().default(0), // order in the showcase
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("showcase_products_account_product").on(t.accountId, t.productId)],
);

export type ShowcaseProductRow = typeof showcaseProducts.$inferSelect;

// Cached JSON snapshots from TikTok Shop (account overview, market rankings…). key e.g. "overview", "ranking:601450".
export const shopCache = sqliteTable(
  "shop_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    capturedAt: integer("captured_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("shop_cache_account_key").on(t.accountId, t.key)],
);

// KaloData sessions (cookie SESSION, ±15 days). Kept only in the local DB, never shown in full in the UI.
export const kaloSessions = sqliteTable("kalo_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  sessionCookie: text("session_cookie").notNull().unique(),
  email: text("email"),
  deviceId: text("device_id"),
  extraCookies: text("extra_cookies"), // other cookies from signup (device/tracking), resent with SESSION
  source: text("source", { enum: ["manual", "signup"] }).notNull().default("manual"),
  status: text("status", { enum: ["active", "quota", "dead"] }).notNull().default("active"),
  lastError: text("last_error"),
  quotaAt: integer("quota_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Small app-wide JSON cache (KaloData searches/details…), key → data with capture time.
export const kvCache = sqliteTable("kv_cache", {
  key: text("key").primaryKey(),
  data: text("data", { mode: "json" }).$type<unknown>().notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Products saved from research (TikTok ranking / KaloData) to reuse for videos and the showcase.
export const savedProducts = sqliteTable(
  "saved_products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(), // TikTok Shop product id
    country: text("country").notNull().default("ID"),
    source: text("source", { enum: ["tiktok", "kalodata", "shopee", "manual"] }).notNull(),
    title: text("title").notNull(),
    image: text("image"), // remote cover URL (Kalodata/TikTok CDN)
    price: text("price"),
    shopName: text("shop_name"),
    metrics: text("metrics", { mode: "json" }).$type<Record<string, string | number | null>>().notNull(), // gmv30, creators, rating, commission…
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("saved_products_product_country").on(t.productId, t.country)],
);

export type SavedProduct = typeof savedProducts.$inferSelect;
