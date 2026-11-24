/** Compare "1.2.10" with "1.2.9" numerically (missing parts = 0). */
export function cmpVersion(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type AppStatus = "latest" | "update" | "required" | "unknown";

/** Where an installed app stands against the releases (newest first). */
export function appStatus(installed: string | null, releases: { version: string; mandatory: number }[]): AppStatus {
  if (!installed || !releases.length) return "unknown";
  if (cmpVersion(installed, releases[0].version) >= 0) return "latest";
  const mustHave = releases.filter((r) => r.mandatory).sort((x, y) => cmpVersion(y.version, x.version))[0];
  return mustHave && cmpVersion(installed, mustHave.version) < 0 ? "required" : "update";
}
