"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asAdmin } from "@/lib/license-api";
import type { Result } from "../../actions";

// The license server validates every field again (server/license/templates.mjs); this only shapes the call.
const Input = z.object({
  id: z.number().int().nonnegative().optional(),
  kind: z.enum(["konsep", "gaya", "naskah"]),
  title: z.string().trim().min(1, "Judul wajib diisi.").max(80),
  summary: z.string().max(300).default(""),
  category: z.string().max(40).default(""),
  cover: z.string().max(500).default(""),
  preview: z.string().max(500).default(""),
  minApp: z.string().max(20).default(""),
  sort: z.number().int().min(-1000).max(1000).default(0),
  data: z.record(z.string(), z.unknown()),
});

const fail = (e: unknown): { ok: false; message: string } => {
  if (e instanceof Error && "digest" in e) throw e;
  return { ok: false, message: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Isian belum benar.") : e instanceof Error ? e.message : "Gagal" };
};

export async function saveTemplate(input: z.input<typeof Input>): Promise<Result> {
  try {
    await asAdmin("/internal/templates", { method: "POST", body: Input.parse(input) });
    revalidatePath("/admin/template");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function templateAction(id: number, action: "on" | "off" | "delete"): Promise<Result> {
  try {
    await asAdmin(`/internal/templates/${z.number().int().positive().parse(id)}`, { method: "POST", body: { action: z.enum(["on", "off", "delete"]).parse(action) } });
    revalidatePath("/admin/template");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
