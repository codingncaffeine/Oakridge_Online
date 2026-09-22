import assert from "node:assert/strict";
import { test } from "node:test";
import { backupCode, normalizeBackupCode, Secrets } from "../src/server/crypto.ts";
import { base32Decode, base32Encode, hotp, matchTotp, otpauthUri, totpStep } from "../src/server/totp.ts";

// RFC 6238 appendix B: SHA-1, the ASCII secret "12345678901234567890", 8 digits.
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_VECTORS: Array<[number, string]> = [
  [59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"],
  [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"],
];

test("TOTP matches the RFC 6238 test vectors", () => {
  for (const [time, code] of RFC_VECTORS) assert.equal(hotp(RFC_SECRET, totpStep(time * 1000), 8), code, `T=${time}`);
});

test("HOTP matches the RFC 4226 test vectors", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code));
});

test("base32 follows RFC 4648 and round-trips", () => {
  const vectors: Array<[string, string]> = [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]];
  for (const [plain, encoded] of vectors) {
    assert.equal(base32Encode(Buffer.from(plain)), encoded);
    assert.equal(base32Decode(encoded).toString(), plain);
  }
  assert.equal(base32Decode("mzxw 6ytb-oi").toString(), "foobar", "lower case, spaces and dashes are tolerated");
});

test("a code is accepted one step either side of now, not two", () => {
  const now = 1_790_000_000_000, step = totpStep(now);
  assert.equal(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), now), step);
  assert.equal(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), now), -1);
  assert.equal(matchTotp(RFC_SECRET, "12345", now), -1, "wrong length");
  assert.equal(matchTotp(RFC_SECRET, "abcdef", now), -1, "not digits");
});

test("the setup link carries the issuer, name and secret", () => {
  const uri = otpauthUri("Ann Lee", RFC_SECRET);
  assert.ok(uri.startsWith("otpauth://totp/Oakridge%20Online%3AAnn%20Lee?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"));
  assert.match(uri, /&issuer=Oakridge%20Online&algorithm=SHA1&digits=6&period=30$/);
});

test("secrets seal, open, and refuse tampering; hashes are keyed", () => {
  const a = new Secrets(Buffer.alloc(32, 7)), b = new Secrets(Buffer.alloc(32, 8));
  const sealed = a.seal("JBSWY3DPEHPK3PXP");
  assert.equal(a.open(sealed).toString(), "JBSWY3DPEHPK3PXP");
  assert.notDeepEqual(a.seal("same"), a.seal("same"), "a fresh IV every time");
  const bad = Buffer.from(sealed);
  bad[bad.length - 1]! ^= 1;
  assert.throws(() => a.open(bad));
  assert.throws(() => b.open(sealed), "another key cannot open it");
  assert.equal(a.hash("123456"), a.hash("123456"));
  assert.notEqual(a.hash("123456"), b.hash("123456"));
});

test("backup codes: format, and typed input is normalized", () => {
  const code = backupCode();
  assert.match(code, /^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
  assert.equal(normalizeBackupCode(` ${code.toUpperCase().replace("-", " ")} `), code);
  assert.equal(normalizeBackupCode("123456"), null);
});
