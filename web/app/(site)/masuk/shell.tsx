/** Shared frame of /masuk and /daftar: promise on the left, the form card on the right. */
export function AuthShell({ eyebrow, title, points, children }: { eyebrow: string; title: string; points: string[]; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1260px] items-center gap-12 px-5 py-16 md:px-8 lg:grid-cols-2">
      <div>
        <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--site-signal)] uppercase">{eyebrow}</p>
        <h1 className="mt-4 text-[40px] leading-[1.08] font-light tracking-[-0.03em] md:text-[56px]">{title}</h1>
        <ul className="mt-8 grid gap-3 border-l-2 border-[var(--site-signal)] pl-4 text-[16px] text-[var(--site-body)]">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
      <div className="rounded-3xl bg-[var(--site-card)] p-7 md:p-9">{children}</div>
    </main>
  );
}
