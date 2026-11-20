import Link from "next/link";
import { eq } from "drizzle-orm";
import { Coins, FolderKanban, TriangleAlert } from "lucide-react";
import { GoogleIcon } from "@/components/brand-icons";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { googleAccounts, videoProjects } from "@/lib/db/schema";
import { loadFlow2ApiConfig } from "@/lib/flow2api";
import { getSettings } from "@/lib/settings";
import { NewConceptButton, PresetGallery } from "./presets";

export const dynamic = "force-dynamic";

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export default async function VideoPage() {
  const flow = loadFlow2ApiConfig();
  const [accounts, running] = await Promise.all([
    db.select({ status: googleAccounts.status, credits: googleAccounts.credits }).from(googleAccounts),
    db.select({ id: videoProjects.id }).from(videoProjects).where(eq(videoProjects.status, "running")),
  ]);
  const active = accounts.filter((a) => a.status === "active");
  const credits = active.reduce((n, a) => n + (a.credits ?? 0), 0);

  return (
    <>
      <PageHeader slug="video">
        <Link href="/pengaturan" title="Akun Google aktif dan kredit Flow" className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent">
          <GoogleIcon className="size-4" /> {active.length} akun
          <span className="flex items-center gap-1 text-muted-foreground"><Coins className="size-3.5 text-black dark:text-white" />{compact.format(credits)}</span>
        </Link>
        <Link href="/proyek" className="flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent">
          <FolderKanban className="size-4" /> Proyek saya
          {running.length > 0 && <span className="rounded-full bg-status-progress/15 px-1.5 text-[10px] text-status-progress">{running.length} jalan</span>}
        </Link>
      </PageHeader>

      <div className="flex-1 space-y-4">
        {!flow ? (
          <Banner>Mesin video belum terpasang di perangkat ini. Hubungi penjual untuk aktivasi.</Banner>
        ) : active.length === 0 ? (
          <Banner href="/pengaturan">Tambahkan akun Google di Pengaturan AI dulu supaya AI bisa membuat gambar &amp; video.</Banner>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Pilih konsep video</h2>
            <p className="text-xs text-muted-foreground">Lihat contoh hasilnya, pilih yang cocok dengan produkmu. Semua langkah bisa diubah nanti.</p>
          </div>
          <NewConceptButton />
        </div>
        <PresetGallery mine={getSettings().myConcepts ?? []} />
      </div>
    </>
  );
}

function Banner({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "flex items-center gap-2 rounded-xl border border-status-progress/40 bg-status-progress/10 px-4 py-3 text-[13px]";
  const body = <><TriangleAlert className="size-4 shrink-0 text-status-progress" />{children}</>;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
