import "server-only";
import { generateFlowImage, generateFlowVideo, type Progress } from "@/lib/flow2api";
import { browserFlowImage, browserFlowVideo } from "@/lib/platforms/flow-browser";
import type { FlowEngine } from "@/lib/settings";

// One entry point for Flow images/videos, whichever engine makes them:
//   api     — flow2api (fast; captcha solved by its own browser pool)
//   browser — the Google account's own browser profile opens Flow and drives the page like a person
//   auto    — api first; when the engine itself is the problem (down, captcha, no usable account, queue),
//             the same job is done in the browser instead. Content/credit errors are NOT retried in the
//             browser: they would fail there too and burn credits.

const ENGINE_TROUBLE =
  /mesin video|flow2api 5\d\d|ECONNREFUSED|fetch failed|captcha|recaptcha|queue wait timeout|antrean flow|tidak ada akun flow|semua akun flow|没有可用的Token|No available (token|projects)|browser verifikasi|token flow sedang|timeout|aborted|respons kosong|terminated/i;
const NOT_ENGINE = /kredit|credit|policy|kebijakan|safety|blocked|diblokir|tidak pantas|invalid prompt/i;

const msg = (e: unknown) => `${e instanceof Error ? e.message : String(e)} ${e instanceof Error ? String(e.cause ?? "") : ""}`;
export const isEngineTrouble = (e: unknown) => ENGINE_TROUBLE.test(msg(e)) && !NOT_ENGINE.test(msg(e));

async function viaApiThenBrowser<T>(engine: FlowEngine, api: () => Promise<T>, browser: () => Promise<T>, onStage: Progress) {
  if (engine === "browser") return browser();
  try {
    return await api();
  } catch (e) {
    if (engine === "api" || !isEngineTrouble(e)) throw e;
    onStage("Mesin API bermasalah, pindah ke browser...", 5);
    try {
      return await browser();
    } catch (b) {
      // both failed: lead with the API reason (usually the real cause), then what the browser hit
      const why = (x: unknown) => (x instanceof Error ? x.message : String(x)).replace(/\s*\(asli:[^)]*\)/, "");
      throw new Error(`API: ${why(e)} · Browser: ${why(b)}`, { cause: b });
    }
  }
}

/** Image from product/style reference images (data URLs). Returns an http(s) URL or a data URL. */
export function makeFlowImage(engine: FlowEngine, prompt: string, refs: string[], onStage: Progress) {
  return viaApiThenBrowser(engine, () => generateFlowImage(prompt, refs, onStage), () => browserFlowImage(prompt, refs, onStage), onStage);
}

/** Clip from one start frame (data URL). `model` is the flow2api model id; `sec` the clip length. */
export function makeFlowVideo(engine: FlowEngine, spec: { model: string; sec: number }, prompt: string, frames: string[], onStage: Progress) {
  return viaApiThenBrowser(engine, () => generateFlowVideo(spec.model, prompt, onStage, frames), () => browserFlowVideo(prompt, frames, spec.sec, onStage), onStage);
}
