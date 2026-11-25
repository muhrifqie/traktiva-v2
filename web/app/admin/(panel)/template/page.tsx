import { asAdmin, type TemplateRow } from "@/lib/license-api";
import { PageHead } from "../ui";
import { TemplateManager } from "./forms";

export default async function Templates() {
  const { templates, rev } = await asAdmin<{ templates: TemplateRow[]; rev: number }>("/internal/templates");
  return (
    <>
      <PageHead
        title="Galeri template"
        sub={`Konsep video, gaya editor, dan naskah VO yang muncul di app Traktiva tanpa update app. Sampai ke app paling lambat 5 menit. Revisi ${rev}.`}
      />
      <TemplateManager templates={templates} />
    </>
  );
}
