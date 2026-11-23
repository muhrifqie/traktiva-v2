import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Prose } from "../_ui";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: "Data apa yang dikumpulkan Traktiva, untuk apa, berapa lama disimpan, dan hak kamu atas data itu.",
  alternates: { canonical: "https://traktiva.site/privasi" },
};

// Keep in sync with what the code actually collects (server/license, web/, electron/license.js).
export default function Privacy() {
  return (
    <main>
      <PageHero eyebrow="Legal" title="Kebijakan Privasi" sub="Ringkasnya: kami hanya menyimpan data yang perlu untuk akun, lisensi, dan pembayaran. Akun TikTok dan Google kamu tetap di PC kamu." />
      <Prose updated="23 November 2026">
        <h2>1. Data yang kami simpan</h2>
        <ul>
          <li><b>Akun website</b>: nama, email, nomor WhatsApp (opsional), dan password dalam bentuk hash (tidak bisa dibaca kembali).</li>
          <li><b>Masuk dengan Google</b>: nama, email, foto profil, dan ID akun Google. Kami tidak menerima password Google kamu.</li>
          <li><b>Lisensi & PC</b>: key lisensi (tersimpan terenkripsi), masa aktif, nama PC, versi app, dan sidik jari perangkat berupa hash per komponen (misalnya motherboard, CPU, disk). Hash ini hanya dipakai untuk memastikan key dipakai di PC yang benar.</li>
          <li><b>Keamanan</b>: alamat IP, jenis browser, waktu masuk, dan riwayat aktivitas akun (misalnya masuk, aktivasi PC, pembayaran).</li>
          <li><b>Pembayaran</b>: nomor pesanan, paket, nominal, dan status. Pembayaran QRIS diproses oleh WaroengPay; kami tidak menerima data rekening, kartu, atau PIN kamu.</li>
        </ul>

        <h2>2. Yang tidak kami simpan</h2>
        <p>Login akun media sosial dan Google di app Traktiva terjadi di Chrome di PC kamu sendiri. Sesi login, video, dan file proyek tersimpan di PC itu, bukan di server kami.</p>

        <h2>3. Untuk apa data dipakai</h2>
        <ul>
          <li>Menjalankan akun, mengaktifkan lisensi, dan membatasi jumlah PC sesuai paket.</li>
          <li>Memproses pembayaran dan menampilkan riwayat pesanan.</li>
          <li>Mengirim kode lupa password dan, kalau kamu mengisi nomor WhatsApp, pengingat sebelum lisensi habis.</li>
          <li>Mencegah penyalahgunaan: batas percobaan masuk dan pemeriksaan bot oleh Cloudflare Turnstile di halaman masuk, daftar, dan lupa password.</li>
          <li>Menampilkan pengumuman dan info update di app dan akun member.</li>
        </ul>
        <p>Kami tidak menjual data kamu dan tidak memakainya untuk iklan.</p>

        <h2>4. Pihak lain yang terlibat</h2>
        <ul>
          <li><b>WaroengPay</b>: pemrosesan pembayaran QRIS.</li>
          <li><b>Google</b>: jika kamu memilih Masuk dengan Google.</li>
          <li><b>Cloudflare</b>: DNS dan pemeriksaan bot (Turnstile).</li>
          <li><b>Penyedia email</b>: pengiriman kode lupa password.</li>
        </ul>

        <h2>5. Berapa lama disimpan</h2>
        <p>Data akun dan lisensi disimpan selama akun aktif. Cadangan database dienkripsi dan diputar secara berkala. Jika akun dihapus, datanya ikut dihapus kecuali catatan pembayaran yang perlu disimpan untuk keperluan pembukuan.</p>

        <h2>6. Hak kamu</h2>
        <p>Kamu bisa melihat dan mengubah profil di halaman Pengaturan akun, mengeluarkan perangkat yang masuk, dan meminta salinan atau penghapusan data lewat <Link href="/kontak" className="underline hover:text-foreground">kontak kami</Link>.</p>

        <h2>7. Cookie</h2>
        <p>Kami memakai cookie yang diperlukan saja: sesi masuk, pilihan tema gelap/terang, dan cookie sementara saat masuk dengan Google. Tidak ada cookie iklan atau pelacak pihak ketiga.</p>

        <h2>8. Perubahan</h2>
        <p>Kebijakan ini bisa diperbarui. Tanggal perubahan terakhir tercantum di bawah; perubahan penting diumumkan di akun member.</p>
      </Prose>
    </main>
  );
}
