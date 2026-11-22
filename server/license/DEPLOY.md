# Deploy server lisensi + website (VPS traktiva)

Server: **VPS `traktiva`** (`43.133.142.25`, Ubuntu 24.04, user `ubuntu`, login SSH key saja). Detail server, backup, rollback: `OPS.md`. Config nginx yang live: folder `nginx/` (salinan; ubah di server lalu salin balik ke sini).

Akses SSH (`~/.ssh/config`):

```
Host traktiva
    HostName 43.133.142.25
    User ubuntu
    IdentityFile ~/.ssh/traktiva
    IdentitiesOnly yes
```

Key baru: `ssh-keygen -t ed25519 -f ~/.ssh/traktiva`, kirim isi `.pub` ke yang sudah punya akses untuk ditambah ke `~/.ssh/authorized_keys`. Password SSH dimatikan; 5× gagal = IP diblokir 1 jam (fail2ban).

**Jangan** sentuh `/srv/traktiva-license/data` (DB, `secrets.json`, `service-token`, `waroengpay.json`, `verify.json`) dan sertifikat 8443 (`/etc/nginx/ssl/traktiva-license.*`): kunci publik & sidik jari sertifikat tertanam di installer.

## Alamat

| Host | Isi |
|---|---|
| `traktiva.site` | landing, harga (`www.` → sini) |
| `app.traktiva.site` | area member: masuk, daftar, beli, akun, lisensi, OAuth + webhook bayar (`/api/*`) |
| `admin.traktiva.site` | panel admin (`/admin`) |
| `api.traktiva.site` | API lisensi (`/v1`, `/health`) untuk installer berikutnya |
| `download.traktiva.site` | file installer dari `/srv/traktiva-download` |
| `43.156.15.173:8443` | API lisensi untuk app yang sudah terpasang (sertifikat di-pin). Server lama meneruskan TCP ke VPS ini (`nginx/old-server-stream.conf`, PROXY protocol); halaman web di alamat ini dialihkan ke domain |

Satu app Next.js (pm2 `traktiva-web`, `127.0.0.1:3821`) melayani landing, member, dan admin; nginx (`nginx/traktiva-site-ssl.conf`) membagi per host. Cookie login berlaku di semua subdomain (`COOKIE_DOMAIN=.traktiva.site`), jadi login di `app.` juga berlaku di `admin.`. Sertifikat Let's Encrypt satu untuk 6 nama, diperpanjang otomatis (`certbot.timer`, webroot `/var/www/acme`).

DNS di Cloudflare: record A `@ www app admin api download` → `43.133.142.25`, **DNS only** (awan abu-abu), karena rate limit nginx memakai IP pengunjung.

## 1. Server lisensi

```bash
scp server/license/{lib,server,admin,internal-api,members,payments,verify,test}.mjs traktiva:/tmp/trk-deploy/
ssh traktiva
cd /tmp/trk-deploy && node test.mjs                                                # harus: license server ok / internal api ok
cd /srv/traktiva-license && ./backup.sh                                            # backup terenkripsi dulu
d=.prev-$(date +%Y%m%d-%H%M) && mkdir -p $d && cp *.mjs $d/                        # untuk rollback
cp /tmp/trk-deploy/*.mjs . && pm2 restart traktiva-license traktiva-license-internal
curl -s http://127.0.0.1:3820/health                                               # {"ok":true,...}
```

Migrasi DB jalan otomatis saat start (kolom/tabel baru ditambah, data lama tidak diubah).

## 2. Website (Next.js standalone)

Di PC (Git Bash):

```bash
cd web && npm ci && npm run build
rm -rf /tmp/webpkg && mkdir -p /tmp/webpkg/.next
cp -r .next/standalone/. /tmp/webpkg/ && cp -r .next/static /tmp/webpkg/.next/static && cp -r public /tmp/webpkg/public
find /tmp/webpkg -maxdepth 2 -name ".env*" -delete                                 # jangan ikut .env lokal
tar --force-local -czf /tmp/webpkg.tgz -C /tmp/webpkg . && scp /tmp/webpkg.tgz traktiva:/tmp/
```

Di server:

```bash
rm -rf ~/traktiva-web.prev && cp -a /srv/traktiva-web ~/traktiva-web.prev          # rollback = salin balik + pm2 restart
rm -rf /tmp/webnew && mkdir /tmp/webnew && tar -xzf /tmp/webpkg.tgz -C /tmp/webnew
cd /srv/traktiva-web && find . -mindepth 1 -maxdepth 1 ! -name ecosystem.config.cjs -exec rm -rf {} + && cp -a /tmp/webnew/. .
pm2 restart traktiva-web --update-env
```

`ecosystem.config.cjs` (600) berisi env web: `SITE_URL=https://app.traktiva.site`, `COOKIE_DOMAIN=.traktiva.site`, `ADMIN_COOKIE_SECURE=1`, token layanan dibaca dari `data/service-token`. **Jangan ditimpa.**

## 3. Cek

```bash
c(){ printf "%-44s " "$1"; curl -sk -o /dev/null -w "%{http_code} %{redirect_url}\n" "$1"; }
c https://traktiva.site/                   # 200
c https://app.traktiva.site/lisensi        # 307 -> /masuk
c https://admin.traktiva.site/admin/login  # 200
c https://api.traktiva.site/health         # 200
c https://43.156.15.173:8443/health        # 200 (app terpasang)
c https://43.156.15.173:8443/akun          # 302 -> traktiva.site
ssh traktiva 'pm2 logs traktiva-web --lines 30 --nostream'
```

## Berikutnya

- Login Google: OAuth Client di Google Cloud dengan redirect `https://app.traktiva.site/api/auth/google/callback`, isi `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` di `ecosystem.config.cjs`.
- Email dari `noreply@traktiva.site`: verifikasi domain di SumoPod (TXT DKIM/SPF di Cloudflare), lalu ubah `from` klien `traktiva` di Waroengku Verify (`serverku:/srv/waroeng-verify/clients.json`).
- Installer berikutnya: arahkan API app ke `https://api.traktiva.site` (sertifikat CA biasa). Selama masih ada app lama, alamat 8443 di server lama tetap wajib hidup.
