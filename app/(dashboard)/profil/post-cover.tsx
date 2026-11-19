"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { mediaUrl } from "@/lib/media-url";

/**
 * Post cover: the local copy saved by the sync (older rows: a TikTok link). A cover TikTok won't serve here
 * (e.g. a US photo post hidden from this region) shows a placeholder instead of an empty black card.
 */
export function PostCover({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
        <ImageOff className="size-5" />
        <span className="text-[10px]">Gambar tidak tersedia</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local media / TikTok link, not optimisable
    <img
      src={mediaUrl(src)}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}
