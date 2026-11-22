import Link from "next/link";
import { describeEvent, fmtTime } from "@/lib/format";
import type { AuditEvent } from "@/lib/license-api";

/** Same building blocks as the member area (components/kit.tsx). */
export { PageHeader as PageHead, StatusBadge as StateBadge } from "@/components/kit";

export function OnlineBadge({ at, now }: { at: number | null; now: number }) {
  if (at && now - at < 600) return <span className="inline-flex h-[1.375rem] items-center gap-1.5 rounded-full bg-status-ok/12 px-2 text-[0.6875rem] font-semibold text-status-ok"><span className="size-1.5 rounded-full bg-current" />Online</span>;
  return <span className="text-muted-foreground">{at ? fmtTime(at) : "Belum pernah"}</span>;
}

const DOT = { ok: "bg-status-ok", bad: "bg-destructive", warn: "bg-amber-300", "": "bg-muted-foreground" } as const;

export function EventList({ events, withKey = true }: { events: AuditEvent[]; withKey?: boolean }) {
  if (!events.length) return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada kejadian.</p>;
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => {
        const { label, tone, detail } = describeEvent(e);
        return (
          <li key={e.id} className="grid grid-cols-[12px_1fr_auto] gap-3 py-2.5 text-[0.8125rem]">
            <span className={`mt-1.5 size-2 rounded-full ${DOT[tone]}`} />
            <div className="min-w-0">
              <span className="font-semibold">{label}</span>
              {withKey && e.license_id && (
                <>
                  {" · "}
                  <Link href={`/admin/lisensi/${e.license_id}`} className="font-mono hover:underline">…{e.key_hint}</Link>
                  {e.note && <span className="text-muted-foreground"> {e.note}</span>}
                </>
              )}
              {detail && detail !== e.note && <span className="text-muted-foreground"> · {detail}</span>}
              {e.actor && <span className="ml-1.5 rounded-md border bg-muted px-1.5 py-px text-[0.6875rem]">{e.actor}</span>}
              {e.ip && <span className="ml-1.5 font-mono text-[0.6875rem] text-muted-foreground">{e.ip}</span>}
            </div>
            <time className="text-[0.6875rem] whitespace-nowrap text-muted-foreground">{fmtTime(e.at)}</time>
          </li>
        );
      })}
    </ul>
  );
}
