/**
 * How a prop is turned and sized by its variant: what the renderer draws it with, and what anything
 * standing on it — a flame on a hearth — has to follow to land in the same place.
 */
export function propPlacement(variant: number): { turn: number; scale: number } {
  const fract = (v: number) => v - Math.floor(v);
  return { turn: fract(variant * 7.31) * Math.PI * 2, scale: 0.88 + 0.24 * fract(variant * 13.7) };
}
