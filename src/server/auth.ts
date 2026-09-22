import { backupCode, normalizeBackupCode, randomDigits, randomToken, sameHash, type Secrets } from "./crypto.ts";
import type { AccountRow, LoginMethod, Store } from "./db.ts";
import type { Mailer } from "./mail.ts";
import { checkName, nameKey } from "./names.ts";
import { base32Encode, matchTotp, newTotpSecret, otpauthUri } from "./totp.ts";

/** A dropped connection can pick the session back up this long after it was last active. */
export const SESSION_MS = 30 * 60 * 1000;
const EMAIL_CODE_MS = 10 * 60 * 1000;
const SIGNUP_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const BACKUP_CODES = 10;
/** Wrong codes allowed before lockouts start; each wrong code after that doubles the lockout. */
const FREE_FAILURES = 5;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** A sign-up that has been started but not yet confirmed with a code. It lives on the connection. */
export interface PendingSignup {
  name: string;
  key: string;
  method: LoginMethod;
  secret?: Buffer;
  email?: string;
  codeHash?: string;
  expires: number;
  attempts: number;
}

/** Counts events per key over a sliding window. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records an event unless `limit` already happened within `windowMs`; false means refused. */
  allow(key: string, limit: number, windowMs: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  prune(now: number, windowMs: number): void {
    for (const [k, v] of this.hits) if (v.every((t) => t <= now - windowMs)) this.hits.delete(k);
  }
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const shown = user.length <= 2 ? `${user[0] ?? ""}*` : `${user[0]}${"*".repeat(Math.min(6, user.length - 2))}${user.at(-1)}`;
  return `${shown}@${domain}`;
}

function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null;
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60000));

/** Accounts without passwords: every login is a one-time code from an authenticator app or by email. */
export class Accounts {
  private readonly store: Store;
  private readonly secrets: Secrets;
  private readonly mail: Mailer;
  private readonly now: () => number;
  private readonly loginCodes = new Map<number, { hash: string; expires: number; attempts: number }>();
  readonly limiter = new RateLimiter();

  constructor(store: Store, secrets: Secrets, mail: Mailer, now: () => number = Date.now) {
    this.store = store;
    this.secrets = secrets;
    this.mail = mail;
    this.now = now;
  }

  private checkNewName(raw: string): Result<{ name: string; key: string }> {
    const check = checkName(raw);
    if (!check.ok) return fail(check.reason);
    if (this.store.nameTaken(check.key)) return fail("That name is taken.");
    return { ok: true, value: { name: check.name, key: check.key } };
  }

  startTotpSignup(rawName: string, ip: string): Result<{ pending: PendingSignup; secret: string; uri: string }> {
    if (!this.limiter.allow(`signup:${ip}`, 20, 60 * 60 * 1000, this.now())) return fail("Too many sign-ups from here. Try again later.");
    const name = this.checkNewName(rawName);
    if (!name.ok) return name;
    const secret = newTotpSecret();
    const pending: PendingSignup = { ...name.value, method: "totp", secret, expires: this.now() + SIGNUP_MS, attempts: 0 };
    return { ok: true, value: { pending, secret: base32Encode(secret), uri: otpauthUri(name.value.name, secret) } };
  }

  async startEmailSignup(rawName: string, rawEmail: string, ip: string): Promise<Result<{ pending: PendingSignup; to: string }>> {
    const name = this.checkNewName(rawName);
    if (!name.ok) return name;
    const email = cleanEmail(rawEmail);
    if (!email) return fail("That doesn't look like an email address.");
    if (this.store.emailTaken(this.secrets.hash(email))) return fail("That email address already has an account.");
    const sent = await this.sendCode(email, ip, "sign-up");
    if (!sent.ok) return sent;
    const pending: PendingSignup = { ...name.value, method: "email", email, codeHash: sent.value, expires: this.now() + EMAIL_CODE_MS, attempts: 0 };
    return { ok: true, value: { pending, to: maskEmail(email) } };
  }

  finishSignup(pending: PendingSignup, code: string): Result<{ accountId: number; name: string; backupCodes: string[] }> {
    const now = this.now();
    if (now > pending.expires) return fail("That sign-up took too long. Please start again.");
    if (++pending.attempts > MAX_CODE_ATTEMPTS) return fail("Too many wrong codes. Please start again.");
    let totpStep: number | undefined;
    if (pending.method === "totp") {
      const step = matchTotp(pending.secret!, code.trim(), now);
      if (step < 0) return fail("That code doesn't match. Check the time on your phone and try the next code.");
      totpStep = step;
    } else if (!/^\d{6}$/.test(code.trim()) || !sameHash(this.secrets.hash(code.trim()), pending.codeHash!)) {
      return fail("That code doesn't match the one we emailed.");
    }
    if (this.store.nameTaken(pending.key)) return fail("Someone took that name a moment ago. Please pick another.");
    const backupCodes = Array.from({ length: BACKUP_CODES }, backupCode);
    const accountId = this.store.createAccount({
      name: pending.name, nameKey: pending.key, method: pending.method,
      totpSecret: pending.secret ? this.secrets.seal(pending.secret) : undefined, totpStep,
      email: pending.email ? this.secrets.seal(pending.email) : undefined,
      emailHash: pending.email ? this.secrets.hash(pending.email) : undefined,
      backupHashes: backupCodes.map((c) => this.secrets.hash(c)), now,
    });
    return { ok: true, value: { accountId, name: pending.name, backupCodes } };
  }

  /** Emails a login code to an email account. */
  async sendLoginCode(rawName: string, ip: string): Promise<Result<{ to: string }>> {
    const account = this.store.accountByNameKey(nameKey(rawName.trim().replace(/\s+/g, " ")));
    if (!account) return fail("There's no account with that name.");
    if (account.method !== "email" || !account.email) return fail("That account logs in with an authenticator app.");
    const email = this.secrets.open(account.email).toString();
    const sent = await this.sendCode(email, ip, "login");
    if (!sent.ok) return sent;
    this.loginCodes.set(account.id, { hash: sent.value, expires: this.now() + EMAIL_CODE_MS, attempts: 0 });
    return { ok: true, value: { to: maskEmail(email) } };
  }

  /** Sends a fresh 6-digit code, within the sending limits; returns the code's hash. */
  private async sendCode(email: string, ip: string, purpose: "sign-up" | "login"): Promise<Result<string>> {
    const now = this.now(), who = this.secrets.hash(email);
    if (!this.limiter.allow(`mail-gap:${who}`, 1, 60 * 1000, now)) return fail("A code was just sent. Please wait a minute before asking again.");
    if (!this.limiter.allow(`mail-to:${who}`, 5, 60 * 60 * 1000, now)) return fail("Too many codes sent to that address. Try again in an hour.");
    if (!this.limiter.allow(`mail-ip:${ip}`, 10, 60 * 60 * 1000, now)) return fail("Too many codes requested from here. Try again later.");
    const code = randomDigits(6);
    try {
      await this.mail({
        to: email,
        subject: "Your Oakridge Online code",
        text: `Your ${purpose} code is: ${code}\n\nIt works once and expires in 10 minutes. `
          + "If you didn't ask for it, you can ignore this email.\n\nOakridge Online\nhttps://oakridgeonline.emutastic.com",
      });
    } catch {
      return fail("We couldn't send the email just now. Please try again in a few minutes.");
    }
    return { ok: true, value: this.secrets.hash(code) };
  }

  login(rawName: string, rawCode: string, ip: string): Result<{ accountId: number; name: string; backupLeft: number; usedBackup: boolean }> {
    const now = this.now();
    if (!this.limiter.allow(`login:${ip}`, 30, 10 * 60 * 1000, now)) return fail("Too many attempts from here. Wait a few minutes.");
    const account = this.store.accountByNameKey(nameKey(rawName.trim().replace(/\s+/g, " ")));
    if (!account) return fail("There's no account with that name.");
    if (account.banned) return fail("This account is banned.");
    if (account.locked_until > now) return fail(`Too many wrong codes. Try again in ${minutes(account.locked_until - now)} minute(s).`);
    const code = rawCode.trim();

    // A 6-digit code can never normalize to a 10-character backup code, so this can't swallow one.
    const backup = normalizeBackupCode(code);
    if (backup) {
      if (this.store.useBackupCode(account.id, this.secrets.hash(backup), now)) {
        this.store.loginSucceeded(account.id, now);
        return { ok: true, value: { accountId: account.id, name: account.name, backupLeft: this.store.backupCodesLeft(account.id), usedBackup: true } };
      }
      return this.wrongCode(account, "That backup code isn't valid (each works only once).");
    }

    if (account.method === "totp") {
      const step = matchTotp(this.secrets.open(account.totp_secret!), code, now);
      if (step < 0) return this.wrongCode(account, "That code doesn't match.");
      if (step <= account.totp_last_step) return fail("That code was already used. Wait for the next one.");
      this.store.loginSucceeded(account.id, now, step);
    } else {
      const pending = this.loginCodes.get(account.id);
      if (!pending || now > pending.expires) return fail("Ask for a new code first (it may have expired).");
      if (++pending.attempts > MAX_CODE_ATTEMPTS) {
        this.loginCodes.delete(account.id);
        return this.wrongCode(account, "Too many wrong codes. Ask for a new one.");
      }
      if (!/^\d{6}$/.test(code) || !sameHash(this.secrets.hash(code), pending.hash)) return this.wrongCode(account, "That code doesn't match the one we emailed.");
      this.loginCodes.delete(account.id);
      this.store.loginSucceeded(account.id, now);
    }
    return { ok: true, value: { accountId: account.id, name: account.name, backupLeft: this.store.backupCodesLeft(account.id), usedBackup: false } };
  }

  private wrongCode(account: AccountRow, reason: string): { ok: false; reason: string } {
    const failures = account.fail_count + 1;
    const lock = failures > FREE_FAILURES ? Math.min(MAX_LOCK_MS, 60 * 1000 * 2 ** (failures - FREE_FAILURES - 1)) : 0;
    this.store.loginFailed(account.id, failures, lock ? this.now() + lock : 0);
    return fail(lock ? `${reason} Too many wrong codes: try again in ${minutes(lock)} minute(s).` : reason);
  }

  newSession(accountId: number): string {
    const token = randomToken();
    this.store.addSession(this.secrets.hash(token), accountId, this.now() + SESSION_MS);
    return token;
  }

  resume(token: string): Result<{ accountId: number; name: string }> {
    const hash = this.secrets.hash(token), now = this.now();
    const accountId = this.store.sessionAccount(hash, now);
    const account = accountId === undefined ? undefined : this.store.accountById(accountId);
    if (!account) return fail("Your session has ended. Please log in.");
    if (account.banned) return fail("This account is banned.");
    this.store.touchSession(hash, now + SESSION_MS);
    return { ok: true, value: { accountId: account.id, name: account.name } };
  }

  keepAlive(token: string): void {
    this.store.touchSession(this.secrets.hash(token), this.now() + SESSION_MS);
  }

  endSession(token: string): void {
    this.store.endSession(this.secrets.hash(token));
  }

  prune(): void {
    const now = this.now();
    this.store.pruneSessions(now);
    this.limiter.prune(now, 60 * 60 * 1000);
    for (const [id, c] of this.loginCodes) if (now > c.expires) this.loginCodes.delete(id);
  }
}
