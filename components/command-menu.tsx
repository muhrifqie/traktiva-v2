"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import { NAV } from "@/lib/nav";

export const OPEN_COMMAND = "traktiva:open-command";

// Global Ctrl/Cmd+K palette; any button can open it by dispatching OPEN_COMMAND on window.
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Cari menu" description="Ketik untuk pindah menu atau menjalankan aksi">
      <Command>
        <CommandInput autoFocus placeholder="Cari menu atau aksi..." />
        <CommandList>
          <CommandEmpty>Tidak ada yang cocok.</CommandEmpty>
          <CommandGroup heading="Aksi">
            <CommandItem onSelect={() => go("/jadwal")}><Plus />Buat jadwal baru</CommandItem>
            <CommandItem onSelect={() => go("/akun")}><Plus />Tambah akun</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Menu">
            {NAV.map((item) => {
              return (
                <CommandItem key={item.slug} value={`${item.title} ${item.desc}`} onSelect={() => go(`/${item.slug}`)}>
                  <item.icon className="text-black dark:text-white" />
                  {item.title}
                  <CommandShortcut>{item.group}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
