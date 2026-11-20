import { siFacebook, siInstagram, siShopee, siTiktok, siYoutube } from "simple-icons";
import type { PLATFORMS } from "@/lib/db/schema";

type Platform = (typeof PLATFORMS)[number];

// Brand colors tuned for a dark UI (TikTok's official black would vanish).
export const PLATFORM: Record<Platform, { label: string; color: string; path: string }> = {
  tiktok: { label: "TikTok", color: "#ff3b6b", path: siTiktok.path },
  instagram: { label: "Instagram", color: "#ff2d7a", path: siInstagram.path },
  facebook: { label: "Facebook", color: "#3b82f6", path: siFacebook.path },
  youtube: { label: "YouTube", color: "#ff3333", path: siYoutube.path },
  shopee: { label: "Shopee", color: "#ee4d2d", path: siShopee.path },
};
