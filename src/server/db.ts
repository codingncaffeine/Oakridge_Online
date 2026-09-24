import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type LoginMethod = "totp" | "email";

export interface AccountRow {
  id: number;
  name: string;
  method: LoginMethod;
  totp_secret: Uint8Array | null;
  totp_last_step: number;
  email: Uint8Array | null;
  banned: number;
  fail_count: number;
  locked_until: number;
  muted_until: number;
}

/** Schema changes in order; PRAGMA user_version records how many have run. */
const MIGRATIONS = [
  `CREATE TABLE accounts (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     name_key TEXT NOT NULL UNIQUE,
     method TEXT NOT NULL CHECK (method IN ('totp', 'email')),
     totp_secret BLOB,
     totp_last_step INTEGER NOT NULL DEFAULT 0,
     email BLOB,
     email_hash TEXT UNIQUE,
     created_at INTEGER NOT NULL,
     last_login INTEGER,
     banned INTEGER NOT NULL DEFAULT 0,
     fail_count INTEGER NOT NULL DEFAULT 0,
     locked_until INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE backup_codes (
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     code_hash TEXT NOT NULL,
     used_at INTEGER
   );
   CREATE INDEX backup_codes_account ON backup_codes(account_id);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE characters (
     account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     data TEXT NOT NULL,
     saved_at INTEGER NOT NULL
   );`,
  `ALTER TABLE accounts ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0;`,
  `CREATE TABLE contacts (
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('friend', 'ignore')),
     name_key TEXT NOT NULL,
     name TEXT NOT NULL,
     added_at INTEGER NOT NULL,
     PRIMARY KEY (account_id, kind, name_key)
   );`,
];

/** A friend or an ignored player, as the store keeps them (PLAN Phase 10). */
export interface ContactRow {
  kind: "friend" | "ignore";
  nameKey: string;
  name: string;
}

/** The game's persistent store: one SQLite file (WAL mode) plus dated daily copies beside it. */
export class Store {
  readonly db: DatabaseSync;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
    const version = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  accountByNameKey(nameKey: string): AccountRow | undefined {
    return this.db.prepare(
      "SELECT id, name, method, totp_secret, totp_last_step, email, banned, fail_count, locked_until, muted_until FROM accounts WHERE name_key = ?",
    ).get(nameKey) as AccountRow | undefined;
  }

  accountById(id: number): AccountRow | undefined {
    return this.db.prepare(
      "SELECT id, name, method, totp_secret, totp_last_step, email, banned, fail_count, locked_until, muted_until FROM accounts WHERE id = ?",
    ).get(id) as AccountRow | undefined;
  }

  nameTaken(nameKey: string): boolean {
    return this.db.prepare("SELECT 1 FROM accounts WHERE name_key = ?").get(nameKey) !== undefined;
  }

  emailTaken(emailHash: string): boolean {
    return this.db.prepare("SELECT 1 FROM accounts WHERE email_hash = ?").get(emailHash) !== undefined;
  }

  createAccount(a: {
    name: string; nameKey: string; method: LoginMethod; totpSecret?: Uint8Array; totpStep?: number;
    email?: Uint8Array; emailHash?: string; backupHashes: string[]; now: number;
  }): number {
    return this.transaction(() => {
      const res = this.db.prepare(
        `INSERT INTO accounts (name, name_key, method, totp_secret, totp_last_step, email, email_hash, created_at, last_login)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(a.name, a.nameKey, a.method, a.totpSecret ?? null, a.totpStep ?? 0, a.email ?? null, a.emailHash ?? null, a.now, a.now);
      const id = Number(res.lastInsertRowid);
      const insert = this.db.prepare("INSERT INTO backup_codes (account_id, code_hash) VALUES (?, ?)");
      for (const h of a.backupHashes) insert.run(id, h);
      return id;
    });
  }

  loginSucceeded(id: number, now: number, totpStep?: number): void {
    if (totpStep !== undefined) {
      this.db.prepare("UPDATE accounts SET fail_count = 0, locked_until = 0, last_login = ?, totp_last_step = ? WHERE id = ?").run(now, totpStep, id);
    } else {
      this.db.prepare("UPDATE accounts SET fail_count = 0, locked_until = 0, last_login = ? WHERE id = ?").run(now, id);
    }
  }

  setMutedUntil(id: number, until: number): void {
    this.db.prepare("UPDATE accounts SET muted_until = ? WHERE id = ?").run(until, id);
  }

  setBanned(id: number, banned: boolean): void {
    this.db.prepare("UPDATE accounts SET banned = ? WHERE id = ?").run(banned ? 1 : 0, id);
    if (banned) this.endSessionsFor(id);
  }

  loginFailed(id: number, failCount: number, lockedUntil: number): void {
    this.db.prepare("UPDATE accounts SET fail_count = ?, locked_until = ? WHERE id = ?").run(failCount, lockedUntil, id);
  }

  /** Marks an unused backup code used; false if no unused code has that hash. */
  useBackupCode(id: number, codeHash: string, now: number): boolean {
    const res = this.db.prepare("UPDATE backup_codes SET used_at = ? WHERE account_id = ? AND code_hash = ? AND used_at IS NULL").run(now, id, codeHash);
    return Number(res.changes) === 1;
  }

  backupCodesLeft(id: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM backup_codes WHERE account_id = ? AND used_at IS NULL").get(id) as { n: number }).n;
  }

  addSession(tokenHash: string, accountId: number, expiresAt: number): void {
    this.db.prepare("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, accountId, expiresAt);
  }

  sessionAccount(tokenHash: string, now: number): number | undefined {
    const row = this.db.prepare("SELECT account_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash, now) as { account_id: number } | undefined;
    return row?.account_id;
  }

  touchSession(tokenHash: string, expiresAt: number): void {
    this.db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(expiresAt, tokenHash);
  }

  endSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  endSessionsFor(accountId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE account_id = ?").run(accountId);
  }

  pruneSessions(now: number): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  loadCharacter(accountId: number): unknown {
    const row = this.db.prepare("SELECT data FROM characters WHERE account_id = ?").get(accountId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /** An account's friends and the players it ignores, oldest first. */
  contacts(accountId: number): ContactRow[] {
    return this.db.prepare("SELECT kind, name_key AS nameKey, name FROM contacts WHERE account_id = ? ORDER BY added_at, name_key").all(accountId) as unknown as ContactRow[];
  }

  addContact(accountId: number, kind: "friend" | "ignore", nameKey: string, name: string, now: number): void {
    this.db.prepare(
      "INSERT INTO contacts (account_id, kind, name_key, name, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, kind, name_key) DO UPDATE SET name = excluded.name",
    ).run(accountId, kind, nameKey, name, now);
  }

  removeContact(accountId: number, kind: "friend" | "ignore", nameKey: string): void {
    this.db.prepare("DELETE FROM contacts WHERE account_id = ? AND kind = ? AND name_key = ?").run(accountId, kind, nameKey);
  }

  saveCharacters(rows: Array<{ accountId: number; data: unknown }>, now: number): void {
    if (rows.length === 0) return;
    this.transaction(() => {
      const upsert = this.db.prepare(
        "INSERT INTO characters (account_id, data, saved_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at",
      );
      for (const r of rows) upsert.run(r.accountId, JSON.stringify(r.data), now);
    });
  }

  /** Writes today's dated copy (if missing) into `backups/` beside the database; keeps the newest `keep`. */
  dailyBackup(now: Date, keep = 14): string | null {
    const dir = join(dirname(this.file), "backups");
    mkdirSync(dir, { recursive: true });
    const name = `oakridge-${now.toISOString().slice(0, 10)}.db`;
    const existing = readdirSync(dir).filter((f) => /^oakridge-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    let made: string | null = null;
    if (!existing.includes(name)) {
      const target = join(dir, name);
      this.db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      existing.push(name);
      existing.sort();
      made = target;
    }
    for (const old of existing.slice(0, Math.max(0, existing.length - keep))) rmSync(join(dir, old), { force: true });
    return made;
  }

  close(): void {
    this.db.close();
  }
}
