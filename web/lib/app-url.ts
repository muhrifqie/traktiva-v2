/** Absolute link to the account host (app.traktiva.site) from marketing pages; relative in dev (SITE_URL unset).
 *  Pages on traktiva.site that link to /daftar, /beli, ... would otherwise prefetch a cross-origin redirect. */
export const appUrl = (path: string) => (process.env.SITE_URL || "").replace(/\/+$/, "") + path;
