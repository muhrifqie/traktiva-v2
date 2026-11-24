"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Dark/light like the desktop app: the "dark" class on <html>, remembered in the trk_theme cookie (read by the root layout). */
export function ThemeToggle({ initial, className = "" }: { initial: "dark" | "light"; className?: string }) {
  const [theme, setTheme] = useState(initial);
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `trk_theme=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.classList.toggle("dark", next === "dark");
        setTheme(next);
      }}
      aria-label={next === "light" ? "Ganti ke tampilan terang" : "Ganti ke tampilan gelap"}
      title={next === "light" ? "Tampilan terang" : "Tampilan gelap"}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground shadow-xs hover:text-foreground ${className}`}
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
