# Deploy website + domain traktiva.site

Untuk siapa: yang deploy ke VPS **shopeeboosthelper** (`43.156.15.173`, user `ubuntu`, pm2). Baca juga `OPS.md` (detail server lisensi, backup, rollback).

Branch yang di-deploy: **`rifq/admin-plus`** (website + server lisensi; tidak berisi perubahan app desktop).

## 0. Syarat

- DNS di Cloudflare (`anton/kara.ns.cloudflare.com`): record **A `@` → `43.156.15.173`** dan **A `www` → `43.156.15.173`**, proxy **DNS only** (awan abu-abu). Cek: `nslookup traktiva.site 1.1.1.1` harus `43.156.15.173`.
  Kenapa bukan proxy oranye: rate limit login di nginx memakai IP pengunjung; lewat proxy semua pengunjung terlihat sebagai IP Cloudflare.
- Akses SSH ke `shopeeboosthelper` (sudo tanpa password sudah ada).
- **Jangan** sentuh `/srv/traktiva-license/data` (DB, `secrets.json`, `service-token`, `waroengpay.json`, `verify.json`) dan sertifikat 8443 (`/etc/nginx/ssl/traktiva-license.*`): kunci publik & sidik jari sertifikat tertanam di installer.

## 1. Server lisensi

```bash
git fetch origin && git checkout rifq/admin-plus && git pull
scp server/license/{lib,server,admin,internal-api,members,payments,totp,verify,test}.mjs server/license/OPS.md shopeeboosthelper:/tmp/trk-deploy/
ssh shopeeboosthelper
cd /tmp/trk-deploy && cp -n /srv/traktiva-license/*.mjs . && node test.mjs        # harus: license server ok / internal api ok
cd /srv/traktiva-license && ./backup.sh                                           # backup terenkripsi dulu
mkdir -p .prev-$(date +%Y%m%d) && cp *.mjs OPS.md .prev-$(date +%Y%m%d)/          # untuk rollback
cp /tmp/trk-deploy/*.mjs /tmp/trk-deploy/OPS.md . && pm2 restart traktiva-license traktiva-license-internal
curl -s http://127.0.0.1:3820/health                                              # {"ok":true,...}
```

Migrasi DB jalan otomatis saat start (kolom/tabel baru ditambah, data lama tidak diubah).

## 2. Website (Next.js standalone)

Di PC (Windows, Git Bash):

```bash
cd web && npm ci && npm run build
rm -rf /tmp/webpkg && mkdir -p /tmp/webpkg/.next
cp -r .next/standalone/. /tmp/webpkg/ && cp -r .next/static /tmp/webpkg/.next/static && cp -r public /tmp/webpkg/public
find /tmp/webpkg -maxdepth 2 -name ".env*" -delete                               # jangan ikut .env lokal
tar --force-local -czf /tmp/webpkg.tgz -C /tmp/webpkg . && scp /tmp/webpkg.tgz shopeeboosthelper:/tmp/
```

Di server:

```bash
cp -a /srv/traktiva-web ~/traktiva-web.prev                                       # rollback = salin balik + pm2 restart
rm -rf /tmp/webnew && mkdir /tmp/webnew && tar -xzf /tmp/webpkg.tgz -C /tmp/webnew
cd /srv/traktiva-web && find . -mindepth 1 -maxdepth 1 ! -name ecosystem.config.cjs -exec rm -rf {} + && cp -a /tmp/webnew/. .
pm2 restart traktiva-web --update-env
```

`ecosystem.config.cjs` (600) berisi env web (token layanan dll.): **jangan ditimpa**.

## 3. Domain + SSL (sekali saja)

Buat `/etc/nginx/sites-available/traktiva-site` (zona `limit_req` dipakai bersama dari file `traktiva-license`):

```nginx
server {
    listen 80; listen [::]:80;
    server_name traktiva.site www.traktiva.site;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://traktiva.site$request_uri; }
}
server {
    listen 443 ssl; listen [::]:443 ssl; http2 on;
    server_name traktiva.site www.traktiva.site;
    # certbot mengisi ssl_certificate / ssl_certificate_key di sini
    if ($host = www.traktiva.site) { return 301 https://traktiva.site$request_uri; }
    client_max_body_size 2m;

    location ~ ^/(v1/|health$) {                     # API lisensi (untuk installer berikutnya)
        limit_req zone=trk_license burst=20 nodelay;
        proxy_pass http://127.0.0.1:3820;
        proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https;
    }
    location ~ ^/(admin/login|masuk)$ {
        limit_req zone=trk_admin_login burst=5 nodelay;
        include /etc/nginx/snippets/traktiva-admin-proxy.conf;
    }
    location / {
        limit_req zone=trk_admin burst=60 nodelay;
        include /etc/nginx/snippets/traktiva-admin-proxy.conf;
    }
}
```

```bash
sudo cp /etc/nginx/sites-available/traktiva-license ~/nginx-traktiva-license.bak     # backup
sudo ln -s /etc/nginx/sites-available/traktiva-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d traktiva.site -d www.traktiva.site --redirect -m <email-owner> --agree-tos -n
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://traktiva.site | head -1                                         # HTTP/2 200
systemctl list-timers | grep certbot                                             # perpanjang otomatis
```

Port **8443 tetap hidup** (app desktop yang sudah terpasang memakai alamat & sertifikat itu).

## 4. Alamat situs = domain

- Web: di `/srv/traktiva-web/ecosystem.config.cjs` set `SITE_URL: "https://traktiva.site"` (cookie `Secure` tetap `ADMIN_COOKIE_SECURE=1`), lalu `pm2 restart traktiva-web --update-env`.
- Server lisensi: di `/srv/traktiva-license/data/waroengpay.json` ubah `"siteUrl"` jadi `"https://traktiva.site"` (file dibaca ulang otomatis). Webhook WaroengPay sekarang bisa masuk karena sertifikatnya asli; polling tiap menit tetap jalan sebagai cadangan.
- `admin.mjs` (link atur password): `SITE_URL=https://traktiva.site node admin.mjs member-link <email>`.

## 5. Cek

```bash
for p in / /harga /masuk /akun /lisensi /aplikasi /admin/login; do printf "%-12s %s\n" $p $(curl -s -o /dev/null -w "%{http_code}" https://traktiva.site$p); done
# 200 untuk halaman publik, 307 (ke /masuk) untuk halaman akun
curl -s -o /dev/null -w "%{http_code}\n" https://traktiva.site/akun/lisensi        # 308 → /lisensi
curl -s https://traktiva.site/health                                              # {"ok":true,...}
pm2 logs traktiva-web --lines 30 --nostream
```

## Opsional berikutnya

- Login Google: OAuth Client di Google Cloud dengan redirect `https://traktiva.site/api/auth/google/callback`, isi `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` di `ecosystem.config.cjs`.
- Email dari `noreply@traktiva.site`: verifikasi domain di SumoPod (TXT DKIM/SPF/verifikasi di Cloudflare), lalu ubah `from` klien `traktiva` di Waroengku Verify (`serverku:/srv/waroeng-verify/clients.json`).
- Installer berikutnya: arahkan app ke `https://traktiva.site` (sertifikat CA biasa, bukan pin sertifikat 8443).
