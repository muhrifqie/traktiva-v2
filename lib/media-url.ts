/** Browser URL for a MEDIA_DIR-relative file (served by app/api/media); remote http(s) URLs pass through. Safe to import from client components. */
export const mediaUrl = (rel: string) => (/^https?:\/\//.test(rel) ? rel : `/api/media/${rel.split("/").map(encodeURIComponent).join("/")}`);
