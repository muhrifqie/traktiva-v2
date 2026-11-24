"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { removeFromVideoGallery } from "@/lib/video-gallery";
import { deleteEditorFile } from "@/lib/youtube-editor";

export async function removeGalleryVideo(rel: string) {
  const r = z.string().max(400).parse(rel);
  if (r.startsWith("YouTube Editor/")) await deleteEditorFile(r);
  else await removeFromVideoGallery(r);
  revalidatePath("/galeri-video");
}
