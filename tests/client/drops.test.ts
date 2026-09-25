// The page's drop report must always be one the server takes: whatever the page saw (a clock that went
// backwards, a tab asleep for days, a reason longer than the log keeps), dropReport keeps it inside what
// parseC2S accepts; and a drop kept in the tab reads back as itself.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dropReport, readDrop, type Drop } from "../../src/client/drops.ts";
import { DAY_MS, parseC2S } from "../../src/shared/protocol.ts";

const seen: Drop = { code: 1006, clean: false, reason: "", at: 1_000_000, quiet: 412.6, hidden: false, offline: false, tries: 2 };

test("a drop report says what the page saw, and the server takes it", () => {
  const report = dropReport(seen, 1_003_200);
  assert.deepEqual(report, { t: "dropped", code: 1006, clean: false, reason: "", ago: 3200, quiet: 413, hidden: false, offline: false, tries: 2 });
  assert.deepEqual(parseC2S(JSON.stringify(report)), report);
});

test("whatever the page saw, its report stays inside what the server takes", () => {
  const extremes: Array<[Partial<Drop>, number]> = [
    [{ at: 2_000_000 }, 1_000_000], // the clock went backwards
    [{ at: 0 }, 5 * DAY_MS], // asleep for days
    [{ quiet: 3 * DAY_MS, tries: 5000 }, 1_000_000],
    [{ code: 999, reason: "r".repeat(300) }, 1_000_000],
    [{ code: 1015, reason: "tls\nfailed" }, 1_000_000],
  ];
  for (const [change, now] of extremes) {
    const report = dropReport({ ...seen, ...change }, now);
    assert.notEqual(parseC2S(JSON.stringify(report)), null, JSON.stringify(change));
  }
  // The control: unclamped, the first of those is refused, so the clamping is what lets them through.
  assert.equal(parseC2S(JSON.stringify({ ...dropReport(seen, 1_000_000), ago: 1_000_000 - 2_000_000 })), null);
});

test("a kept drop reads back as itself; anything else reads as none", () => {
  assert.deepEqual(readDrop(JSON.stringify(seen)), seen);
  for (const raw of [null, "", "not json", "null", "{}", JSON.stringify({ ...seen, code: "1006" }), JSON.stringify({ ...seen, clean: undefined })]) {
    assert.equal(readDrop(raw), null, String(raw));
  }
});
