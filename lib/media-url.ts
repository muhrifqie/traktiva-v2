/** Browser URL for a MEDIA_DIR-relative file (served by app/api/media). Safe to import from client components. */
export const mediaUrl = (rel: string) =>
  /^(https?:|data:|blob:|\/)/.test(rel) ? rel : `/api/media/${rel.split("/").map(encodeURIComponent).join("/")}`; // absolute URLs pass through (e.g. product gallery CDN)
