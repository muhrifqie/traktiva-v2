import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Prose } from "../_ui";

export const metadata: Metadata = {
  title: "Ketentuan Layanan",
  description: "Aturan pemakaian Traktiva: lisensi, jumlah PC, pembayaran, pemakaian akun platform, dan batas tanggung jawab.",
  alternates: { canonical: "https://traktiva.site/ketentuan" },
};

export default function Terms() {
  return (
    <main>
      <PageHero eyebrow="Legal" title="Ketentuan Layanan" sub="Dengan membuat akun atau memakai app Traktiva, kamu setuju dengan ketentuan di bawah." />
      <Prose updated="23 November 2026">
        <h2>1. Layanan</h2>
        <p>Traktiva adalah app Windows untuk membantu membuat dan menjadwalkan video affiliate. Traktiva bukan produk resmi dan tidak berafiliasi dengan TikTok, Google, atau KaloData.</p>

        <h2>2. Lisensi</h2>
        <ul>
          <li>Setiap key berlaku sesuai paket: masa aktif dan jumlah PC tertentu.</li>
          <li>Key untuk pemakaian kamu atau timmu sendiri. Menjual kembali, membagikan secara publik, atau memakai key di lebih banyak PC dari paketnya tidak diperbolehkan.</li>
          <li>Pindah PC bisa dilakukan sendiri dari akun member sesuai batas yang berlaku (saat ini 1× per hari per lisensi).</li>
          <li>Kami dapat menangguhkan atau mencabut key yang disalahgunakan.</li>
        </ul>

        <h2>3. Pembayaran & perpanjangan</h2>
        <ul>
          <li>Harga tercantum di halaman <Link href="/harga" className="underline hover:text-foreground">Harga</Link>. Pembayaran online memakai QRIS; nominal bisa berisi kode unik kecil untuk pencocokan.</li>
          <li>Lisensi aktif otomatis setelah pembayaran terkonfirmasi. Perpanjangan menambah masa aktif dari tanggal habis yang berjalan.</li>
          <li>Pertanyaan soal pembayaran atau pengembalian dana: hubungi kami lewat <Link href="/kontak" className="underline hover:text-foreground">kontak</Link> dengan menyertakan nomor pesanan.</li>
        </ul>

        <h2>4. Akun platform kamu</h2>
        <ul>
          <li>App memakai akun TikTok dan Google milikmu sendiri, login di PC-mu. Kamu bertanggung jawab atas konten yang diunggah dan kepatuhan pada aturan masing-masing platform.</li>
          <li>Platform dapat membatasi akun yang mengunggah terlalu banyak atau melanggar aturan mereka. Mulai pelan dan naikkan jumlah unggahan bertahap.</li>
          <li>Traktiva tidak mencoba melewati captcha atau verifikasi. Jika muncul, app berhenti dan kamu menyelesaikannya sendiri.</li>
        </ul>

        <h2>5. Konten & AI</h2>
        <p>Naskah, gambar, klip, dan suara dibuat dengan AI berdasarkan produk yang kamu pilih. Periksa hasilnya sebelum diunggah, termasuk klaim produk dan musik yang dipakai.</p>

        <h2>6. Ketersediaan</h2>
        <p>App perlu terhubung ke server lisensi secara berkala. Kami berusaha menjaga layanan tetap berjalan, tetapi tidak menjamin layanan bebas gangguan sepenuhnya, termasuk gangguan dari layanan pihak ketiga.</p>

        <h2>7. Batas tanggung jawab</h2>
        <p>Sejauh diizinkan hukum, Traktiva tidak bertanggung jawab atas kerugian tidak langsung, termasuk pembatasan akun oleh platform atau hasil penjualan affiliate. Tanggung jawab kami paling banyak sebesar biaya lisensi yang kamu bayar untuk periode berjalan.</p>

        <h2>8. Perubahan</h2>
        <p>Ketentuan ini bisa diperbarui. Perubahan penting diumumkan di akun member; memakai layanan setelah perubahan berarti setuju dengan versi terbaru. Lihat juga <Link href="/privasi" className="underline hover:text-foreground">Kebijakan Privasi</Link>.</p>
      </Prose>
    </main>
  );
}
