// The `villager(...)` line a person of the world is written as in shared/monsters.ts, printed from a
// definition. The NPC maker's "copy as code" prints it, so a person dressed by eye pastes into the
// bestiary in the file's own layout; tests/villagercode.test.ts holds the printer to that layout by
// finding every person already in the file, printed, in the file verbatim.
import { VISIBLE_GEAR, type EquipSlot } from "./items.ts";
import type { MonsterDef } from "./monsters.ts";

/**
 * What a `villager(...)` line carries: its four arguments, then the extras in the order the file writes
 * them. `wander` is optional here though every entity has one, because the helper fills it in when a line
 * leaves it out.
 */
export type VillagerLine = Pick<MonsterDef, "key" | "name" | "examine" | "look" | "talk" | "banker" | "shop" | "wear" | "apron"> & { wander?: number };

const str = (s: string) => JSON.stringify(s);

/** A colour as the file writes one: `0x` and six hex digits, leading zeros kept. */
export const hex6 = (c: number): string => `0x${c.toString(16).padStart(6, "0")}`;

export function villagerCode(def: VillagerLine): string {
  if (!def.look) throw new Error(`${def.key} has no look to print`);
  const extras: string[] = [];
  if (def.talk !== undefined) extras.push(`talk: ${str(def.talk)}`);
  if (def.banker) extras.push("banker: true");
  if (def.shop !== undefined) extras.push(`shop: ${str(def.shop)}`);
  if (def.wander !== undefined) extras.push(`wander: ${def.wander}`);
  // Worn things print in the order the game draws them, whatever order they were given in.
  const wear = (def.wear ?? {}) as Partial<Record<EquipSlot, string>>;
  const worn = VISIBLE_GEAR.filter((slot) => wear[slot]).map((slot) => `${slot}: ${str(wear[slot]!)}`);
  if (worn.length) extras.push(`wear: { ${worn.join(", ")} }`);
  if (def.apron !== undefined) extras.push(`apron: ${hex6(def.apron)}`);
  const head = `  villager(${str(def.key)}, ${str(def.name)}, ${str(def.examine)}, [${def.look.join(", ")}]`;
  return extras.length ? `${head}, {\n    ${extras.join(", ")},\n  }),` : `${head}),`;
}
