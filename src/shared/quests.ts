// The quests (PLAN Phase 9): each one its stages, the journal's line for each, the person who gives
// it, what it pays and its points. Every quest is data here and lines in dialogue.ts (conditions and
// effects on the giver's tree); the server runs them, and a test walks each one through. Every name
// and line is this game's own.
import type { SkillKey } from "./skills.ts";

export interface QuestDef {
  key: string;
  name: string;
  /** Who gives it: a person's key in the bestiary. */
  giver: string;
  /** Where to find them, in the words the journal shows before the quest is begun. */
  where: string;
  /** The journal's line for each stage, from 1 (begun) to the last (complete). Stage 0 is not begun. */
  stages: string[];
  points: number;
  reward: { xp?: Array<[SkillKey, number]>; items?: Array<[string, number]> };
}

export const QUESTS: QuestDef[] = [
  {
    key: "split_oak_table",
    name: "A Table at the Split Oak",
    giver: "innkeeper",
    where: "Hesper Doon keeps the Split Oak, the inn on the west side of Oakridge green.",
    stages: [
      "Hesper Doon wants the range fed and the table laid: five logs, and two sardines, cooked. Sardines come off the jetty south of the green; the range is through the inn's door.",
      "Hesper laid the table and paid for the trouble. There is a plate for you at the Split Oak whenever you like.",
    ],
    points: 1,
    reward: { xp: [["cooking", 3000]], items: [["coins", 60]] },
  },
  {
    key: "millers_band",
    name: "The Miller's Band",
    giver: "miller",
    where: "Nessa Rill keeps the mill, on the north-west edge of Oakridge.",
    stages: [
      "The iron band round Nessa Rill's millstone has cracked through. She wants two bronze bars to have a new one cast: copper and tin out of Copperfoot Quarry, run together in the smithy's furnace.",
      "Nessa has her bars, and Garrow Lund is casting the band. The mill will turn again.",
    ],
    points: 1,
    reward: { xp: [["smithing", 2500]], items: [["coins", 90]] },
  },
  {
    key: "mudfoot_mischief",
    name: "Mudfoot Mischief",
    giver: "farmer",
    where: "Tolle Hark farms Hollowbeck, north of Oakridge green.",
    stages: [
      "The Mudfoot goblins have been at Hollowbeck's hens. Tolle Hark wants three of them put down. Their stockade is in the Oakenshaw, west of the village.",
      "Three Mudfoot goblins fewer, and Tolle Hark's hens sleep easier. He paid what a farmer can.",
    ],
    points: 1,
    reward: { xp: [["attack", 2000]], items: [["coins", 120]] },
  },
];

export const QUEST_BY_KEY = new Map(QUESTS.map((q) => [q.key, q]));

/** Every quest's stage by its key; a quest not there is not begun. */
export type QuestStages = Record<string, number>;

export const noQuests = (): QuestStages => ({});
export const stageOf = (stages: QuestStages, key: string): number => stages[key] ?? 0;
/** A quest is complete once its stage has reached the last of its lines. */
export const isComplete = (q: QuestDef, stage: number): boolean => stage >= q.stages.length;

/** The points earned: every completed quest's. */
export function questPoints(stages: QuestStages): number {
  let n = 0;
  for (const q of QUESTS) if (isComplete(q, stageOf(stages, q.key))) n += q.points;
  return n;
}

export const TOTAL_QUEST_POINTS = QUESTS.reduce((sum, q) => sum + q.points, 0);

/** A saved record of stages, kept to the quests that exist and the stages they have. */
export function readQuests(raw: unknown): QuestStages {
  const out = noQuests();
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const q = QUEST_BY_KEY.get(key);
    if (q && Number.isInteger(value) && (value as number) >= 0) out[key] = Math.min(q.stages.length, value as number);
  }
  return out;
}
