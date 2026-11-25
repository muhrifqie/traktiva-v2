import Link from "next/link";
import { Clapperboard, LayoutTemplate, Mic, Palette } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { galleryCards } from "@/lib/templates";
import { ConceptTemplateCard, ScriptTemplateCard, StyleTemplateCard } from "./cards";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "konsep", label: "Konsep video", icon: Clapperboard, empty: "Konsep video baru dari Traktiva akan muncul di sini." },
  { id: "gaya", label: "Gaya editor", icon: Palette, empty: "Gaya subtitle & efek baru akan muncul di sini." },
  { id: "naskah", label: "Naskah VO", icon: Mic, empty: "Naskah voice-over baru akan muncul di sini." },
] as const;
const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function TemplatePage({ searchParams }: { searchParams: Promise<{ jenis?: string }> }) {
  const { jenis } = await searchParams;
  const g = galleryCards();
  const counts = { konsep: g.concepts.length, gaya: g.styles.length, naskah: g.scripts.length };
  const tab = TABS.find((t) => t.id === jenis) ?? TABS.find((t) => counts[t.id]) ?? TABS[0];
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
  return (
    <>
      <PageHeader slug="template" desc={g.at ? `Diperbarui otomatis dari server · terakhir ${timeFmt.format(g.at)} WIB` : undefined} />
      <div className="flex flex-1 flex-col gap-4">
        <nav className="inline-flex w-fit rounded-lg bg-muted p-0.5" aria-label="Jenis template">
          {TABS.map((t) => (
            <Link key={t.id} href={`/template?jenis=${t.id}`} aria-current={t.id === tab.id ? "page" : undefined}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${t.id === tab.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="size-3.5" /> {t.label} <span className="tabular-nums text-muted-foreground">{counts[t.id]}</span>
            </Link>
          ))}
        </nav>
        {counts[tab.id] === 0 ? (
          <div className="grid flex-1 place-items-center rounded-xl border border-dashed p-10 text-center">
            <div className="space-y-2">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-muted"><LayoutTemplate className="size-5 text-muted-foreground" /></span>
              <p className="text-sm font-medium">{tab.empty}</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {g.at ? "Galeri dikirim server lisensi tiap kali ada template baru; tidak perlu update app." : "Galeri tersambung setelah app aktif dengan lisensi dan online."}
              </p>
            </div>
          </div>
        ) : tab.id === "konsep" ? (
          <div className={grid}>{g.concepts.map((c) => <ConceptTemplateCard key={c.id} c={c} />)}</div>
        ) : tab.id === "gaya" ? (
          <div className={grid}>{g.styles.map((s) => <StyleTemplateCard key={s.id} s={s} />)}</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{g.scripts.map((s) => <ScriptTemplateCard key={s.id} s={s} />)}</div>
        )}
      </div>
    </>
  );
}
