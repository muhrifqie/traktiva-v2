"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { Flag } from "@/components/flag";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COUNTRIES, countryOf, REGIONS } from "@/lib/countries";

/** Flag + code, e.g. 🇮🇩 ID (drawn as SVG). */
export const CountryBadge = ({ code, className = "" }: { code: string; className?: string }) => (
  <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${className}`}>
    <Flag code={code} /> {code === "GB" ? "UK" : code}
  </span>
);

type Option = { code: string; disabled?: boolean; hint?: string };

/** Compact market picker: the trigger shows flag + code; the menu shows flag + full name (+ hint). */
export function CountrySelect({
  value, onChange, options, disabled, label = "Negara", title,
}: { value: string; onChange: (code: string) => void; options?: Option[]; disabled?: boolean; label?: string; title?: string }) {
  const list: Option[] = options ?? COUNTRIES.map((c) => ({ code: c.code }));
  const current = countryOf(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        title={title ?? `${label}: ${current?.name ?? "-"}`}
        aria-label={label}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-70"
      >
        {current ? <Flag code={current.code} /> : <Globe className="size-4 text-muted-foreground" />}
        {current ? (current.code === "GB" ? "UK" : current.code) : "Negara"}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
        {REGIONS.map((region) => {
          const items = list.filter((o) => countryOf(o.code)?.region === region);
          if (!items.length) return null;
          return (
            <DropdownMenuGroup key={region}>
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">{list.length > 8 ? region : label}</DropdownMenuLabel>
              {items.map((o) => {
                const c = countryOf(o.code)!;
                return (
                  <DropdownMenuItem key={o.code} disabled={o.disabled} onClick={() => !o.disabled && o.code !== value && onChange(o.code)} className="gap-2.5 py-1.5">
                    <Flag code={c.code} className={`h-3.5 w-5 ${o.disabled ? "opacity-40 grayscale" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{c.name}</span>
                      {o.hint && <span className="block truncate text-[10px] text-muted-foreground">{o.hint}</span>}
                    </span>
                    {o.code === value && <Check className="size-3.5 text-brand-light" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
