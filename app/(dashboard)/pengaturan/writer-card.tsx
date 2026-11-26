"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CircleCheck, Cloud, Cpu, FlaskConical, Loader2, RefreshCw, Save, Sparkles, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { ChatGPTIcon } from "@/components/brand-icons";
import { saveWriter, testWriter, writerSetup } from "./actions";
import { ChatgptControls } from "./chatgpt-account";

type Setup = Awaited<ReturnType<typeof writerSetup>>;
// what the owner picks; saved as WriterSettings (chatgpt = mode "auto", zai = an API preset with its own key)
type Choice = "chatgpt" | "zai" | "api" | "gemini" | `cli:${string}`;

const btn = "flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50";
const field = "h-8 w-full rounded-lg border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
const card = (on: boolean) => `flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${on ? "border-primary bg-primary/8" : "hover:bg-accent/60"}`;
const isZai = (preset?: string) => !!preset?.startsWith("zai");

function choiceOf(cur: Setup["current"]): Choice {
  if (cur.mode === "cli" && cur.cli) return `cli:${cur.cli.id}`;
  if (cur.mode === "api") return isZai(cur.api?.preset) ? "zai" : "api";
  return cur.mode === "gemini" ? "gemini" : "chatgpt";
}

/** Too-common errors explained in plain words (the raw message stays after it). */
function explain(msg: string) {
  if (/subscription|billing|past due/i.test(msg))
    return "Langganan Claude-mu sedang tidak bisa dipakai Claude Code (cek billing di claude.ai). Login Claude Desktop tidak bisa dipinjam aplikasi lain, jadi pakai Z.AI GLM atau API Anthropic dulu.";
  if (/insufficient balance|no resource package|recharge/i.test(msg))
    return "Saldo API habis atau belum ada paket. Punya GLM Coding Plan? Pilih jenis akun “GLM Coding Plan”, kuncinya sama.";
  if (/401|unauthorized|token expired|incorrect api key|invalid api key/i.test(msg)) return "Kunci/login ditolak (kedaluwarsa atau salah). Ganti kuncinya, atau login ulang agen itu di terminal.";
  return null;
}

/**
 * Pengaturan → Penulis AI: one place for who writes (storyboard prompts, voice-over, AI edits): ChatGPT web, Z.AI GLM
 * with the owner's own API key, an AI agent found on this PC (Claude Code, Codex…), another API, or Gemini only.
 */
export function WriterCard({ initial, chatgpt }: { initial: Setup; chatgpt: { email: string | null; connectedAt: string | null } }) {
  const router = useRouter();
  const [setup, setSetup] = useState(initial);
  const cur = setup.current;
  const [choice, setChoice] = useState<Choice>(choiceOf(cur));
  const [cliModel, setCliModel] = useState(cur.cli?.model ?? "");
  const presetOf = (id: string) => setup.presets.find((x) => x.id === id) ?? setup.presets[0];
  const start = presetOf(cur.api?.preset ?? "zai-coding");
  const [preset, setPreset] = useState(start.id as string);
  const [baseUrl, setBaseUrl] = useState(cur.api?.baseUrl ?? start.baseUrl);
  const [model, setModel] = useState(cur.api?.model ?? start.model);
  const [apiKey, setApiKey] = useState("");
  const [useEnv, setUseEnv] = useState(!!cur.api?.apiKeyEnv);
  const [busy, setBusy] = useState<"test" | "save" | "scan" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const d = setup.detected;
  const p = presetOf(preset);
  const envOk = !!p.env && d.envKeys.includes(p.env);
  const savedKey = cur.api && cur.api.preset === preset ? cur.api.maskedKey : null;
  const pickPreset = (id: string) => {
    const x = presetOf(id);
    setPreset(x.id);
    setBaseUrl(x.baseUrl);
    setModel(x.id === "ollama" ? (d.ollama.models[0] ?? "") : x.model);
    setUseEnv(!!x.env && d.envKeys.includes(x.env));
  };
  const pick = (c: Choice) => {
    setChoice(c);
    setResult(null);
    if (c === "zai" && !isZai(preset)) pickPreset("zai-coding");
    if (c === "api" && isZai(preset)) pickPreset("anthropic");
  };
  const cliId = choice.startsWith("cli:") ? choice.slice(4) : "";
  const apiMode = choice === "zai" || choice === "api";
  const draft = () => ({
    mode: choice === "chatgpt" ? ("auto" as const) : choice === "gemini" ? ("gemini" as const) : cliId ? ("cli" as const) : ("api" as const),
    cli: cliId ? { id: cliId, model: cliModel || undefined } : undefined,
    api: apiMode ? { preset, baseUrl, model, apiKey: useEnv && envOk ? "" : apiKey, apiKeyEnv: useEnv && envOk ? p.env : "" } : undefined,
  });

  const run = async (key: "test" | "save" | "scan", fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal";
      if (key === "test") setResult({ ok: false, text: msg });
      else toast.error(msg);
    } finally {
      setBusy(null);
    }
  };
  const test = () =>
    run("test", async () => {
      setResult(null);
      const r = await testWriter(draft());
      setResult({ ok: r.ok, text: `${r.ok ? "Menjawab" : "Jawaban tak terduga"} dalam ${r.seconds} dtk: “${r.answer}”` });
    });
  const save = () =>
    run("save", async () => {
      await saveWriter(draft());
      setSetup(await writerSetup());
      setApiKey("");
      toast.success("Penulis AI disimpan");
      router.refresh();
    });
  const scan = () => run("scan", async () => setSetup(await writerSetup(true)));
  const hint = result && !result.ok ? explain(result.text) : null;
  const fallback = setup.chatgpt && choice !== "chatgpt" ? "ChatGPT, lalu Gemini" : "Gemini";

  const option = (c: Choice, icon: React.ReactNode, title: string, sub: string, extra?: React.ReactNode) => (
    <button key={c} type="button" role="radio" aria-checked={choice === c} className={card(choice === c)} onClick={() => pick(c)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold">{title}{extra}</span>
        <span className="block truncate text-[11px] text-muted-foreground" title={sub}>{sub}</span>
      </span>
    </button>
  );

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-muted"><Bot className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Penulis AI</p>
          <p className="text-[11px] text-muted-foreground">
            Yang menulis prompt storyboard, naskah voice-over, dan suntingan AI. Gemini tetap jadi mata (melihat foto & video), Flow yang membuat gambar & klip.
          </p>
        </div>
        <button type="button" className={btn} disabled={!!busy} onClick={scan} title="Cari ulang agen AI & kunci API di PC ini">
          {busy === "scan" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Pindai PC
        </button>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2" role="radiogroup" aria-label="Penulis AI">
        {option(
          "chatgpt",
          <ChatGPTIcon className="size-4 text-black dark:text-white" />,
          "ChatGPT (web)",
          setup.chatgpt ? `Akun ${chatgpt.email ?? "terhubung"} lewat browser` : "Login akun ChatGPT-mu lewat browser",
          setup.chatgpt && <CircleCheck className="size-3 text-status-ok" />,
        )}
        {option("zai", <Sparkles className="size-4" />, "Z.AI · GLM", "Pakai API key Z.AI-mu sendiri (GLM Coding Plan atau API)", cur.mode === "api" && isZai(cur.api?.preset) && <CircleCheck className="size-3 text-status-ok" />)}
        {d.clis.map((c) => option(`cli:${c.id}`, <TerminalSquare className="size-4" />, c.name, `Agen di PC ini · ${c.path}`))}
        {option("api", <Cloud className="size-4" />, "API lain", "Anthropic, OpenAI, DeepSeek, OpenRouter, Ollama, atau custom")}
        {option("gemini", <Sparkles className="size-4" />, "Gemini saja", "Akun Google yang sama dengan Flow")}
      </div>

      {/* settings of the picked writer */}
      <div className="mt-3 rounded-lg border bg-background/50 p-3">
        {choice === "chatgpt" && <ChatgptControls email={chatgpt.email} connectedAt={chatgpt.connectedAt} />}

        {choice === "gemini" && <p className="text-[11px] text-muted-foreground">Gemini menulis memakai akun Google aktif di atas. Tidak perlu pengaturan lain.</p>}

        {cliId && (
          <label className="grid max-w-sm gap-1 text-[11px] font-medium">
            Model (opsional)
            <input className={field} value={cliModel} onChange={(e) => setCliModel(e.target.value)} maxLength={60} placeholder={cliId === "codex" ? "kosong = model default Codex" : "kosong = default · atau sonnet / opus / haiku"} />
          </label>
        )}

        {apiMode && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] font-medium">
              {choice === "zai" ? "Jenis akun Z.AI" : "Penyedia"}
              <select className={field} value={preset} onChange={(e) => pickPreset(e.target.value)}>
                {setup.presets.filter((x) => isZai(x.id) === (choice === "zai")).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-medium">
              Model
              <input className={field} value={model} onChange={(e) => setModel(e.target.value)} list="writer-models" maxLength={80} placeholder="nama model" />
              <datalist id="writer-models">{(preset === "ollama" ? d.ollama.models : isZai(preset) ? ["glm-5.3", "glm-5.3-flash"] : []).map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            {choice === "api" && (
              <label className="grid gap-1 text-[11px] font-medium sm:col-span-2">
                Alamat API (OpenAI-compatible)
                <input className={`${field} font-mono`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} maxLength={200} placeholder="https://…/v1" />
              </label>
            )}
            {preset !== "ollama" && (
              <div className="grid gap-1 text-[11px] font-medium sm:col-span-2">
                API key {choice === "zai" && <span className="font-normal text-muted-foreground">(z.ai → API Keys)</span>}
                {envOk && (
                  <label className="flex items-center gap-1.5 font-normal">
                    <input type="checkbox" checked={useEnv} onChange={(e) => setUseEnv(e.target.checked)} /> Pakai kunci dari sistem (<span className="font-mono">{p.env}</span>)
                  </label>
                )}
                {!(useEnv && envOk) && (
                  <input className={`${field} font-mono`} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} maxLength={300} placeholder={savedKey ? `tersimpan: ${savedKey} (kosongkan untuk tetap)` : "tempel API key"} />
                )}
              </div>
            )}
          </div>
        )}

        {choice !== "chatgpt" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(cliId || apiMode) && (
              <button type="button" className={btn} disabled={!!busy} onClick={test}>
                {busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />} Tes
              </button>
            )}
            <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={!!busy} onClick={save}>
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Simpan
            </button>
          </div>
        )}
        {choice === "chatgpt" && cur.mode !== "auto" && (
          <button type="button" className="mt-2 flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={!!busy} onClick={save}>
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Pakai ChatGPT sebagai penulis
          </button>
        )}
        {result && (
          <div className={`mt-2 space-y-0.5 text-[11px] ${result.ok ? "text-status-ok" : "text-destructive"}`}>
            {hint && <p className="font-medium">{hint}</p>}
            <p className={`flex items-start gap-1 ${hint ? "text-muted-foreground" : ""}`}>{result.ok && <CircleCheck className="mt-px size-3.5 shrink-0" />}<span className="line-clamp-3">{result.text}</span></p>
          </div>
        )}
      </div>

      {/* what was found on this PC */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Terdeteksi di PC ini:</span>
        {d.clis.map((c) => <span key={c.id} title={c.path} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5"><TerminalSquare className="size-3" /> {c.name}</span>)}
        {d.ollama.installed && <span className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5"><Cpu className="size-3" /> Ollama {d.ollama.running ? `· ${d.ollama.models.length} model` : "· belum jalan"}</span>}
        {d.envKeys.map((k) => <span key={k} className="rounded-full border bg-background px-2 py-0.5 font-mono">{k}</span>)}
        {!d.clis.length && !d.ollama.installed && !d.envKeys.length && <span className="text-muted-foreground">belum ada agen AI atau kunci API</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Kalau penulis pilihanmu gagal, {fallback} otomatis menggantikan. Agen di PC dijalankan di folder kosong tanpa akses file atau perintah. API key disimpan di PC ini saja.
      </p>
    </section>
  );
}
