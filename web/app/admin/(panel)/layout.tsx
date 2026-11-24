import type { Metadata } from "next";
import { requireAdmin } from "@/lib/license-api";
import { Sidebar } from "./sidebar";

export const metadata: Metadata = { title: "Admin lisensi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { name } = await requireAdmin();
  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[auto_1fr] bg-sidebar md:grid-cols-[224px_1fr] md:grid-rows-1">
      <Sidebar name={name} />
      <main className="overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-none border-border bg-background md:m-2 md:ml-0 md:rounded-2xl md:border">
        <div className="mx-auto max-w-6xl px-5 py-6 md:px-7">{children}</div>
      </main>
    </div>
  );
}
