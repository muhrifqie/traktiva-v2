import { PlatformIcon } from "@/components/platform-icon";
import { navBySlug } from "@/lib/nav";

// Frameless page title (no bar, no divider): icon, title, one-line description, page actions on the right.
// Gutters come from the dashboard layout's safe area, so every page title lines up with its content.
/** `desc` replaces the menu description (e.g. "Data diperbarui …"). */
export function PageHeader({ slug, desc, children }: { slug: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  const item = navBySlug(slug);
  if (!item) return null;
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/50">
        {"platform" in item ? <PlatformIcon platform={item.platform} className="size-5" /> : <item.icon className="size-5 text-black dark:text-white" />}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold leading-tight tracking-tight">{item.title}</h1>
        <p className="truncate text-[13px] text-muted-foreground">{desc ?? item.desc}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
