// Run energy, by the classic rules: 0–10,000 units, shown as a whole percentage.

export const MAX_ENERGY = 10_000;

/** Units lost on a tick spent running (two tiles). Weight counts up to 64 kg; Agility lowers the cost. */
export function runDrain(weightKg: number, agility: number): number {
  const w = Math.min(64, Math.max(0, weightKg));
  return Math.floor(Math.floor(60 + (67 * w) / 64) * (1 - agility / 300));
}

/** Units regained on a tick spent walking or standing. */
export function energyRegen(agility: number): number {
  return Math.floor(agility / 10) + 15;
}

export function energyPercent(units: number): number {
  return Math.floor(units / 100);
}
