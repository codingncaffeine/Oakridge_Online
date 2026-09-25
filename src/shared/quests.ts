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
  {
    key: "silence_at_mourn",
    name: "The Silence at Mourn",
    giver: "rill_warden",
    where: "Warden Aske keeps the bridge over the Black Rill, where the Fen Road ends, east of Thornbury.",
    stages: [
      "Warden Aske won't let anyone over the Black Rill without the castle's leave: Mourn, out in the fen, has gone quiet. Castellan Vane gives leave in Thornbury's keep, at the top of the King's Way.",
      "Castellan Vane will seal a leave once four rill lurkers are dead. They have been coming up out of the Rill onto the Fen Road's last stretch, west of the bridge.",
      "The castellan sealed a leave to cross the Rill. Warden Aske is waiting to see it at the bridge.",
      "Warden Aske took the leave, then owned up: against the castle's orders he has been hiding a man from Mourn in his guardhouse. The man's name is Pell, and the warden wants you to hear him out.",
      "Pell lit Mourn's lamps. He says the chapel bell, taken down in the spring, rang out one night under the fen; every lamp in Mourn went out, and he ran. The warden will pass you over the Rill now. Find Mourn's reeve at the causeway's end.",
      "Reeve Hollis confessed: Mourn cut down its own bell and sank it in the fen, because the dead rose whenever it rang. It rings down there still. He wants three fen wights laid to rest; they walk the fen off the causeway.",
      "Three fen wights are laid, and Mourn is quiet for now. The reeve asks you to tell Warden Aske that Pell can come home.",
      "Warden Aske has his answer, and Pell can go home. The castle will hear that Mourn is quiet, if not why.",
    ],
    points: 3,
    reward: { xp: [["attack", 30000], ["strength", 30000], ["prayer", 10000]], items: [["coins", 500]] },
  },
  // Runesmithing's opening (PLAN Phase 18, R2): the glimstone pit opens as part of the story, not a flag.
  {
    key: "pull_of_the_charm",
    name: "The Pull of the Charm",
    giver: "staff_seller",
    where: "Orrin Vell sells staves and runes in Thornbury, and has had something on his mind all week.",
    stages: [
      "Orrin Vell found a gale charm in a drawer he had not opened in years, and it has been pulling east ever since. He wants to know what it pulls toward. The charm's Locate says which way, and it points east of Oakridge's green.",
      "The charm led to a ring of standing stones in the East Meadow, east of Oakridge's green. The altar in the middle woke at the charm, and the writing cut in its side came away as a rubbing. Vell will want to see it.",
      "Vell can't read the rubbing: it is in the old carvers' hand. He says Agnes Quill, the apothecary in Thornbury, wrote down everything of theirs before she took to herbs.",
      "Agnes read the rubbing: it is the word that opens the glimstone pit. She says Vell knows it perfectly well, because he sealed the pit himself, and she wrote it out on a note for him.",
      "Vell owned up: he sealed the pit when the last of the old carvers died, rather than go down alone. He has opened it for you, shown you how a stone is carved, and will send you down whenever you ask.",
    ],
    points: 2,
    reward: { xp: [["runesmithing", 2500]], items: [["glimstone", 10]] },
  },
];

/** The Silence at Mourn is the Sallowfen's lock: from this stage on, the Rill warden passes a player over the bridge (world.ts). */
export const MOURN_QUEST = "silence_at_mourn";
/** The Pull of the Charm opens the glimstone pit: at its first stage the Gale altar gives up its rubbing (world.ts), and once it is done Vell sends a player down. */
export const PIT_QUEST = "pull_of_the_charm";
export const PIT_OPENS_AT = 5;
export const RILL_PASSES_AT = 5;

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
