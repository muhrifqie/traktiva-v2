"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { removeFromVideoGallery } from "@/lib/video-gallery";

export async function removeGalleryVideo(rel: string) {
  await removeFromVideoGallery(z.string().max(400).parse(rel));
  revalidatePath("/galeri-video");
}
