import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Other AI writers besides ChatGPT web (Pengaturan → Penulis AI):
// - AI agents already installed on this PC, found in the usual system folders: the Claude Code CLI and its wrappers
//   (e.g. claude-glm = Claude Code on Z.AI), the Codex CLI, and Ollama (local models).
// - Any OpenAI-compatible API: Z.AI (GLM), Anthropic, OpenAI, DeepSeek, OpenRouter, Ollama or a custom one.
// Everything here only answers a text prompt; the agents run in an empty temp folder with their tools switched off.

export type CliAgent = { id: string; name: string; kind: "claude" | "codex"; path: string };
export type Detected = {
  clis: CliAgent[];
  ollama: { installed: boolean; running: boolean; models: string[] };
  envKeys: string[]; // API-key variables set on this PC (names only, never values)
};

export const API_PRESETS = [
  { id: "zai-coding", name: "Z.AI · GLM Coding Plan", baseUrl: "https://api.z.ai/api/coding/paas/v4", model: "glm-5.3", env: "ZAI_API_KEY" },
  { id: "zai", name: "Z.AI · API", baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-5.3", env: "ZAI_API_KEY" },
  { id: "anthropic", name: "Anthropic (Claude API)", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5", env: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "", env: "OPENAI_API_KEY" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", env: "DEEPSEEK_API_KEY" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "", env: "OPENROUTER_API_KEY" },
  { id: "ollama", name: "Ollama (di PC ini)", baseUrl: "http://127.0.0.1:11434/v1", model: "", env: "" },
  { id: "custom", name: "Lainnya (OpenAI-compatible)", baseUrl: "", model: "", env: "" },
] as const;
export type ApiConfig = { preset: string; baseUrl: string; model: string; apiKey?: string; apiKeyEnv?: string };

const home = os.homedir();
const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");

// ---------------------------------------------------------------- detection (cached: a folder scan + one local HTTP call)

const g = globalThis as unknown as { __writerDetect?: { at: number; data: Detected } };

export async function detectAgents(fresh = false): Promise<Detected> {
  if (!fresh && g.__writerDetect && Date.now() - g.__writerDetect.at < 60_000) return g.__writerDetect.data;
  const dirs = [...new Set([path.join(home, ".local", "bin"), path.join(appData, "npm"), ...(process.env.PATH ?? "").split(path.delimiter)].filter(Boolean))];
  const found = new Map<string, CliAgent>();
  for (const dir of dirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      const m = f.match(/^((claude)(-[\w.-]+)?|(codex))\.(exe|cmd)$/i);
      if (!m) continue;
      const id = m[1].toLowerCase();
      // one entry per name; the native .exe wins over an npm .cmd shim
      if (found.has(id) && !/\.exe$/i.test(f)) continue;
      const kind = m[4] ? "codex" : "claude";
      // claude-<name>.cmd counts only when it is a Claude Code wrapper (e.g. claude-glm: env vars, then `claude %*`);
      // other claude-* helpers (desktop launcher, plugins, ssh) are not writers
      if (m[3] && !isClaudeWrapper(path.join(dir, f))) continue;
      const name = kind === "codex" ? "Codex CLI" : id === "claude" ? "Claude Code" : `Claude Code (${id.slice(7)})`;
      found.set(id, { id, name, kind, path: path.join(dir, f) });
    }
  }
  const ollamaExe = [path.join(localAppData, "Programs", "Ollama", "ollama.exe"), "/usr/local/bin/ollama", "/usr/bin/ollama"].some((p) => fs.existsSync(p));
  const models = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) })
    .then((r) => r.json() as Promise<{ models?: { name: string }[] }>)
    .then((j) => (j.models ?? []).map((x) => x.name))
    .catch(() => null);
  const envKeys = [...new Set(API_PRESETS.map((p) => p.env).filter((e) => e && process.env[e]))];
  const data: Detected = {
    clis: [...found.values()].sort((a, b) => a.id.localeCompare(b.id)),
    ollama: { installed: ollamaExe || !!models, running: !!models, models: models ?? [] },
    envKeys,
  };
  g.__writerDetect = { at: Date.now(), data };
  return data;
}

function isClaudeWrapper(file: string) {
  if (!/\.(cmd|bat)$/i.test(file)) return false;
  try {
    return /(^|[\s"\\/])claude(\.exe)?"?\s+%\*/im.test(fs.readFileSync(file, "utf8").slice(0, 4000));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- CLI agents

const TOOLS_OFF = "Bash,Edit,Write,Read,WebFetch,WebSearch,Glob,Grep,Task,NotebookEdit,TodoWrite";

/** Run an installed agent once on `prompt` (sent on stdin) and return its final answer. */
export async function askCli(agent: CliAgent, prompt: string, model = "", timeoutMs = 180_000): Promise<string> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trk-writer-")); // empty folder: nothing for the agent to read
  const outFile = path.join(cwd, "answer.txt");
  const args =
    agent.kind === "claude"
      ? // print mode, no hooks/plugins/MCP from the user's own setup, no tools, nothing saved to their history
        ["-p", "--output-format", "json", "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config", "--disallowedTools", TOOLS_OFF, ...(model ? ["--model", model] : [])]
      : ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "-o", outFile, ...(model ? ["-m", model] : []), "-"];
  try {
    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      // .cmd shims need a shell on Windows; the arguments above are fixed (the prompt goes over stdin, never the command line)
      const shell = /\.cmd$/i.test(agent.path);
      const child = spawn(shell ? `"${agent.path}"` : agent.path, args, { cwd, shell, windowsHide: true, env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => (child.kill(), reject(new Error(`${agent.name} tidak menjawab dalam ${Math.round(timeoutMs / 1000)} dtk.`))), timeoutMs);
      child.stdout.on("data", (c) => (stdout += c));
      child.stderr.on("data", (c) => (stderr += c));
      child.on("error", (e) => (clearTimeout(timer), reject(e)));
      // colour codes out of CLI error text
      const plain = (t: string) => t.replace(/\u001b\[[0-9;]*m/g, "");
      child.on("close", (code) => (clearTimeout(timer), resolve({ code, stdout: plain(stdout), stderr: plain(stderr) })));
      child.stdin.end(prompt);
    });
    if (agent.kind === "codex") {
      const answer = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim() : "";
      if (!answer) throw new Error(`Codex gagal (${code}): ${(stderr || stdout).trim().split("\n").slice(-2).join(" ").slice(0, 300)}`);
      return answer;
    }
    const last = stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
    const j = last ? (JSON.parse(last) as { result?: string; is_error?: boolean }) : null;
    if (!j || j.is_error || !j.result) throw new Error(`${agent.name}: ${(j?.result || stderr || stdout).trim().slice(0, 300) || `keluar dengan kode ${code}`}`);
    return j.result.trim();
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- OpenAI-compatible APIs

export async function askApi(cfg: ApiConfig, prompt: string, timeoutMs = 150_000): Promise<string> {
  const key = cfg.apiKey || (cfg.apiKeyEnv ? process.env[cfg.apiKeyEnv] : "") || "";
  if (!cfg.baseUrl || !cfg.model) throw new Error("Alamat API dan model wajib diisi.");
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], temperature: 0.8, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string } | null;
  const text = j?.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) {
    const msg = typeof j?.error === "string" ? j.error : j?.error?.message;
    throw new Error(`API ${res.status}: ${(msg || "jawaban kosong").slice(0, 300)}`);
  }
  return text;
}
