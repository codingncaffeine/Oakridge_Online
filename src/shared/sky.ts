// The sky's clock and its weather (PLAN Phase 16): pure functions of the world's time, which is the
// server's clock, so every player sees the same sky at the same moment and nothing about it travels
// over the wire. The client draws what these say; the tests read them straight.
import { hashInt, valueNoise2D } from "./rng.ts";
import { smoothstep } from "./worldgen.ts";

/** How long a day lasts in the world: dawn, noon, dusk and night are all seen in one sitting. */
export const DAY_MS = 48 * 60 * 1000;

/** Where in the day a moment falls: 0 at midnight, 0.25 at sunrise, 0.5 at noon, 0.75 at sunset. */
export function dayPhase(now: number): number {
  const p = (now / DAY_MS) % 1;
  return p < 0 ? p + 1 : p;
}

/** The hour of the world's day, 0 to 24, for a caption and the report. */
export const hourOf = (phase: number): number => phase * 24;

/** How high the sun stands: 1 at noon, 0 at sunrise and sunset, -1 at midnight. */
export function sunElevation(phase: number): number {
  return Math.sin((phase - 0.25) * Math.PI * 2);
}

const unit = (x: number, y: number, z: number): [number, number, number] => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};

/**
 * The direction the sun's light comes FROM, in the scene's axes (x east, y up, z south): up in the
 * east at sunrise, over the south at noon, down in the west at sunset, under the world at night.
 */
export function sunDirection(phase: number): [number, number, number] {
  const a = (phase - 0.25) * Math.PI * 2;
  return unit(Math.cos(a), Math.sin(a), 0.55);
}

/** The moon's, which is the sun's from the other side of the world: high at midnight. */
export function moonDirection(phase: number): [number, number, number] {
  const a = (phase - 0.25) * Math.PI * 2 + Math.PI;
  return unit(Math.cos(a), Math.sin(a), 0.55);
}

/** How much daylight there is, 0 at night to 1 by mid-morning; dawn and dusk are the ramp between. */
export function daylight(phase: number): number {
  return smoothstep(-0.15, 0.25, sunElevation(phase));
}

/**
 * How much night there is, for the stars, the moon and the moon's light: the opposite ramp, which
 * overlaps the day's so the light never drops out between them at dusk.
 */
export function nightness(phase: number): number {
  return smoothstep(0.15, -0.2, sunElevation(phase));
}

export type WeatherKind = "clear" | "cloud" | "mist" | "rain" | "storm";

export interface Weather {
  kind: WeatherKind;
  /** Cloud over the sky, 0 (none) to 1 (overcast). */
  cover: number;
  /** How hard it is raining, 0 to 1. */
  rain: number;
  /** How thick the mist is, 0 to 1. */
  mist: number;
  /** How much of a storm it is, 0 to 1: the lightning and the thunder come with it. */
  storm: number;
  /** The wind, as tiles a second east and north: what the cloud drifts on and the rain leans with. */
  wind: [number, number];
}

/** The weather changes over about this many tiles, and over about this much time. */
export const WEATHER_TILES = 320;
export const WEATHER_MS = 14 * 60 * 1000;

const field = valueNoise2D(1601);
const mistField = valueNoise2D(1602);
const windField = valueNoise2D(1603);

/** The name of a weather, from its amounts: a storm is rain and more, mist only where it is not raining. */
export function kindOf(w: Omit<Weather, "kind" | "wind">): WeatherKind {
  if (w.storm > 0.5) return "storm";
  if (w.rain > 0.15) return "rain";
  if (w.mist > 0.3) return "mist";
  return w.cover > 0.45 ? "cloud" : "clear";
}

/**
 * The weather over a tile at a moment: one smooth field over the world and over time, so it comes and
 * goes by degrees and a player walking from one part of it to another sees it change, never jump. The
 * thresholds make clear skies the commonest and storms the rarest; mist is dawn's, and clears where it
 * rains. Every client reads the same numbers off the same clock.
 */
export function weatherAt(x: number, y: number, now: number): Weather {
  const t = now / WEATHER_MS;
  const n = 0.6 * field(x / WEATHER_TILES + t * 0.7, y / WEATHER_TILES + t * 0.2)
    + 0.4 * field(x / (WEATHER_TILES * 3) + 40 - t * 0.35, y / (WEATHER_TILES * 3) + t * 0.1);
  const cover = smoothstep(0.42, 0.78, n);
  const rain = smoothstep(0.64, 0.76, n);
  const storm = smoothstep(0.76, 0.86, n);
  const phase = dayPhase(now);
  const dawn = smoothstep(0.17, 0.23, phase) * smoothstep(0.36, 0.3, phase);
  const mist = rain > 0 ? 0 : dawn * smoothstep(0.5, 0.7, mistField(x / WEATHER_TILES + t * 0.3, y / WEATHER_TILES - t * 0.4));
  const angle = windField(t * 0.5, 7.5) * Math.PI * 2;
  const speed = 0.6 + 2.4 * cover + 4 * storm;
  const amounts = { cover, rain, mist, storm };
  return { kind: kindOf(amounts), ...amounts, wind: [Math.cos(angle) * speed, Math.sin(angle) * speed] };
}

/** How often lightning may strike: once in each of these, on a roll of the clock. */
const FLASH_SLOT_MS = 7000;

/**
 * Lightning at a moment in a storm: how bright the flash is right now (0 for none), and when its
 * thunder is due, on the clock, so a client can play it once. The flashes fall on the same instants
 * for everyone, because they are rolled from the clock and nothing else.
 */
export function lightningAt(now: number, storm: number): { flash: number; thunder: number | null } {
  if (storm <= 0) return { flash: 0, thunder: null };
  const slot = Math.floor(now / FLASH_SLOT_MS);
  const r1 = hashInt(11, slot), r2 = hashInt(12, slot), r3 = hashInt(13, slot);
  if (r1 > 0.9 * storm) return { flash: 0, thunder: null };
  const start = slot * FLASH_SLOT_MS + r2 * 4000;
  const since = now - start;
  const flash = since >= 0 && since < 600 ? Math.exp(-since / 120) * (0.6 + 0.4 * r3) : 0;
  return { flash, thunder: start + 700 + r3 * 2200 };
}
