import assert from "node:assert/strict";
import { test } from "node:test";
import { censor, checkName, isOffensive } from "../src/server/names.ts";

// Obvious and disguised spellings: look-alike digits, spacing, stretching, sound-alike swaps,
// joined-up words and well-known joke names. Base64, like the filter's own lists, so they aren't plain text.
const BLOCKED = Buffer.from(
  "RnVja3xGIHUgYyBrfGYtdS1jLWt8ZnV1dXVja3xQaHVja3xGdmNrfEZVS3xmdXEgdXxOMWdnM3J8U2gxdHxTaGlpaXR8QmlnRGlja3xCaWcgRGlja3xEaWNrNjl8YmlnZDFja3xIdWdoIEphc3N8TWlrZSBIdW50fEJlbiBEb3ZlcnxCMXRjaHxLa2t8SDF0bGVyfEN1bXxUaXR8YTU1fE5heml8UHVzc3l8QVNTfFNoMXRoZWFkfEtpa2V8d2gwcmV8YzBja3N1Y2tlcnxUd2F0fDVsdXR8UE9STg==",
  "base64",
).toString().split("|");

// Innocent names that naive filters wrongly block.
const ALLOWED = [
  "Niger", "Dickens", "Hancock", "Titan", "Cassandra", "Classic", "Grass", "Sussex", "Scott", "Fuchs", "Kilt",
  "Pennys", "Nazir", "Shitake", "Peacock", "Analyst", "Assad", "Cockburn", "Hitch", "Moby", "Pepper", "Sam 1488b",
];

test("offensive names are caught however they're spelled", () => {
  assert.equal(BLOCKED.length, 34);
  for (const name of BLOCKED) assert.equal(checkName(name).ok, false, `should block ${name}`);
  assert.ok(isOffensive("x1488x"), "digit hate codes");
});

test("innocent names that contain look-alike fragments are allowed", () => {
  for (const name of ALLOWED.filter((n) => !n.includes("1488"))) assert.equal(checkName(name).ok, true, `should allow ${name}`);
  assert.equal(checkName("Sam 1488b").ok, false, "digit hate codes are caught even inside other text");
});

test("staff names are reserved, and the basic rules still apply", () => {
  for (const name of ["Admin", "Mod Bob", "mod", "Oakridge", "sys-tem"]) {
    assert.equal(checkName(name).ok, false, `${name} (separators don't dodge a reserved name)`);
  }
  assert.equal(checkName("Modern").ok, true, "a reserved word inside a longer one is fine");
  assert.equal(checkName("").ok, false);
  assert.equal(checkName("Way too long name").ok, false);
  const ok = checkName("  Ann   Lee ");
  assert.deepEqual(ok, { ok: true, name: "Ann Lee", key: "ann lee" });
});

test("chat: offensive words are starred, spelled-out ones too, innocent words untouched", () => {
  const [plain, spelled, leet, innocent, mixed] = Buffer.from(
    "ZnVjayB5b3V8d2hhdCB0aGUgZiB1IGMga3xzaDF0IGhhcHBlbnN8Y2xhc3MgYXNzYXNzaW4gY29ja3RhaWx8YjF0Y2ggcGxlYXNl", "base64",
  ).toString().split("|") as [string, string, string, string, string];
  assert.equal(censor(plain), "**** you");
  assert.equal(censor(spelled), "what the * * * *");
  assert.equal(censor(leet), "**** happens");
  assert.equal(censor(innocent), innocent);
  assert.equal(censor(mixed), "***** please");
  assert.equal(censor("hello there, friend"), "hello there, friend");
  assert.equal(censor("a b c d e"), "a b c d e", "spelled-out runs are only starred when they spell something");
});
