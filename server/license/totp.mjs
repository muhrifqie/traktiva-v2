// TOTP (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits) for admin 2FA, compatible with Google Authenticator,
// Microsoft Authenticator, Authy, 1Password… Standard library only.
import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 (what the authenticator app stores). */
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

/** The 6-digit code for a given unix time (seconds). */
export function totpCode(secret, time = Date.now() / 1000, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30)));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** Accept the current code or one step either side (clock drift up to ±30 s); constant-time compare. */
export function verifyTotp(secret, code, time = Date.now() / 1000) {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!secret || !/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(totpCode(secret, time + d * 30)), Buffer.from(c)));
}

/** otpauth:// link for the QR code (issuer shown in the authenticator app). */
export const totpUri = (secret, account) =>
  `otpauth://totp/${encodeURIComponent(`Traktiva:${account}`)}?secret=${secret}&issuer=Traktiva&algorithm=SHA1&digits=6&period=30`;
