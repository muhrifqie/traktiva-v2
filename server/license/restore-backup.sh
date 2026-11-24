#!/bin/bash
# Decrypt a Traktiva license backup made by backup.sh (run on the owner's PC; Git Bash has openssl).
# Usage: server/license/restore-backup.sh <traktiva-license-YYYYMMDD-HHMM.tar> <license-backup-private.pem> [outdir]
# Result: <outdir>/license.db + <outdir>/secrets.json → copy into /srv/traktiva-license/data/ and pm2 restart.
set -euo pipefail
IN=$1; KEY=$2; OUTDIR=${3:-./restored-license}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# Git Bash's GNU tar reads "C:\..." as a remote host unless told otherwise
LOCAL=(); case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) LOCAL=(--force-local) ;; esac
tar "${LOCAL[@]}" -xf "$IN" -C "$TMP"
openssl pkeyutl -decrypt -inkey "$KEY" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$TMP/key.enc" -out "$TMP/key"
TRK_BACKUP_KEY=$(tr -d '\r\n' < "$TMP/key") openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:TRK_BACKUP_KEY -in "$TMP/data.enc" -out "$TMP/data.tar.gz"
mkdir -p "$OUTDIR"
tar -xzf "$TMP/data.tar.gz" -C "$OUTDIR"
echo "restored to $OUTDIR: $(ls "$OUTDIR" | tr '\n' ' ')"
