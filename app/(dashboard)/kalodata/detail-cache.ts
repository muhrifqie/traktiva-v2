import { kaloDetail } from "./actions";

// Product details shared by the list rows (prefetch on hover intent) and the detail dialog.
// ponytail: only the row the pointer rests on is prefetched — every detail costs ~6 requests of KaloData's daily
// DETAIL quota, so prefetching a whole list would empty a trial account in one go. Widen only with more sessions.

type Detail = Awaited<ReturnType<typeof kaloDetail>>;
const cache = new Map<string, Promise<Detail>>();

/** Detail for one product (one request in flight per product; failures are not cached). */
export function getDetail(id: string, country: string) {
  const key = `${country}:${id}`;
  let p = cache.get(key);
  if (!p) {
    p = kaloDetail(id, country);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Start loading the detail without waiting (errors surface when the dialog opens). */
export const prefetchDetail = (id: string, country: string) => void getDetail(id, country).catch(() => {});

/** Pointer/focus props for a row: prefetch after the pointer rests on it for 300 ms. */
export function intentProps(id: string, country: string) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return {
    onPointerEnter: () => (t = setTimeout(() => prefetchDetail(id, country), 300)),
    onPointerLeave: () => clearTimeout(t),
    onFocus: () => prefetchDetail(id, country),
  };
}
