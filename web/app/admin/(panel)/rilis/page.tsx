import { fmtTime } from "@/lib/format";
import { asAdmin, type Release } from "@/lib/license-api";
import { PageHead } from "../ui";
import { DeleteRelease, NewRelease } from "./forms";

export default async function Releases() {
  const { releases } = await asAdmin<{ releases: Release[] }>("/internal/releases");
  return (
    <>
      <PageHead title="Rilis" sub="Versi terbaru memunculkan tombol Download di app lama dan di dashboard pembeli" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3 text-sm font-semibold">Riwayat versi</header>
          {releases.length ? (
            <ul className="divide-y">
              {releases.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[0.8125rem]">
                  <span className="font-mono text-sm font-semibold">v{r.version}</span>
                  {i === 0 && <span className="rounded-full bg-status-ok/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-ok">Terbaru</span>}
                  {!!r.mandatory && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-red-200">Wajib</span>}
                  <div className="min-w-0 basis-full">
                    {r.notes && <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">{r.notes}</p>}
                    <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground">{r.url}</a>
                    <p className="mt-1 text-[0.6875rem] text-muted-foreground">{r.actor ?? "?"} · {fmtTime(r.created_at)}</p>
                  </div>
                  <DeleteRelease id={r.id} version={r.version} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada rilis. App tidak menampilkan info update.</p>
          )}
        </section>
        <NewRelease />
      </div>
    </>
  );
}
