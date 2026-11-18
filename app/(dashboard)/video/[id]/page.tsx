import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects } from "@/lib/db/schema";
import { presetById } from "@/lib/presets";
import { getSettings, maxVideosPerProduct } from "@/lib/settings";
import { listVoices, type CartesiaVoice } from "@/lib/cartesia";
import { getKv } from "@/lib/kalo";
import { projectVoice } from "@/lib/voice";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/video/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [project, google] = await Promise.all([
    db.select().from(videoProjects).where(eq(videoProjects.id, id)).get(),
    db.select({ id: googleAccounts.id }).from(googleAccounts).where(eq(googleAccounts.status, "active")).limit(1),
  ]);
  if (!project || !presetById(project.presetId)) notFound();
  const { updatedAt, ...rest } = project;
  const defaults = getSettings().voice ?? { provider: "flow" };
  const voice = projectVoice(project.options, defaults);
  let voices: CartesiaVoice[] = (await getKv<CartesiaVoice[]>("cartesia:voices:id"))?.data ?? [];
  if (defaults.cartesiaKey && !voices.length) voices = await listVoices(defaults.cartesiaKey, "id").catch(() => []);
  return (
    <Wizard
      project={{ ...rest, updatedAt: updatedAt.getTime() }}
      hasGoogle={google.length > 0}
      voice={voice}
      voices={voices.map(({ id, name, description, gender }) => ({ id, name, description, gender }))}
      hasCartesia={!!defaults.cartesiaKey}
      maxVideos={maxVideosPerProduct()}
    />
  );
}
