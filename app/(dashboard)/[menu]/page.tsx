import { notFound } from "next/navigation";
import { CalendarClock, Hammer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { navBySlug } from "@/lib/nav";

// ponytail: one placeholder route for every unbuilt menu (and every platform that is not live yet); a real page
// folder overrides it
export default async function MenuPlaceholder({ params }: PageProps<"/[menu]">) {
  const { menu } = await params;
  const item = navBySlug(menu);
  if (!item) notFound();
  const platform = "platform" in item ? item.platform : null;
  const status = "status" in item ? item.status : null;
  return (
    <>
      <PageHeader slug={item.slug} />
      <div className="grid flex-1 place-items-center text-center">
        <div className="max-w-sm space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border bg-muted/50">
            {platform ? <PlatformIcon platform={platform} className="size-7" /> : <item.icon className="size-6 text-black dark:text-white" />}
          </div>
          <div className="space-y-1">
            <p className="font-semibold">{item.title}</p>
            <p className="text-[13px] text-muted-foreground">{item.desc}</p>
          </div>
          {status ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status === "Segera" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "border text-muted-foreground"}`}>
              <CalendarClock className="size-3" /> {status === "Segera" ? "Segera hadir lewat update" : "Masuk rencana pengembangan"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              <Hammer className="size-3" /> Sedang dibangun
            </span>
          )}
          {platform && <p className="text-xs text-muted-foreground">Video yang kamu buat sekarang bisa dipakai juga untuk {item.title} begitu fiturnya aktif.</p>}
        </div>
      </div>
    </>
  );
}
