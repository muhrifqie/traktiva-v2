import type { Metadata } from "next";
import { Unsubscribe } from "./form";

export const metadata: Metadata = { title: "Berhenti berlangganan", robots: { index: false, follow: false } };

/** Target of the link at the bottom of broadcast emails. A button (not the link itself) unsubscribes, so mail scanners
 *  that open links cannot do it by accident. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = "", t = "" } = await searchParams;
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-md content-center px-5 py-14">
      <div className="rounded-xl border bg-card p-6 md:p-8">
        <h1 className="text-xl font-semibold">Berhenti menerima info & promo</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Kamu tidak akan menerima email kabar fitur dan promo lagi. Kode verifikasi, struk pembayaran, pengingat lisensi, dan peringatan keamanan tetap dikirim.
        </p>
        {u && t ? <Unsubscribe u={u} t={t} /> : <p className="mt-6 text-sm text-red-600 dark:text-red-300">Link tidak lengkap. Buka lagi dari email, atau atur di Pengaturan akun.</p>}
      </div>
    </main>
  );
}
