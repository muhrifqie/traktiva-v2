#!/bin/bash
# Encrypted backup of the Traktiva license data (license.db + secrets.json), daily by cron 03.40.
# The server only holds the owner's PUBLIC key (backup-pub.pem): it can encrypt, never decrypt.
# Restore on the owner's PC: server/license/restore-backup.sh <file.tar> <private.pem>
# The newest file is shipped off-site by /usr/local/bin/backup-harian (app "traktiva-license").
set -euo pipefail
cd "$(dirname "$0")"
OUT=backup
mkdir -p -m 700 "$OUT"
STAMP=$(date +%Y%m%d-%H%M)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# consistent DB snapshot while the server runs (WAL-safe)
node --disable-warning=ExperimentalWarning -e '
const { DatabaseSync } = require("node:sqlite");
new DatabaseSync("data/license.db").exec("VACUUM INTO '\''" + process.argv[1].replace(/'\''/g, "'\'''\''") + "'\''");
' "$TMP/license.db"
tar -czf "$TMP/data.tar.gz" -C "$TMP" license.db -C "$PWD/data" secrets.json

# hybrid encryption: random AES-256 key for the data, that key sealed with the owner's RSA public key
openssl rand -hex -out "$TMP/key" 32   # hex text: a password file is read up to its first newline
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$TMP/key" -in "$TMP/data.tar.gz" -out "$TMP/data.enc"
openssl pkeyutl -encrypt -pubin -inkey backup-pub.pem -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$TMP/key" -out "$TMP/key.enc"

FILE="$OUT/traktiva-license-$STAMP.tar"
tar -cf "$FILE" -C "$TMP" data.enc key.enc
chmod 600 "$FILE"
ls -t "$OUT"/traktiva-license-*.tar | tail -n +15 | xargs -r rm -f   # keep 14 local copies
echo "$(date '+%F %T') ok $FILE ($(stat -c %s "$FILE") bytes)"
