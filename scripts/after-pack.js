// electron-builder drops node_modules from extraResources, so copy the Next standalone server ourselves.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

/** Every symlink under `dir` (Next puts some in .next/node_modules; they point at absolute paths of the build PC). */
function symlinks(dir, found = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) found.push(p);
    else if (e.isDirectory()) symlinks(p, found);
  }
  return found;
}

exports.default = async ({ appOutDir }) => {
  const dest = path.join(appOutDir, "resources", "app-server");
  fs.rmSync(dest, { recursive: true, force: true });
  // dereference: the standalone build links external packages (playwright-core, ffmpeg-static) to the build PC's
  // folders; copy the real files so the installed app does not depend on C:\BOT\... existing on the buyer's PC
  fs.cpSync(path.join(root, ".next", "standalone"), dest, { recursive: true, dereference: true });
  // cpSync's dereference leaves directory symlinks alone on Windows: replace each by a real copy of its target
  for (const link of symlinks(dest)) {
    const target = fs.realpathSync(link);
    fs.rmSync(link, { recursive: true, force: true });
    fs.cpSync(target, link, { recursive: true, dereference: true });
  }

  // the electron npm package (with its 350 MB dist/) is the desktop runtime, never loaded by the server. The trace of
  // instrumentation.js pulls it in anyway (a dynamic fs path in lib/flow2api.ts traces the whole project), which
  // doubled Electron inside the installer: drop it from the server copy.
  fs.rmSync(path.join(dest, "node_modules", "electron"), { recursive: true, force: true });

  // the standalone trace (Next 16 + Turbopack on Windows) leaves out .next/server/chunks/ssr: every page then fails
  // with "Cannot find module ../../chunks/ssr/[turbopack]_runtime.js". Ship the whole compiled server instead.
  fs.cpSync(path.join(root, ".next", "server"), path.join(dest, ".next", "server"), { recursive: true, filter: (src) => !src.endsWith(".map") });

  // files the tracer misses but the packages read at runtime
  for (const rel of ["node_modules/playwright-core/browsers.json"]) {
    const to = path.join(dest, rel);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(root, rel), to);
  }
  for (const dir of fs.readdirSync(path.join(dest, ".next", "node_modules"), { withFileTypes: true })) {
    if (dir.name.startsWith("playwright-core-")) {
      const to = path.join(dest, ".next", "node_modules", dir.name, "browsers.json");
      if (!fs.existsSync(to)) fs.copyFileSync(path.join(root, "node_modules/playwright-core/browsers.json"), to);
    }
  }

  // guard: a broken installer must fail the build, not reach buyers
  const links = symlinks(dest);
  if (links.length) throw new Error(`app-server masih berisi symlink (akan rusak di PC lain):\n${links.join("\n")}`);
  if (fs.existsSync(path.join(dest, "data"))) throw new Error("app-server berisi folder data/ (DB dev): build ulang dengan npm run build");

  if (!fs.existsSync(path.join(dest, ".next", "server", "chunks", "ssr", "[turbopack]_runtime.js"))) throw new Error("app-server tanpa .next/server/chunks/ssr: halaman tidak akan jalan");

  // video engine: the flow2api sidecar built by sidecar/flow2api/build.ps1
  const sidecar = path.join(root, "dist-sidecar", "flow2api");
  if (!fs.existsSync(path.join(sidecar, "flow2api.exe"))) throw new Error("dist-sidecar/flow2api belum ada: jalankan sidecar/flow2api/build.ps1 dulu");
  const engine = path.join(appOutDir, "resources", "flow2api");
  fs.rmSync(engine, { recursive: true, force: true });
  fs.cpSync(sidecar, engine, { recursive: true });
};
