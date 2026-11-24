// Dev check for the flow2api runtime: picks sidecar/source, prepares config, starts it, checks health + admin login.
// Usage: npx tsx --conditions=react-server scripts/try-flow2api.mts
import { checkFlow2Api, loadFlow2ApiConfig, requireFlow2Api } from "@/lib/flow2api";

const t0 = Date.now();
const cfg = loadFlow2ApiConfig();
console.log("config:", cfg ? { baseUrl: cfg.baseUrl, adminUser: cfg.adminUser, apiKey: cfg.apiKey ? "(set)" : "" } : null);
if (!cfg) process.exit(1);
await requireFlow2Api();
console.log(`running after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("check:", await checkFlow2Api(cfg));
process.exit(0);
