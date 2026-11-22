import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects } from "@/lib/db/schema";
import { presetById } from "@/lib/presets";
import { getSettings } from "@/lib/settings";
import { listVoices, type CartesiaVoice } from "@/lib/cartesia";
import { getKv } from "@/lib/kalo";
import { projectVoice } from "@/lib/voice";
import { Wizard, type FamilyItem, type Sibling } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/video/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [project, google] = await Promise.all([
    db.select().from(videoProjects).where(eq(videoProjects.id, id)).get(),
    db.select({ id: googleAccounts.id }).from(googleAccounts).where(eq(googleAccounts.status, "active")).limit(1),
  ]);
  if (!project || !presetById(project.presetId)) notFound();
  // versions (Video final B/C) the user deleted drop out, so no dead links and they can be made again
  const vids = (project.options.versions ?? "").split(",").map(Number).filter(Boolean);
  if (vids.length) {
    const alive = (await db.select({ id: videoProjects.id }).from(videoProjects).where(inArray(videoProjects.id, vids))).map((r) => r.id);
    project.options = { ...project.options, versions: vids.filter((v) => alive.includes(v)).join(",") };
  }
  // the main video and its versions B–E, for the progress list in the Adegan tab
  const mainId = Number(project.options.versionOf) || project.id;
  const main = mainId === project.id ? project : await db.select().from(videoProjects).where(eq(videoProjects.id, mainId)).get();
  const famIds = [mainId, ...(main?.options.versions ?? "").split(",").map(Number).filter(Boolean)];
  const famRows = famIds.length > 1 ? await db.select().from(videoProjects).where(inArray(videoProjects.id, famIds)) : [];
  const family: FamilyItem[] = famIds
    .map((fid, i): FamilyItem | null => {
      const r = famRows.find((x) => x.id === fid);
      if (!r) return null;
      return {
        id: r.id, key: String.fromCharCode(65 + i), status: r.status, progress: r.progress, error: r.error, ready: !!r.edit,
        images: r.scenes.filter((x) => x.image).length, clips: r.scenes.filter((x) => x.clip).length, scenes: r.scenes.length,
        cover: r.scenes[0]?.image ?? r.product.photos[0] ?? null,
      };
    })
    .filter((x): x is FamilyItem => !!x);
  const { updatedAt, ...rest } = project;
  const defaults = getSettings().voice ?? { provider: "flow" };
  const voice = projectVoice(project.options, defaults);
  // every version A–E in full, so the Adegan tab shows all their images and clips on one page
  const siblings: Sibling[] = famIds
    .map((fid, i) => {
      const r = famRows.find((x) => x.id === fid);
      if (!r) return null;
      const { updatedAt: u, ...row } = r;
      return { key: String.fromCharCode(65 + i), project: { ...row, updatedAt: u.getTime() }, voice: projectVoice(r.options, defaults) };
    })
    .filter((x): x is Sibling => !!x);
  let voices: CartesiaVoice[] = (await getKv<CartesiaVoice[]>("cartesia:voices:id"))?.data ?? [];
  if (defaults.cartesiaKey && !voices.length) voices = await listVoices(defaults.cartesiaKey, "id").catch(() => []);
  return (
    <Wizard
      project={{ ...rest, updatedAt: updatedAt.getTime() }}
      hasGoogle={google.length > 0}
      voice={voice}
      voices={voices.map(({ id, name, description, gender }) => ({ id, name, description, gender }))}
      hasCartesia={!!defaults.cartesiaKey}
      family={family}
      siblings={siblings}
    />
  );
}
