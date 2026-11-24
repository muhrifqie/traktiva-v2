import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Cancelling a running project ("Batalkan"). Each project job gets an AbortController; the job's code runs inside
// an AsyncLocalStorage context so deep calls (flow2api requests, retries) can see the cancel without passing a
// signal through every function. Kept on globalThis so dev hot-reloads share one registry.

// The context holds the run's own controller: a run cancelled and then restarted keeps seeing its own (aborted)
// controller, so the old run never carries on alongside the new one.
type Run = { id: number; ctrl: AbortController };
const g = globalThis as unknown as { __jobCtrls?: Map<number, AbortController>; __jobCtx?: AsyncLocalStorage<Run> };
const ctrls = (g.__jobCtrls ??= new Map<number, AbortController>());
const ctx = (g.__jobCtx ??= new AsyncLocalStorage<Run>());

export class Cancelled extends Error {
  constructor() {
    super("Dibatalkan.");
    this.name = "Cancelled";
  }
}

/** A new run of this project starts: forget an earlier cancel. */
export function beginJob(id: number) {
  if (ctrls.get(id)?.signal.aborted) ctrls.delete(id);
  if (!ctrls.has(id)) ctrls.set(id, new AbortController());
}

/** Run `fn` as part of project `id`'s job (flow2api calls inside it are aborted on cancel). */
export function inJob<T>(id: number, fn: () => Promise<T>): Promise<T> {
  if (!ctrls.has(id)) ctrls.set(id, new AbortController());
  return ctx.run({ id, ctrl: ctrls.get(id)! }, fn);
}

export function cancelJob(id: number) {
  const c = ctrls.get(id) ?? new AbortController();
  ctrls.set(id, c);
  c.abort(new Cancelled());
}

/** Inside a run of this project: that run's own state; elsewhere: the project's latest run. */
export function isCancelled(id: number) {
  const run = ctx.getStore();
  return run?.id === id ? run.ctrl.signal.aborted : !!ctrls.get(id)?.signal.aborted;
}

/** The cancel signal of the job this code runs in (undefined outside a job). */
export const jobSignal = (): AbortSignal | undefined => ctx.getStore()?.ctrl.signal;

export function throwIfCancelled(id?: number) {
  const run = ctx.getStore();
  if (id == null ? run?.ctrl.signal.aborted : isCancelled(id)) throw new Cancelled();
}
