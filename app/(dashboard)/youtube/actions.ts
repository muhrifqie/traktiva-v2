"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateSettings } from "@/lib/settings";

const Defaults = z.object({
  title: z.string().max(100),
  description: z.string().max(5000),
  tags: z.string().max(500),
  visibility: z.enum(["public", "unlisted", "private"]),
  madeForKids: z.boolean(),
  aiContent: z.boolean(),
});

/** Save the YouTube upload templates (settings.json: survives refresh, restart and updates). */
export async function saveYouTubeUploadDefaults(input: z.input<typeof Defaults>) {
  updateSettings({ youtubeUpload: Defaults.parse(input) });
  revalidatePath("/youtube");
  revalidatePath("/jadwal");
}
