"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, FlaskConical, Loader2, LogIn, Trash2 } from "lucide-react";
import { ChatGPTIcon } from "@/components/brand-icons";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { disconnectChatgpt, pollChatgptConnect, startChatgptConnect, testChatgpt } from "./actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const btn = "flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50";

/** ChatGPT web account = the writer (storyboard, voice-over script, AI edits). Gemini looks, Flow generates. */
export function ChatgptAccount({ email, connectedAt }: { email: string | null; connectedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"connect" | "test" | "remove" | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const connected = !!connectedAt;

  const run = async (key: "connect" | "test" | "remove", fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(null);
      setStep(null);
    }
  };
  const connect = () =>
    run("connect", async () => {
      const { loginId } = await startChatgptConnect();
      setStep("Login ChatGPT di jendela yang terbuka (Google, email, atau Apple)...");
      for (;;) {
        await sleep(2000);
        const s = await pollChatgptConnect(loginId);
        if (s.status === "done") {
          toast.success(`ChatGPT terhubung${s.email ? ` · ${s.email}` : ""}`);
          router.refresh();
          return;
        }
        if (s.status !== "waiting") throw new Error(s.error || "Login gagal");
      }
    });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-black dark:text-white"><ChatGPTIcon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">ChatGPT · penulis</p>
          <p className="text-[11px] text-muted-foreground">
            Menulis prompt storyboard, naskah voice-over, dan suntingan AI. Gemini tetap jadi mata (melihat foto dan video), Flow yang membuat gambar dan klip.
          </p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 rounded-full bg-status-ok/10 px-2 py-0.5 text-[10px] font-medium text-status-ok"><CircleCheck className="size-3" /> {email ?? "Terhubung"}</span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Belum terhubung · Gemini yang menulis</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={!!busy} onClick={connect}>
          {busy === "connect" ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />} {connected ? "Login ulang" : "Hubungkan ChatGPT"}
        </button>
        {connected && (
          <>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() =>
                run("test", async () => {
                  const r = await testChatgpt();
                  if (r.ok) toast.success(`ChatGPT menjawab dalam ${r.seconds} dtk`);
                  else toast.error(`Jawaban tak terduga: ${r.answer}`);
                })
              }
            >
              {busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />} Tes
            </button>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() =>
                run("remove", async () => {
                  if (!(await confirmDialog({ title: "Putuskan ChatGPT?", description: "Profil browser ChatGPT dihapus; Gemini kembali jadi penulis." }))) return;
                  await disconnectChatgpt();
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-3.5" /> Putuskan
            </button>
          </>
        )}
        {connectedAt && <span className="text-[11px] text-muted-foreground">sejak {connectedAt}</span>}
      </div>
      {step && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> {step}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Memakai akun ChatGPT-mu lewat browser (bukan API resmi): melanggar ketentuan OpenAI dan bisa dibatasi. Kalau ChatGPT gagal, Gemini otomatis menggantikan.</p>
    </section>
  );
}
