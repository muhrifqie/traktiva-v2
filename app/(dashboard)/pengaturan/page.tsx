import { Clapperboard, ShieldCheck } from "lucide-react";
import { GeminiIcon } from "@/components/brand-icons";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { googleAccounts } from "@/lib/db/schema";
import { loadFlow2ApiConfig } from "@/lib/flow2api";
import { getSettings, setActiveFlowAccounts } from "@/lib/settings";
import { camoufoxStatus, installCamoufox } from "@/lib/browser/camoufox-install";
import { findChromium } from "@/lib/browser/chromium";
import { BrowserEngine } from "./browser-engine";
import { EngineCard } from "./engine-card";
import { engineStatus } from "@/lib/engine/flow2api-engine";
import { GoogleAccounts } from "./google-accounts";
import { VoiceSetting } from "./voice-setting";
import { getKv } from "@/lib/kalo";
import { listVoices, maskKey, type CartesiaVoice } from "@/lib/cartesia";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function PengaturanPage() {
  // First run: start the one-time Camoufox download as soon as the settings page is opened.
  if (camoufoxStatus().state === "missing") void installCamoufox().catch(() => {});
  const accounts = await db.select().from(googleAccounts).orderBy(googleAccounts.email);
  const active = accounts.filter((a) => a.status === "active").length;
  setActiveFlowAccounts(active);
  // voice-over settings (the key itself never leaves the server; only a masked form is shown)
  const voice = getSettings().voice ?? { provider: "flow" };
  let voices: CartesiaVoice[] = (await getKv<CartesiaVoice[]>("cartesia:voices:id"))?.data ?? [];
  if (voice.cartesiaKey && !voices.length) voices = await listVoices(voice.cartesiaKey, "id").catch(() => []);

  return (
    <>
      <PageHeader slug="pengaturan">
        <span className="text-xs text-muted-foreground">{active} akun aktif</span>
      </PageHeader>

      <div className="w-full flex-1 space-y-5">
        <EngineCard initial={await engineStatus()} />

        <BrowserEngine initial={{ camoufox: camoufoxStatus(), fallback: findChromium()?.name ?? null }} />

        <GoogleAccounts
          ready={!!loadFlow2ApiConfig()}
          accounts={accounts.map((a) => ({
            id: a.id,
            email: a.email,
            credits: a.credits,
            status: a.status,
            lastError: a.lastError,
            lastSync: a.lastSyncAt ? fmt.format(a.lastSyncAt) : null,
          }))}
        />

        <VoiceSetting
          provider={voice.provider}
          hasKey={!!voice.cartesiaKey}
          maskedKey={voice.cartesiaKey ? maskKey(voice.cartesiaKey) : null}
          voiceId={voice.cartesiaVoiceId ?? null}
          voices={voices}
          speed={voice.speed ?? 1}
        />

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-[#f2994a1a] text-[#f2994a]"><Clapperboard className="size-4" /></span>
              Video (Google Flow)
              <span className="ml-auto rounded-full bg-status-ok/10 px-2 py-0.5 text-[10px] font-medium text-status-ok">Aktif</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Buat video Reels/TikTok memakai kredit Flow akun Google-mu.</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-muted"><GeminiIcon className="size-4" /></span>
              Teks & caption (Gemini)
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Segera</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Caption, ide konten, dan prompt video memakai akun Google yang sama.</p>
          </div>
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-status-ok" />
          Setiap akun Google punya browser sendiri di perangkat ini. Traktiva tidak pernah meminta password-mu; login dilakukan langsung di halaman Google.
        </p>
      </div>
    </>
  );
}
