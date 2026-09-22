import {
  createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Reads the 32-byte server key, creating it (owner-only) on first start. It lives in its own file
 * beside the database, never inside it, so a copy of the database alone reveals no secrets.
 */
export function loadOrCreateKey(path: string): Buffer {
  if (existsSync(path)) {
    const key = readFileSync(path);
    if (key.length !== 32) throw new Error(`${path} is not a 32-byte key`);
    return key;
  }
  mkdirSync(dirname(path), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(path, key, { mode: 0o600, flag: "wx" });
  return key;
}

/** Encryption at rest and keyed hashing, each with its own key derived from the server key. */
export class Secrets {
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;

  constructor(serverKey: Buffer) {
    this.encKey = Buffer.from(hkdfSync("sha256", serverKey, Buffer.alloc(0), "oakridge/encrypt", 32));
    this.macKey = Buffer.from(hkdfSync("sha256", serverKey, Buffer.alloc(0), "oakridge/hash", 32));
  }

  /** AES-256-GCM: returns iv (12) + tag (16) + ciphertext. */
  seal(plain: Buffer | string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encKey, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  /** Reverses seal; throws if the data was altered. */
  open(sealed: Uint8Array): Buffer {
    const buf = Buffer.from(sealed);
    const decipher = createDecipheriv("aes-256-gcm", this.encKey, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  }

  /** HMAC-SHA-256 as hex: how codes, tokens and addresses are stored and compared. */
  hash(value: string): string {
    return createHmac("sha256", this.macKey).update(value).digest("hex");
  }
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomDigits(count: number): string {
  let s = "";
  for (let i = 0; i < count; i++) s += String(randomInt(10));
  return s;
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** No 0/o, 1/l/i: backup codes get read off paper. */
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A one-time recovery code, e.g. "k7m2p-x9qa4" (about 50 bits). */
export function backupCode(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Backup codes as typed: case, spaces and the dash don't matter. */
export function normalizeBackupCode(input: string): string | null {
  const s = input.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z2-9]{10}$/.test(s) ? `${s.slice(0, 5)}-${s.slice(5)}` : null;
}
