import "server-only";

// Live progress of an account sync (TikTok profile + videos, showcase, YouTube Studio), read by the "Tambahkan akun"
// progress panel every second. In memory only: a restart just shows the step without its counter.
export type SyncProgress = { stage: string; n?: number; total?: number; at: number };

const g = globalThis as unknown as { __syncProgress?: Map<number, SyncProgress> };
const map = (g.__syncProgress ??= new Map());

export const reportSync = (accountId: number, stage: string, n?: number, total?: number) => void map.set(accountId, { stage, n, total, at: Date.now() });
export const readSync = (accountId: number) => map.get(accountId) ?? null;
