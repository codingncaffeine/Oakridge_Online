import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Authenticator codes: TOTP (RFC 6238) over HOTP (RFC 4226) with HMAC-SHA-1, 6 digits, 30-second steps.
// These are the defaults every authenticator app supports.

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
export const ISSUER = "Oakridge Online";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(data: Uint8Array): string {
  let out = "", bits = 0, value = 0;
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error("not base32");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/** The time step `code` belongs to, allowing one step of clock drift either way; -1 when it matches none. */
export function matchTotp(secret: Uint8Array, code: string, nowMs: number, drift = 1): number {
  if (!/^\d{6}$/.test(code)) return -1;
  const now = totpStep(nowMs);
  let found = -1;
  for (let step = now - drift; step <= now + drift; step++) {
    // Check every step (no early exit) so timing doesn't reveal which one matched.
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) found = step;
  }
  return found;
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

/**
 * What the QR code holds, in the key URI format authenticator apps read: `otpauth://totp/Issuer:account`
 * with the secret, and the issuer again as a parameter. SHA-1, 6 digits and 30 s are that format's
 * defaults, so they're left out: a shorter link makes a coarser QR code, which cameras read more easily.
 */
export function otpauthUri(name: string, secret: Uint8Array): string {
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${issuer}:${encodeURIComponent(name)}?secret=${base32Encode(secret)}&issuer=${issuer}`;
}
