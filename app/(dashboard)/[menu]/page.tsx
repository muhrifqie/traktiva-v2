import { notFound } from "next/navigation";
import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { navBySlug } from "@/lib/nav";

// ponytail: one placeholder route for every unbuilt menu; a real page folder overrides it
export default async function MenuPlaceholder({ params }: PageProps<"/[menu]">) {
  const { menu } = await params;
  const item = navBySlug(menu);
  if (!item) notFound();
  return (
    <>
      <PageHeader slug={item.slug} />
      <div className="grid flex-1 place-items-center text-center">
        <div className="max-w-sm space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border bg-muted/50">
            <item.icon className="size-6 text-black dark:text-white" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">{item.title}</p>
            <p className="text-[13px] text-muted-foreground">{item.desc}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <Hammer className="size-3" /> Sedang dibangun
          </span>
        </div>
      </div>
    </>
  );
}
