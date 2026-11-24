import { and, asc, count, eq, inArray } from "drizzle-orm";
import { CalendarClock, Clock, ExternalLink, Layers, ShieldCheck, Users } from "lucide-react";
import { AccountOverviewCard, OverviewEmpty, OverviewTiles } from "@/components/platform-overview";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { db } from "@/lib/db";
import { accounts, uploadJobs } from "@/lib/db/schema";
import { PLATFORM } from "@/lib/platforms";
import { FB_IDENTITIES, type FacebookIdentities } from "@/lib/platforms/meta";
import { getShopCache } from "@/lib/showcase";
import { ConnectButton } from "./connect-button";
import { FacebookTarget } from "./facebook-target";

const timeFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Instagram / Facebook → Ringkasan: the connected accounts and their sessions (uploads and insights come next). */
export async function MetaOverview({ platform }: { platform: "instagram" | "facebook" }) {
  const P = PLATFORM[platform];
  const list = await db.select().from(accounts).where(eq(accounts.platform, platform)).orderBy(asc(accounts.username));
  const ids = list.map((a) => a.id);
  const queued = ids.length
    ? await db.select({ id: uploadJobs.accountId, n: count() }).from(uploadJobs).where(and(inArray(uploadJobs.accountId, ids), eq(uploadJobs.status, "queued"))).groupBy(uploadJobs.accountId)
    : [];
  const fb = platform === "facebook" ? await Promise.all(ids.map((id) => getShopCache<FacebookIdentities>(id, FB_IDENTITIES))) : [];
  const profile = (a: (typeof list)[number]) =>
    platform === "instagram" ? `https://www.instagram.com/${a.username}/` : /^\d+$/.test(a.username) ? `https://www.facebook.com/profile.php?id=${a.username}` : `https://www.facebook.com/${a.username}`;

  return (
    <>
      <PageHeader slug={platform}>{list.length > 0 && <ConnectButton platform={platform} label="Tambah akun" />}</PageHeader>
      {list.length === 0 ? (
        <OverviewEmpty
          icon={<PlatformIcon platform={platform} className="size-7" />}
          title={`Belum ada akun ${P.label}`}
          text={`Login sekali di jendela Chrome yang terbuka; sesinya disimpan di profil browser khusus akun itu. Kalau ${P.label} minta verifikasi (kode/“ini saya”), selesaikan di jendela itu.`}
        >
          <ConnectButton platform={platform} />
        </OverviewEmpty>
      ) : (
        <div className="space-y-6">
          <OverviewTiles
            color={P.color}
            tiles={[
              { icon: Layers, label: "Akun", value: list.length, sub: `${list.filter((a) => a.status === "active").length} login` },
              { icon: ShieldCheck, label: "Perlu login", value: list.filter((a) => a.status !== "active").length },
              { icon: CalendarClock, label: "Antre upload", value: queued.reduce((t, r) => t + r.n, 0) },
              { icon: Clock, label: "Upload Reels", value: "Segera", sub: "fitur berikutnya" },
            ]}
          />
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Akun ({list.length})</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((a, i) => (
                <AccountOverviewCard
                  key={a.id}
                  a={a}
                  loginHref={`/akun?platform=${platform}`}
                  stats={[
                    { icon: Users, label: "ID", value: a.externalId ?? "—" },
                    { icon: CalendarClock, label: "Antre", value: queued.find((r) => r.id === a.id)?.n ?? 0 },
                  ]}
                  note={a.lastCheckAt ? `Sesi dicek ${timeFmt.format(a.lastCheckAt)} WIB` : undefined}
                  actions={[{ href: profile(a), label: "Buka profil", icon: ExternalLink, external: true }, { href: `/akun?platform=${platform}`, label: "Kelola sesi", icon: ShieldCheck, primary: true }]}
                >
                  {platform === "facebook" && <FacebookTarget accountId={a.id} data={fb[i]?.data ?? null} />}
                </AccountOverviewCard>
              ))}
            </div>
          </section>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Satu akun = satu profil Chrome, dan login di satu laptop saja. {P.label} cepat curiga pada otomasi: kalau muncul pemeriksaan keamanan, Traktiva berhenti dan kamu yang menyelesaikannya.
          </p>
        </div>
      )}
    </>
  );
}
