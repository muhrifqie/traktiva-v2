import { fmtDate, fmtTime } from "@/lib/format";
import { asAdmin, type Announcement } from "@/lib/license-api";
import { PageHead } from "../ui";
import { AnnouncementRow, NewAnnouncement } from "./forms";

export default async function Announcements() {
  const { announcements } = await asAdmin<{ announcements: Announcement[] }>("/internal/announcements");
  return (
    <>
      <PageHead title="Pengumuman" sub="Tampil di atas semua halaman app Traktiva dan di dashboard pembeli (diperbarui tiap 5 menit)" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3 text-sm font-semibold">Semua pengumuman</header>
          {announcements.length ? (
            <ul className="divide-y">
              {announcements.map((a) => (
                <AnnouncementRow key={a.id} a={a} meta={`${a.actor ?? "?"} · ${fmtTime(a.created_at)}${a.ends_at ? ` · sampai ${fmtDate(a.ends_at)}` : ""}`} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pengumuman.</p>
          )}
        </section>
        <NewAnnouncement />
      </div>
    </>
  );
}
