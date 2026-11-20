// electron-builder drops node_modules from extraResources, so copy the Next standalone server ourselves.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async ({ appOutDir }) => {
  const dest = path.join(appOutDir, "resources", "app-server");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(__dirname, "..", ".next", "standalone"), dest, { recursive: true });

  // video engine: the flow2api sidecar built by sidecar/flow2api/build.ps1
  const sidecar = path.join(__dirname, "..", "dist-sidecar", "flow2api");
  if (!fs.existsSync(path.join(sidecar, "flow2api.exe"))) throw new Error("dist-sidecar/flow2api belum ada: jalankan sidecar/flow2api/build.ps1 dulu");
  const engine = path.join(appOutDir, "resources", "flow2api");
  fs.rmSync(engine, { recursive: true, force: true });
  fs.cpSync(sidecar, engine, { recursive: true });
};
