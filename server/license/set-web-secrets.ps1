# Puts the Google sign-in and Cloudflare Turnstile keys on the Traktiva server (/srv/traktiva-license/data/web-secrets.json,
# mode 600) and restarts the website. Nothing is printed or stored on this PC. Press Enter on a question to keep the
# current value on the server. Needs the "traktiva" SSH alias (see DEPLOY.md).
#   powershell -ExecutionPolicy Bypass -File server\license\set-web-secrets.ps1
$ErrorActionPreference = "Stop"
$new = @{}

# 1. Google: the JSON downloaded from Google Cloud (client_secret_....json), newest one in Downloads
$json = Get-ChildItem "$env:USERPROFILE\Downloads\client_secret_*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($json) {
  $use = Read-Host "Pakai file Google $($json.Name)? (Y/n)"
  if ($use -ne "n") {
    $g = (Get-Content $json.FullName -Raw | ConvertFrom-Json).web
    if (-not $g.client_id -or -not $g.client_secret) { throw "File itu bukan OAuth client tipe Web application." }
    if ($g.redirect_uris -notcontains "https://app.traktiva.site/api/auth/google/callback") {
      Write-Host "Peringatan: redirect URI https://app.traktiva.site/api/auth/google/callback belum ada di client ini." -ForegroundColor Yellow
    }
    $new.googleClientId = $g.client_id
    $new.googleClientSecret = $g.client_secret
  }
} else {
  Write-Host "Tidak ada client_secret_*.json di Downloads, Google dilewati." -ForegroundColor Yellow
}

# 2. Turnstile: site key (public) and secret key (typed hidden)
$site = Read-Host "Turnstile Site Key (Enter = lewati)"
if ($site) {
  $sec = Read-Host "Turnstile Secret Key (tidak tampil)" -AsSecureString
  $plain = [System.Net.NetworkCredential]::new("", $sec).Password
  if (-not $plain) { throw "Secret key kosong." }
  $new.turnstileSiteKey = $site.Trim()
  $new.turnstileSecretKey = $plain.Trim()
}
if (-not $new.Count) { Write-Host "Tidak ada yang diubah."; exit 0 }

# 3. Merge into the server file (600) and restart the website so it reads the keys
$payload = $new | ConvertTo-Json -Compress
$remote = 'export PATH=/opt/node/bin:$PATH; f=/srv/traktiva-license/data/web-secrets.json; umask 077; ' +
  'node -e ''const fs=require("fs"),f=process.argv[1];let o={};try{o=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}Object.assign(o,JSON.parse(fs.readFileSync(0,"utf8")));fs.writeFileSync(f,JSON.stringify(o,null,1),{mode:0o600});console.log("tersimpan:",Object.keys(o).join(", "))'' $f && ' +
  'cd /srv/traktiva-web && pm2 delete traktiva-web >/dev/null && pm2 start ecosystem.config.cjs >/dev/null && pm2 save >/dev/null && sleep 4 && ' +
  'curl -s -o /dev/null -w "website %{http_code}\n" http://127.0.0.1:3821/masuk'
$payload | ssh traktiva $remote
Write-Host "Selesai. Buka https://app.traktiva.site/masuk untuk mencoba." -ForegroundColor Green
