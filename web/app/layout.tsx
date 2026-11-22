import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] }); // website headings (.creator)

export const metadata: Metadata = {
  title: { default: "Traktiva", template: "%s · Traktiva" },
  description: "Studio video affiliate TikTok Shop otomatis.",
};

/** Same theme switch as the desktop app: the "dark" class on <html>; the choice lives in the trk_theme cookie (default dark). */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const dark = (await cookies()).get("trk_theme")?.value !== "light";
  return (
    <html lang="id" className={`${dark ? "dark " : ""}${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
