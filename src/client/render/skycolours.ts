// The sky's colours at any moment of the day, blended from the palette's keyframes. No three.js here,
// so a plain test can read them.
import { SKY_KEYS } from "../palette.ts";

/** A colour as three numbers 0 to 1, in sRGB as the palette writes them. */
export type Rgb = [number, number, number];

export const rgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface SkyColours {
  zenith: Rgb;
  horizon: Rgb;
  sun: Rgb;
  sky: Rgb;
  ground: Rgb;
}

/** The colours at a phase of the day: the two keys either side of it, eased between. */
export function skyAt(phase: number): SkyColours {
  const p = phase - Math.floor(phase);
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1]!.at <= p) i++;
  const a = SKY_KEYS[i]!, b = SKY_KEYS[i + 1]!;
  const t = Math.max(0, Math.min(1, (p - a.at) / (b.at - a.at)));
  const s = t * t * (3 - 2 * t);
  return {
    zenith: mix(rgb(a.zenith), rgb(b.zenith), s),
    horizon: mix(rgb(a.horizon), rgb(b.horizon), s),
    sun: mix(rgb(a.sun), rgb(b.sun), s),
    sky: mix(rgb(a.sky), rgb(b.sky), s),
    ground: mix(rgb(a.ground), rgb(b.ground), s),
  };
}
