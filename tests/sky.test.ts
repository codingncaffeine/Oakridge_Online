// The sky's clock and weather (PLAN Phase 16): pure functions of the world's time, the same on every
// machine — a day that turns over, a sun that rises in the east and sets in the west, weather that
// comes and goes by degrees with clear skies the commonest and storms the rarest, and lightning that
// falls on the same instants for everyone.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAY_MS, daylight, dayPhase, hourOf, kindOf, lightningAt, moonDirection, nightness, sunDirection, sunElevation, WEATHER_MS, WEATHER_TILES,
  weatherAt, type WeatherKind,
} from "../src/shared/sky.ts";

const MOMENT = 1_790_000_000_000;

test("the day turns over on the clock: midnight at the start of every day, noon halfway, and one phase for one moment", () => {
  assert.equal(dayPhase(0), 0);
  assert.equal(dayPhase(DAY_MS / 2), 0.5);
  assert.equal(dayPhase(DAY_MS), 0);
  assert.equal(dayPhase(DAY_MS * 3 + DAY_MS / 4), 0.25);
  assert.equal(hourOf(0.75), 18);
  assert.equal(dayPhase(MOMENT), dayPhase(MOMENT), "the control: the same moment, the same phase");
  assert.notEqual(dayPhase(MOMENT), dayPhase(MOMENT + 60_000), "and a minute later is another");
  assert.ok(Math.abs(dayPhase(MOMENT + 60_000) - dayPhase(MOMENT) - 60_000 / DAY_MS) < 1e-9 || dayPhase(MOMENT + 60_000) < dayPhase(MOMENT), "a minute is a minute's worth of day");
});

test("the sun rises in the east, stands highest at noon over the south, sets in the west, and the moon takes the other side", () => {
  assert.ok(Math.abs(sunElevation(0.25)) < 1e-9, "on the horizon at sunrise");
  assert.equal(sunElevation(0.5), 1, "overhead at noon");
  assert.ok(Math.abs(sunElevation(0.75)) < 1e-9, "on the horizon at sunset");
  assert.equal(sunElevation(0), -1, "under the world at midnight");
  const rise = sunDirection(0.25), noon = sunDirection(0.5), set = sunDirection(0.75);
  assert.ok(rise[0] > 0.8 && Math.abs(rise[1]) < 0.01, `from the east at sunrise (${rise.map((v) => v.toFixed(2)).join(", ")})`);
  assert.ok(noon[1] > 0.8 && noon[2] > 0, "from high over the south at noon");
  assert.ok(set[0] < -0.8, "from the west at sunset");
  assert.ok(moonDirection(0)[1] > 0.8, "the moon stands high at midnight");
  assert.ok(moonDirection(0.5)[1] < -0.8, "and is under the world at noon");
  for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9]) assert.ok(Math.abs(Math.hypot(...sunDirection(p)) - 1) < 1e-9, "a unit direction");
  // Daylight and night: full day by mid-morning, full night by mid-evening, both partly there at dusk.
  assert.equal(daylight(0.5), 1);
  assert.equal(nightness(0.5), 0);
  assert.equal(daylight(0), 0);
  assert.equal(nightness(0), 1);
  assert.ok(daylight(0.75) > 0.2 && nightness(0.75) > 0.3, `dusk is both (${daylight(0.75).toFixed(2)} day, ${nightness(0.75).toFixed(2)} night), so the light never drops out between them`);
});

test("the weather is one field over the world and time: the same wherever it is read, changing by degrees, every kind in its turn", () => {
  const at = { x: 3232, y: 3232 };
  assert.deepEqual(weatherAt(at.x, at.y, MOMENT), weatherAt(at.x, at.y, MOMENT), "the same tile and moment, the same weather");
  // A second later, a tile over: nothing has jumped.
  const a = weatherAt(at.x, at.y, MOMENT), b = weatherAt(at.x + 1, at.y, MOMENT + 1000);
  assert.ok(Math.abs(a.cover - b.cover) < 0.01 && Math.abs(a.rain - b.rain) < 0.01 && Math.abs(a.mist - b.mist) < 0.01, "a step and a second change it by a hair");
  // Over a long while and a wide ground: every kind, clear the commonest, storm the rarest, mist only at dawn.
  const counts: Record<WeatherKind, number> = { clear: 0, cloud: 0, mist: 0, rain: 0, storm: 0 };
  let total = 0, mistOffDawn = 0;
  for (let t = 0; t < 400; t++) {
    const when = MOMENT + t * WEATHER_MS * 0.37;
    const phase = dayPhase(when);
    for (let i = 0; i < 25; i++) {
      const w = weatherAt(2816 + (i % 5) * 400, 2944 + Math.floor(i / 5) * 400, when);
      counts[w.kind]++;
      total++;
      for (const v of [w.cover, w.rain, w.mist, w.storm]) assert.ok(v >= 0 && v <= 1, "every amount is 0 to 1");
      assert.ok(Math.hypot(...w.wind) > 0.1, "there is always some wind");
      if (w.mist > 0 && !(phase > 0.15 && phase < 0.38)) mistOffDawn++;
      if (w.mist > 0) assert.equal(w.rain, 0, "mist clears where it rains");
    }
  }
  for (const k of Object.keys(counts) as WeatherKind[]) assert.ok(counts[k] > 0, `${k} happens (${JSON.stringify(counts)})`);
  assert.ok(counts.clear > counts.cloud && counts.cloud > counts.rain && counts.rain > counts.storm, `clear is the commonest and storm the rarest (${JSON.stringify(counts)})`);
  assert.ok(counts.storm / total < 0.1, `storms are rare (${((100 * counts.storm) / total).toFixed(1)}% of samples)`);
  assert.equal(mistOffDawn, 0, "mist is dawn's alone");
  // The kind follows the amounts.
  assert.equal(kindOf({ cover: 0, rain: 0, mist: 0, storm: 0 }), "clear");
  assert.equal(kindOf({ cover: 0.9, rain: 0, mist: 0, storm: 0 }), "cloud");
  assert.equal(kindOf({ cover: 0.9, rain: 0.5, mist: 0, storm: 0 }), "rain");
  assert.equal(kindOf({ cover: 1, rain: 1, mist: 0, storm: 0.8 }), "storm");
  assert.equal(kindOf({ cover: 0.2, rain: 0, mist: 0.6, storm: 0 }), "mist");
  // The control: two tiles a weather's width apart, or two moments a weather's while apart, can differ.
  let differs = 0;
  for (let t = 0; t < 40; t++) if (weatherAt(3232, 3232, MOMENT + t * WEATHER_MS).kind !== weatherAt(3232 + WEATHER_TILES * 2, 3232, MOMENT + t * WEATHER_MS).kind) differs++;
  assert.ok(differs > 3, `the control: far apart, the weather is its own (${differs} of 40 moments)`);
});

test("lightning falls on the same instants for everyone, only in a storm, with its thunder after it", () => {
  let lit = 0, thunders = 0;
  for (let t = 0; t < 600_000; t += 50) {
    const l = lightningAt(MOMENT + t, 1);
    if (l.flash > 0) lit++;
    if (l.thunder !== null && l.thunder > MOMENT + t) thunders++;
    assert.ok(l.flash >= 0 && l.flash <= 1, "a flash is 0 to 1");
    if (l.thunder !== null) assert.ok(l.thunder > MOMENT + t - 10_000 && l.thunder < MOMENT + t + 10_000, "the thunder is near its flash");
    assert.equal(lightningAt(MOMENT + t, 0).flash, 0, "no lightning in clear weather");
  }
  assert.ok(lit > 100, `ten minutes of storm has its flashes (${lit} samples lit)`);
  assert.ok(thunders > 0, "with thunder to come");
  assert.deepEqual(lightningAt(MOMENT + 1234, 1), lightningAt(MOMENT + 1234, 1), "the control: the same moment, the same flash");
  // A light storm flashes less than a full one.
  let lightLit = 0;
  for (let t = 0; t < 600_000; t += 50) if (lightningAt(MOMENT + t, 0.3).flash > 0) lightLit++;
  assert.ok(lightLit < lit, `a light storm flashes less (${lightLit} against ${lit})`);
});
