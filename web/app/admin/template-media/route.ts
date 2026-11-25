import { ApiError, uploadTemplateMedia } from "@/lib/license-api";

// Galeri template → cover / preview upload (the panel sends the file as the raw body; nginx allows 13 MB here only)
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!req.body) return Response.json({ ok: false, message: "File kosong." }, { status: 400 });
  try {
    return Response.json({ ok: true, url: await uploadTemplateMedia(req.body, type) });
  } catch (e) {
    if (e instanceof Error && "digest" in e) throw e; // redirect to the login page
    return Response.json({ ok: false, message: e instanceof Error ? e.message : "Upload gagal" }, { status: e instanceof ApiError ? e.status : 500 });
  }
}
