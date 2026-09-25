// What the people of the world say. Since Phase 9 a node may branch on what the player has done, an
// option may be hidden until something holds and may do something when it is taken — which is all a
// quest is (shared/quests.ts). Every line is this game's own wording (PLAN §5's standing rule).
import type { SkillKey } from "./skills.ts";

/** What choosing an option does besides moving the conversation on. */
export type DialogueAct = "bank" | "shop" | "close";

/** Something that must hold for an option to be offered, or for a branch to be taken. */
export type Condition =
  /** A quest at exactly this stage (0 is not begun). */
  | { quest: string; stage: number }
  | { quest: string; atLeast: number }
  | { quest: string; below: number }
  /** At least this many of an item in the pack (one, unless said). */
  | { has: string; count?: number }
  /** At least this many of a creature killed since the quest's stage last changed. */
  | { tally: string; count: number };

/** Something that happens when an option is taken, in the order written. */
export type Effect =
  /** Sets a quest's stage, and clears the kill tally. */
  | { quest: string; stage: number }
  | { take: string; count?: number }
  | { give: string; count?: number }
  | { xp: SkillKey; tenths: number }
  | { say: string }
  /** Swings open the door or gate built with this tag, for as long as a clicked one stands open: how a toll gate is passed. */
  | { open: string }
  /** Puts the player down at a landing of `TRAVEL` (shared/travel.ts): how a ferry crosses. */
  | { travel: string };

export interface DialogueOption {
  /** What the player says. */
  text: string;
  /** Where the conversation goes next; leaving it out ends the talk. */
  to?: string;
  /** Something that happens when this option is taken. */
  act?: DialogueAct;
  /** Offered only while every one of these holds. */
  when?: Condition[];
  /** What taking it does, before the conversation moves on. */
  do?: Effect[];
}

export interface DialogueNode {
  /** What the NPC says, one line per box. */
  lines: string[];
  /** What the player may say back. An empty list ends the talk on a click. */
  options?: DialogueOption[];
  /** Where this node sends a player instead, the first whose conditions all hold: how a giver greets someone mid-quest. */
  branch?: Array<{ when: Condition[]; to: string }>;
}

/** One NPC's conversation: nodes by name, always starting at `start`. */
export type DialogueTree = Record<string, DialogueNode>;

export const DIALOGUE: Record<string, DialogueTree> = {
  banker: {
    start: {
      lines: ["Good day. Would you like to use your account?"],
      options: [
        { text: "Yes, please.", act: "bank" },
        { text: "What is this place?", to: "about" },
        { text: "No, thank you.", act: "close" },
      ],
    },
    about: {
      lines: [
        "The bank holds what you'd rather not carry.",
        "Anything you leave here stays yours, and stays here — through a fall, a fire, or a long walk home.",
      ],
      options: [
        { text: "I'll use it, then.", act: "bank" },
        { text: "Another time.", act: "close" },
      ],
    },
  },

  shopkeeper_general: {
    start: {
      lines: ["Morning. Odds, ends, and a bit of everything."],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "What's worth knowing around here?", to: "gossip" },
        { text: "Just looking.", act: "close" },
      ],
    },
    gossip: {
      lines: [
        "The wood west of here is full of good timber and bad company.",
        "The quarry's east, past the bridge. Mind the bats.",
        "And don't go south-west. Nobody's asked me twice.",
      ],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "Thanks.", act: "close" },
      ],
    },
  },

  shopkeeper_tools: {
    start: {
      lines: ["Axes, picks, nets. Nothing pretty, all of it works."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "Which should I start with?", to: "advice" },
        { text: "Later.", act: "close" },
      ],
    },
    advice: {
      lines: [
        "Bronze, for a start. It'll fell a tree and break a rock, slowly.",
        "Iron when your arms know what they're doing. Steel after that.",
        "Past steel you'll want a forge, not a shop.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Right you are.", act: "close" },
      ],
    },
  },

  gatekeeper: {
    start: {
      lines: ["Toll gate. Ten coins, and the Emberway's yours as far as it goes."],
      options: [
        {
          text: "Here's ten.", when: [{ has: "coins", count: 10 }], act: "close",
          do: [{ take: "coins", count: 10 }, { open: "emberway" }, { say: "The keeper pockets the coins and swings the gate wide." }],
        },
        { text: "Ten coins? For a gate?", to: "why" },
        { text: "What's on the other side?", to: "beyond" },
        { text: "Not today.", act: "close" },
      ],
    },
    why: {
      lines: [
        "Thornbury's orders. The toll pays the guard, and the guard keeps the Cinderwaste on its own side of the wall.",
        "It was shut outright till the smiths at Kilnhold started asking where their trade had gone.",
      ],
      options: [{ text: "Fair enough.", act: "close" }],
    },
    beyond: {
      lines: [
        "The Emberway, and then the Cinderwaste.",
        "Hot, and getting hotter the further you go. Kilnhold's at the end of it, four minutes' walk if nothing stops you.",
        "Something usually tries.",
      ],
      options: [{ text: "Another time, then.", act: "close" }],
    },
  },

  innkeeper: {
    start: {
      lines: ["Welcome to the Split Oak. Mind the step."],
      // A Table at the Split Oak (quests.ts): mid-quest she greets you with what she is waiting for.
      branch: [
        { when: [{ quest: "split_oak_table", stage: 1 }, { has: "logs", count: 5 }, { has: "sardine", count: 2 }], to: "table_done" },
        { when: [{ quest: "split_oak_table", stage: 1 }], to: "table_wait" },
      ],
      options: [
        { text: "Is there anything the house needs?", to: "table_ask", when: [{ quest: "split_oak_table", stage: 0 }] },
        { text: "Can I cook here?", to: "range" },
        { text: "Who's upstairs?", to: "upstairs" },
        { text: "Nothing, thanks.", act: "close" },
      ],
    },
    range: {
      lines: ["The range is yours if you've something to put on it. Try not to burn the place down."],
      options: [{ text: "Thanks.", act: "close" }],
    },
    upstairs: {
      lines: ["Rooms. Empty ones, mostly. You're welcome to look."],
      options: [{ text: "I might.", act: "close" }],
    },
    table_ask: {
      lines: [
        "Needs? The range wants feeding and there's not a fish in the house.",
        "Five logs and two sardines, cooked. Bring me those and there's a plate in it for you, and a few coins.",
      ],
      options: [
        { text: "I'll see to it.", to: "table_go", do: [{ quest: "split_oak_table", stage: 1 }] },
        { text: "Not today.", act: "close" },
      ],
    },
    table_go: {
      lines: ["The jetty's south of the green for the sardines, and the range is through there when you've caught them. Logs are logs; there's a wood."],
      options: [{ text: "Right.", act: "close" }],
    },
    table_wait: {
      lines: ["Five logs, two sardines, cooked. I've not forgotten, and nor should you."],
      options: [{ text: "I'm on it.", act: "close" }],
    },
    table_done: {
      lines: ["Five logs and two sardines, and cooked, at that. You'll do."],
      options: [
        {
          text: "Here you are.",
          to: "table_thanks",
          do: [{ take: "logs", count: 5 }, { take: "sardine", count: 2 }, { quest: "split_oak_table", stage: 2 }, { xp: "cooking", tenths: 3000 }, { give: "coins", count: 60 }],
        },
      ],
    },
    table_thanks: {
      lines: ["That's a table laid. Sit down whenever you like; there's a plate for you."],
      options: [{ text: "Thank you.", act: "close" }],
    },
  },

  smith: {
    start: {
      lines: ["Furnace is hot and the anvil's free. Help yourself."],
      options: [
        { text: "How does this work?", to: "how" },
        { text: "Thanks.", act: "close" },
      ],
    },
    how: {
      lines: [
        "Ore into the furnace, and it comes out a bar. Copper and tin together for bronze.",
        "Bar onto the anvil, hammer in hand, and it comes out something useful.",
        "Steel wants coal with the iron. There's coal in the quarry, deep in.",
      ],
      options: [{ text: "I'll try it.", act: "close" }],
    },
  },

  farmer: {
    start: {
      lines: ["Cows are cows. Don't let the gate swing."],
      // Mudfoot Mischief (quests.ts): three goblins put down since he asked, and he pays.
      branch: [
        { when: [{ quest: "mudfoot_mischief", stage: 1 }, { tally: "mudfoot_goblin", count: 3 }], to: "mischief_done" },
        { when: [{ quest: "mudfoot_mischief", stage: 1 }], to: "mischief_wait" },
        { when: [{ quest: "mudfoot_mischief", stage: 2 }], to: "mischief_after" },
      ],
      options: [
        { text: "Something wrong with the hens?", to: "mischief_ask", when: [{ quest: "mudfoot_mischief", stage: 0 }] },
        { text: "Mind if I take a hide?", to: "hides" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    hides: {
      lines: ["Take what falls. The tanner in the village will cure it for a few coins."],
      options: [{ text: "Good of you.", act: "close" }],
    },
    mischief_ask: {
      lines: [
        "Wrong? Three gone this week, and feathers on the path to the wood. Mudfoot goblins, out of that stockade of theirs.",
        "Put three of them down and I'll pay you what a farmer can.",
      ],
      options: [
        { text: "I'll deal with them.", to: "mischief_go", do: [{ quest: "mudfoot_mischief", stage: 1 }] },
        { text: "I'd rather not.", act: "close" },
      ],
    },
    mischief_go: {
      lines: ["The stockade's in the Oakenshaw, west of the village. They come in a crowd, so don't go in tired."],
      options: [{ text: "Understood.", act: "close" }],
    },
    mischief_wait: {
      lines: ["Three of them. I'll know when the hens stop going."],
      options: [{ text: "I'm on it.", act: "close" }],
    },
    mischief_done: {
      lines: ["Three, you say? The hens have been quiet, so I believe you. Here's what I promised."],
      options: [
        { text: "Glad to help.", to: "mischief_thanks", do: [{ quest: "mudfoot_mischief", stage: 2 }, { xp: "attack", tenths: 2000 }, { give: "coins", count: 120 }] },
      ],
    },
    mischief_thanks: {
      lines: ["Don't let the gate swing on your way out."],
      options: [{ text: "I won't.", act: "close" }],
    },
    mischief_after: {
      lines: ["Hens are laying again. That's your doing."],
      options: [{ text: "Good.", act: "close" }],
    },
  },

  miller: {
    start: {
      lines: ["Flour's not much use to you yet. Come back when there's a baker."],
      // The Miller's Band (quests.ts): two bronze bars for the millstone, and the mill turns again.
      branch: [
        { when: [{ quest: "millers_band", stage: 1 }, { has: "bronze_bar", count: 2 }], to: "band_done" },
        { when: [{ quest: "millers_band", stage: 1 }], to: "band_wait" },
        { when: [{ quest: "millers_band", stage: 2 }], to: "band_after" },
      ],
      options: [
        { text: "Is the mill turning?", to: "band_ask", when: [{ quest: "millers_band", stage: 0 }] },
        { text: "Right.", act: "close" },
      ],
    },
    band_ask: {
      lines: [
        "Turning? It's stopped. The iron band round the stone has cracked through, and the stone won't run without it.",
        "Garrow will cast me a new one if I bring him the metal: two bronze bars. I've no time to dig for it.",
      ],
      options: [
        { text: "I'll bring the bars.", to: "band_go", do: [{ quest: "millers_band", stage: 1 }] },
        { text: "That's not my trade.", act: "close" },
      ],
    },
    band_go: {
      lines: ["Copper and tin come out of the quarry east of the village, and the smithy's furnace runs them together. Two bars, and I'll pay for the sweat."],
      options: [{ text: "Right.", act: "close" }],
    },
    band_wait: {
      lines: ["Two bronze bars. The stone's not going anywhere."],
      options: [{ text: "I'm on it.", act: "close" }],
    },
    band_done: {
      lines: ["Two bronze bars. Good metal, too. Hand them over."],
      options: [
        { text: "Here they are.", to: "band_thanks", do: [{ take: "bronze_bar", count: 2 }, { quest: "millers_band", stage: 2 }, { xp: "smithing", tenths: 2500 }, { give: "coins", count: 90 }] },
      ],
    },
    band_thanks: {
      lines: ["Garrow can cast the band this week, and the stone will turn. Here's for the digging. Come back when there's a baker."],
      options: [{ text: "I will.", act: "close" }],
    },
    band_after: {
      lines: ["The band holds, and the mill turns. Flour's still no use to you, mind."],
      options: [{ text: "One day.", act: "close" }],
    },
  },

  guard: {
    start: {
      lines: ["Roads are safe. Mostly."],
      options: [
        { text: "Mostly?", to: "mostly" },
        { text: "Good to know.", act: "close" },
      ],
    },
    mostly: {
      lines: [
        "There's a man works the Emberway who doesn't ask politely.",
        "Stay on the road and you'll see him coming. That's the difference."],
      options: [{ text: "I'll watch for him.", act: "close" }],
    },
  },

  villager: {
    start: {
      lines: ["Oakridge. Quiet, and we like it."],
      options: [{ text: "So I see.", act: "close" }],
    },
  },

  innkeeper_stonecote: {
    start: {
      lines: ["The Drover's Rest. Beds upstairs, the range through there, and the river's free to anyone."],
      options: [
        { text: "What's down the hole past the chapel?", to: "hollow" },
        { text: "Anything to catch in the river?", to: "river" },
        { text: "Just passing through.", act: "close" },
      ],
    },
    hollow: {
      lines: [
        "Rats, mostly. Big ones. There's coal down there too, the black kind the smiths want.",
        "And something with teeth has made the far room its own. Nobody from here goes down. Somebody like you might.",
      ],
      options: [{ text: "I might.", act: "close" }],
    },
    river: {
      lines: [
        "Redfin, if you've a rod and bait. Pike sells both, over the bridge.",
        "Cook them on my range and you'll have a supper that walked the North Road to get here.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  tackle_keeper: {
    start: {
      lines: ["Rods, bait, nets. The redfin are biting, or so I tell everyone."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "Where do I cast?", to: "where" },
        { text: "Not today.", act: "close" },
      ],
    },
    where: {
      lines: [
        "Off either bank, downstream of the bridge. The water's slow there and the fish are lazy.",
        "Rod in one hand, bait in the pack. It goes on the hook, not in your mouth.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Right.", act: "close" },
      ],
    },
  },

  cotter: {
    start: {
      lines: ["Passing through? Everyone is. It's that sort of place."],
      options: [
        { text: "Where does the road go?", to: "road" },
        { text: "What is there here?", to: "here" },
        { text: "Just passing.", act: "close" },
      ],
    },
    road: {
      lines: [
        "South, it's Oakridge. North, it's Thornbury, and the city's a good deal bigger than us.",
        "Stay on the road and nothing will bother you. Step off it and the wood's another matter.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
    here: {
      lines: [
        "An inn, a chapel, a well, and a hole in the ground nobody talks about.",
        "Pike sells tackle. The river's good for redfin. That's Stonecote.",
      ],
      options: [{ text: "That'll do.", act: "close" }],
    },
  },

  // --- Wickstead (PLAN §7.6, Wave 1) ---

  netmaker: {
    start: {
      lines: ["Nets, rods, creels, bait. If it goes in the water and comes out with a fish on it, I sell it."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "What's biting?", to: "biting" },
        { text: "Not today.", act: "close" },
      ],
    },
    biting: {
      lines: [
        "Grayling in the beck, up past the bank. A rod, bait, and a bit of skill: they're not redfin.",
        "Off the jetty it's sardine and smelt to a net, same as anywhere. The creel and the harpoon are for the coast south of here, and the folk who fish it.",
        "If it's wood you want, the alders are along the shore below the jetty. They fell wet and burn sulky, but a fletcher pays.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Right.", act: "close" },
      ],
    },
  },

  innkeeper_wickstead: {
    start: {
      lines: ["The Grayling. Rooms up the stair, the range through there, and the fish is whatever came in this morning."],
      options: [
        { text: "What is there here?", to: "here" },
        { text: "Who lives in the big house?", to: "manor" },
        { text: "Just passing through.", act: "close" },
      ],
    },
    here: {
      lines: [
        "The bank's over the square, and it's the only one west of Oakridge. Nell sells tackle across the road. The jetty's at the end of it, and the Coast Road runs south from there to Brinehaven, if you like boats.",
        "Keep to the road going back east. The wood over the beck has wolves in it, and the ones in the Oakenshaw are no politer.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
    manor: {
      lines: [
        "Squire Wick. His people had the wick here before there was a village round it, and he'd like you to know it.",
        "He'll talk to anyone, mind. Go up through the garden gate.",
      ],
      options: [{ text: "I might.", act: "close" }],
    },
  },

  squire: {
    start: {
      lines: ["Wick, of Wickstead. Yes, the name came first. Sit, if you must."],
      options: [
        { text: "What is a wick?", to: "wick" },
        { text: "Who keeps order here?", to: "order" },
        { text: "I'll be going.", act: "close" },
      ],
    },
    wick: {
      lines: [
        "A dairy, once. My great-grandmother's cows stood where the square is. Then the fishers came for the beck, and the bank came for the fishers, and now there is a village on my lawn.",
        "The manor is the one thing here that was here first, and I keep it that way.",
      ],
      options: [{ text: "Good day, Squire.", act: "close" }],
    },
    order: {
      lines: [
        "The constable, and the lock-up he stands outside of. Anyone who comes off the Coast Road with more than they went out with spends a night in it.",
        "Thornbury sends nobody. We manage.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
  },

  constable: {
    start: {
      lines: ["Constable. Nothing to see in the lock-up, and you'll not be seeing the inside of it, I hope."],
      options: [
        { text: "What's the lock-up for?", to: "lockup" },
        { text: "Is the road safe?", to: "road" },
        { text: "Carry on.", act: "close" },
      ],
    },
    lockup: {
      lines: [
        "Drunks, mostly, out of the Grayling. Now and then somebody off the Coast Road with a story that doesn't hold. One night on the floor and they're glad to walk to Brinehaven.",
        "Squire's idea. Squire's stone, too.",
      ],
      options: [{ text: "Right.", act: "close" }],
    },
    road: {
      lines: [
        "West Road to Oakridge: keep to it and you'll meet nothing worse than a spider. Coast Road south to the port, the same.",
        "The wood north of the road is where the wolves are. It isn't on the road. That's the point of a road.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  fisher: {
    start: {
      lines: ["Morning. Or it was, when I got up."],
      options: [
        { text: "What do you do here?", to: "do" },
        { text: "Where is the bank?", to: "bank" },
        { text: "Never mind.", act: "close" },
      ],
    },
    do: {
      lines: [
        "Fish. What else? Grayling out of the beck when they're running, sardine off the jetty when they're not.",
        "Nell buys the catch, the Grayling cooks it, and the bank keeps what's left. It's a living.",
      ],
      options: [{ text: "Fair enough.", act: "close" }],
    },
    bank: {
      lines: [
        "North side of the square, under the slate roof. Two bankers, and they don't chat.",
        "It's why the road was cut. Nobody walked all the way out here for the view.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  // --- Brinehaven (PLAN §7.6, Wave 1) ---

  harbourmaster: {
    start: {
      lines: ["Harbourmaster. Three berths, three boats, and one sailing, before you ask: the Sablewood ferry, from the far berth."],
      options: [
        { text: "Where do the boats go?", to: "routes" },
        { text: "What is this place?", to: "port" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    routes: {
      lines: [
        "The Sablewood ferry works the far berth. Tarhollow is a day out across open water; Tregear takes twenty coins for it and doesn't argue the price.",
        "The long run east to Serai is a rumour with a berth kept for it, and now a keel on Sennen's stocks. Ask Tregear if you want the ferry. He'll tell you the same, at more length.",
      ],
      options: [{ text: "I'll ask him.", act: "close" }],
    },
    port: {
      lines: [
        "Brinehaven. Everything that leaves the mainland by water leaves from here, and most of what comes in lands on that quay.",
        "The bank's on the square, Hale sells pots and creels by the water, and the Bell will feed you. Keep off the mole in a blow.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
  },

  shipwright: {
    start: {
      lines: ["Mind the shavings. If it's the ferry you're after, she's off the stocks and at the far berth; what's on them now is the start of the Serai boat."],
      options: [
        { text: "What are you building?", to: "hull" },
        { text: "Do you sell anything?", to: "sell" },
        { text: "I'll not keep you.", act: "close" },
      ],
    },
    hull: {
      lines: [
        "The long boat, for the Serai run. The ferry came back from Sablewood with a strake sprung; she's got new planks and new pitch in her now and Tregear's sailing her again.",
        "This one's years off. Ask me another day.",
      ],
      options: [{ text: "Another day, then.", act: "close" }],
    },
    sell: {
      lines: ["Boats. Nothing you could carry, and nothing that's finished. When there's a hull to spare, you'll hear of it."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  innkeeper_brinehaven: {
    start: {
      lines: ["The Drowned Bell. Rooms up the stair, the range through the back, and crab when Hale has crab."],
      options: [
        { text: "Why the Drowned Bell?", to: "bell" },
        { text: "What is there here?", to: "here" },
        { text: "Just passing.", act: "close" },
      ],
    },
    bell: {
      lines: [
        "There's a bell on the sea floor off the mole, out of a chapel that went in with the cliff it stood on, long before my time.",
        "Divers say they hear it in a swell. Divers say a lot.",
      ],
      options: [{ text: "I'll listen for it.", act: "close" }],
    },
    here: {
      lines: [
        "The bank's across the square. Hale's on the quay for creels and pots, and she'll buy what you lift. The ferry's Tregear's, when it's sailing. It isn't.",
        "The road north takes you back to Wickstead. Keep to it; the wood on the far side has wolves in it.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  potmaker: {
    start: {
      lines: ["Creels, pots, nets, bait. The crab's out past the mole, and it takes a fair hand to lift one."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "How do I catch crab?", to: "crab" },
        { text: "Not today.", act: "close" },
      ],
    },
    crab: {
      lines: [
        "A creel. You set it, you wait, you haul. No bait, no line, no rod: it's patience and a strong back, and a bit more skill than the beck asks.",
        "The beds are off the south shore and round the mole. Anything you land, I'll pay for.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Right.", act: "close" },
      ],
    },
  },

  ferryman: {
    start: {
      lines: ["Tregear. She's planked, pitched and mine again. Sablewood's twenty coins, and I don't wait for stragglers."],
      options: [
        {
          text: "Take me across.", when: [{ has: "coins", count: 20 }], act: "close",
          do: [{ take: "coins", count: 20 }, { travel: "tarhollow" }, { say: "Tregear takes the fare, and the isle comes up out of the haze." }],
        },
        { text: "Where to, exactly?", to: "where" },
        { text: "Twenty coins?", to: "fare" },
        { text: "Not today.", act: "close" },
      ],
    },
    where: {
      lines: [
        "Sablewood. Tarhollow, on the isle: black pine, a mountain that smokes, and folk who don't come back to the mainland much.",
        "No bank over there, mind. What you carry is what you have, and what you lose there stays there.",
      ],
      options: [
        { text: "Take me across.", when: [{ has: "coins", count: 20 }], act: "close", do: [{ take: "coins", count: 20 }, { travel: "tarhollow" }, { say: "Tregear takes the fare, and the isle comes up out of the haze." }] },
        { text: "I'll think on it.", act: "close" },
      ],
    },
    fare: {
      lines: [
        "A day out across open water, and a day back, and the pitch alone cost more than you're carrying.",
        "Twenty. Or swim.",
      ],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  ferryman_isle: {
    start: {
      lines: ["Perrin Tregear. My brother brought you over; I take you back. Twenty coins, same as him."],
      options: [
        {
          text: "Take me back to Brinehaven.", when: [{ has: "coins", count: 20 }], act: "close",
          do: [{ take: "coins", count: 20 }, { travel: "brinehaven" }, { say: "The isle drops astern, and the mainland comes up grey ahead." }],
        },
        { text: "What's on the isle?", to: "isle" },
        { text: "Not yet.", act: "close" },
      ],
    },
    isle: {
      lines: [
        "Tarhollow's up the path. The Black Pine will feed you and Tarr's store sells what a harpoon and an axe need, and that's the whole of it: no bank, no smith, no law.",
        "The ironbark's in the wood east of the village. The sablewood's on the mountain, and the mountain has a mouth in it that eats people. Your money, your business.",
      ],
      options: [{ text: "Understood.", act: "close" }],
    },
  },

  dockhand: {
    start: {
      lines: ["Mind your feet. The boards are wet."],
      options: [
        { text: "What comes in here?", to: "cargo" },
        { text: "Where is the bank?", to: "bank" },
        { text: "Sorry.", act: "close" },
      ],
    },
    cargo: {
      lines: [
        "Fish, mostly, and fish going out. Salt from the south when a boat comes for it. Now and then a crate nobody signs for.",
        "The harbourmaster keeps the book. Ask him, if he's in a mood for it.",
      ],
      options: [{ text: "I might.", act: "close" }],
    },
    bank: {
      lines: ["East side of the square, under the slate roof. Two bankers, and they've heard it all."],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  sailor: {
    start: {
      lines: ["Been ashore a week. A week's too long."],
      options: [
        { text: "Where have you sailed?", to: "sailed" },
        { text: "Is the sea safe?", to: "safe" },
        { text: "Fair winds.", act: "close" },
      ],
    },
    sailed: {
      lines: [
        "Sablewood, twice, and I'd not go a third time. There's a run east to Serai that's talked about more than it's made.",
        "For now it's the Bell, the quay, and waiting on Sennen's planks.",
      ],
      options: [{ text: "Good luck.", act: "close" }],
    },
    safe: {
      lines: [
        "No. That's rather the point of it.",
        "The Sound's calm enough, inside the mole. Past it, it isn't.",
      ],
      options: [{ text: "I'll stay ashore.", act: "close" }],
    },
  },

  // --- Thornbury (PLAN §7.6, Wave 1) ---

  city_guard: {
    start: {
      lines: ["Move along, or state your business. Either's fine."],
      options: [
        { text: "Where is everything?", to: "where" },
        { text: "What's under the trapdoor by the church?", to: "sewers" },
        { text: "Moving along.", act: "close" },
      ],
    },
    where: {
      lines: [
        "Banks at both ends of the High Street. Shops between. The castle's up the King's Way, and you'll not get in past the yard.",
        "South gate for Oakridge, west for the pass, east for the fen, north for the Harrow. Nobody goes north.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
    sewers: {
      lines: [
        "The drains. Rats the size of dogs, and worse if you go down the ladder at the far end.",
        "They come out on the river bank west of the walls. Handy, if you'd rather not be seen leaving.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
  },

  shopkeeper_thornbury: {
    start: {
      lines: ["Ashby's. If we haven't got it, you didn't need it."],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "Who sells what round here?", to: "row" },
        { text: "Just looking.", act: "close" },
      ],
    },
    row: {
      lines: [
        "Coyle for blades, Marrow for anything you wear over a blade, Tolliver for bows. All on the High Street.",
        "Garnett by the castle buys rings, if you've made any. The market's for food and hides.",
      ],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "Thanks.", act: "close" },
      ],
    },
  },

  weaponsmith: {
    start: {
      lines: ["Bronze, iron, steel. Daggers, swords, maces. Pick a word from each."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "No steel sword?", to: "steel" },
        { text: "Later.", act: "close" },
      ],
    },
    steel: {
      lines: [
        "Not for sale. Not by me, not by anyone. The ones that exist were taken off something that didn't want to give it up.",
        "Steel dagger, steel mace, I can do. A sword you'll have to earn.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Fair enough.", act: "close" },
      ],
    },
  },

  armourer: {
    start: {
      lines: ["Leather to steel, head to foot. Try it on before you pay for it."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "What should I wear?", to: "advice" },
        { text: "Not today.", act: "close" },
      ],
    },
    advice: {
      lines: [
        "Leather while you're learning. Bronze when you can afford to be hit. Iron when you'd rather not be.",
        "Steel when you've something worth protecting. Most people never do.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "Right.", act: "close" },
      ],
    },
  },

  fletcher: {
    start: {
      lines: ["Bows, strings, arrows, and the bits to make your own if you're the patient sort."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "Can I use these yet?", to: "yet" },
        { text: "Later.", act: "close" },
      ],
    },
    yet: {
      lines: [
        "Bow in the hand, arrows on your belt, and stand off a way: seven tiles, nine if you take your time over the draw.",
        "Every arrow you loose is gone, so buy plenty. And leave the iron at home; it's what an arrow was made for.",
      ],
      options: [
        { text: "Show me what you have.", act: "shop" },
        { text: "I'll wait.", act: "close" },
      ],
    },
  },

  goldsmith: {
    start: {
      lines: ["Rings, amulets, and a fair price for the metal. Don't touch the glass."],
      options: [
        { text: "Let's see.", act: "shop" },
        { text: "Where does the silver come from?", to: "silver" },
        { text: "Nothing today.", act: "close" },
      ],
    },
    silver: {
      lines: [
        "Under your feet, if you believe the guard. There's a seam down in the old works, past the drains.",
        "I buy the ore, the bars, or what you make of them. I don't go and get it. That's what you're for.",
      ],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "Maybe I will.", act: "close" },
      ],
    },
  },

  staff_seller: {
    start: {
      lines: ["Staves, and what makes them do more than lean in a corner: ember dust, frost salt, storm glass."],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "How does it work?", to: "how" },
        { text: "I'll come back.", act: "close" },
      ],
    },
    how: {
      lines: [
        "Staff in the hand, a pinch of the stuff in your pack, and the word for it. One pinch a cast, whether it lands or not.",
        "Ember dust first. Frost salt when you've the knack, storm glass when you've more than that. And wear wool: iron draws a bolt.",
      ],
      options: [{ text: "Show me.", act: "shop" }, { text: "I'll come back.", act: "close" }],
    },
  },

  apothecary: {
    start: {
      lines: ["Herbs, tinctures, and advice. The advice is free and the rest isn't ready."],
      options: [
        { text: "Not ready?", to: "ready" },
        { text: "Another time.", act: "close" },
      ],
    },
    ready: {
      lines: [
        "A potion is a herb, a vial, and somebody who knows what they're doing. I've the vials.",
        "Bring me the herbs when you find where they grow, and we'll see about the rest.",
      ],
      options: [{ text: "I'll keep an eye out.", act: "close" }],
    },
  },

  innkeeper_thornbury: {
    start: {
      lines: ["The Blackthorn. Range is through the back, rooms are up the stair, and the floor's just been done."],
      options: [
        { text: "Anything worth knowing?", to: "news" },
        { text: "Can I cook here?", to: "range" },
        { text: "Just passing.", act: "close" },
      ],
    },
    news: {
      lines: [
        "The castellan's short of guards and long on rules. The goldsmith pays for silver and there's silver under the city.",
        "And the road north's shut past the ditch, whatever the signpost says.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
    range: {
      lines: ["Help yourself. Burn it and you eat it anyway."],
      options: [{ text: "Right.", act: "close" }],
    },
  },

  smith_thornbury: {
    start: {
      lines: ["Two furnaces, two anvils, and a queue on market day. Get in while it's quiet."],
      options: [
        { text: "Where do I get ore?", to: "ore" },
        { text: "Thanks.", act: "close" },
      ],
    },
    ore: {
      lines: [
        "Copper, tin and iron at the quarry down by Oakridge. Coal too, if you go deep enough in.",
        "Silver's under this city. Nobody who's fetched it has said much about how.",
      ],
      options: [{ text: "I'll find out.", act: "close" }],
    },
  },

  market_trader: {
    start: {
      lines: ["Fresh this morning, most of it. Cooked, some of it. Cheap, all of it."],
      options: [
        { text: "Let's see.", act: "shop" },
        { text: "Do you buy?", to: "buy" },
        { text: "Not today.", act: "close" },
      ],
    },
    buy: {
      lines: ["Hides, pelts, feathers, logs, and anything that walked in on four legs and didn't walk out. Bring it to the stall."],
      options: [
        { text: "Let's see what you have.", act: "shop" },
        { text: "I'll remember.", act: "close" },
      ],
    },
  },

  castellan: {
    start: {
      lines: ["You've come a long way up a short road to stand in my hall. Say what you came to say."],
      options: [
        { text: "Who rules here?", to: "lord" },
        { text: "Why is the Emberway Gate shut?", to: "gate" },
        { text: "Nothing, my lord.", act: "close" },
      ],
    },
    lord: {
      lines: [
        "The lord of Thornbury, who is with the king, who is somewhere else. I hold the castle. It is enough.",
        "If you want work, the guard is short. If you want trouble, the Harrow is north and I won't stop you.",
      ],
      options: [{ text: "Understood.", act: "close" }],
    },
    gate: {
      lines: [
        "Because I ordered it shut, and I had reasons, and they are not yours.",
        "It takes a toll now. Ten coins keeps the idle on this side of it and pays the men who stand there, and Kilnhold gets its trade.",
      ],
      options: [{ text: "As you say.", act: "close" }],
    },
  },

  townsfolk: {
    start: {
      lines: ["Thornbury. Biggest place for a week's walk in any direction, and it knows it."],
      options: [
        { text: "What's the castle for?", to: "castle" },
        { text: "Good to know.", act: "close" },
      ],
    },
    castle: {
      lines: ["Keeping the lord's things while the lord's away. And keeping us out of them."],
      options: [{ text: "Ha.", act: "close" }],
    },
  },

  // --- Kilnhold (Wave 2) -------------------------------------------------------------------------

  smith_kilnhold: {
    start: {
      lines: ["Mind the sparks. These two run hotter than anything west of the gate, and they don't care what they burn."],
      options: [
        { text: "What can you smelt here that Oakridge can't?", to: "heat" },
        { text: "Where does the coal come from?", to: "coal" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    heat: {
      lines: [
        "Coldiron and emberite. Either one wants a fire that'd crack a village furnace in half.",
        "Bring the ore and the coal — plenty of coal — and use mine. Starfall's beyond even these; Deepdelve's the only place for that.",
      ],
      options: [{ text: "Good to know.", act: "close" }],
    },
    coal: {
      lines: [
        "The quarry by Oakridge, mostly, and the kilns outside the wall keep me in charcoal for the rest.",
        "Emberite's nearer than you'd think. Down by the shore, past the scorpions. The scorpions are the price.",
      ],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  bladesmith: {
    start: {
      lines: ["Hask's Edge. My brother makes them, I sell them, and nobody's brought one back yet."],
      options: [
        { text: "Let's see them.", act: "shop" },
        { text: "What's the best you have?", to: "best" },
        { text: "Not today.", act: "close" },
      ],
    },
    best: {
      lines: [
        "The steel sword. You'll not find one on a shelf anywhere else in the kingdom, and the price says so.",
        "Anything less, Thornbury sells. Anything more, you'll be making yourself.",
      ],
      options: [
        { text: "Show me.", act: "shop" },
        { text: "Maybe later.", act: "close" },
      ],
    },
  },

  innkeeper_kilnhold: {
    start: {
      lines: ["The Kiln Door. Sit anywhere; it's all the same distance from the fire."],
      options: [
        { text: "Quiet in here.", to: "quiet" },
        { text: "Just passing through.", act: "close" },
      ],
    },
    quiet: {
      lines: [
        "It was quieter when the gate was shut. Now there's the toll, and the road, and whoever the road brings.",
        "Most of them come for a blade. A few come for the ore. The scorpions get the ones who don't listen.",
      ],
      options: [{ text: "I'll listen.", act: "close" }],
    },
  },

  kilnman: {
    start: {
      lines: ["Don't lean on that one. Three days a burn, and it's on day two."],
      options: [
        { text: "What are you making?", to: "charcoal" },
        { text: "I'll stand clear.", act: "close" },
      ],
    },
    charcoal: {
      lines: [
        "Charcoal. Logs go in, the earth goes over, and it smoulders till it's black right through.",
        "The furnaces eat it faster than four kilns can make it. Bring me logs and I'd not say no.",
      ],
      options: [{ text: "I'll remember.", act: "close" }],
    },
  },

  hold_warden: {
    start: {
      lines: ["Hold's open. Keep your blade in your belt and your hands where I can see them."],
      options: [
        { text: "What's out on the road?", to: "road" },
        { text: "Understood.", act: "close" },
      ],
    },
    road: {
      lines: [
        "Scorpions off it, and a pair of thieves on it, at the old waystation. Keep to the middle and keep walking.",
        "Past the hold it's the Sand Road, and nothing on it till Sandreach. Nothing built, anyhow.",
      ],
      options: [{ text: "Thanks for the warning.", act: "close" }],
    },
  },

  kilnhold_folk: {
    start: {
      lines: ["Kilnhold. Hot, dusty, and the best steel for a week's walk. You get used to two of the three."],
      options: [
        { text: "Why build a town out here?", to: "why" },
        { text: "Fair enough.", act: "close" },
      ],
    },
    why: {
      lines: ["The ore's here and the heat's free. The smiths came for the one, and stayed because of the other."],
      options: [{ text: "Makes sense.", act: "close" }],
    },
  },

  // --- Tarhollow, on Sablewood Isle (Wave 2) --------------------------------------------------------

  innkeeper_tarhollow: {
    start: {
      lines: ["The Black Pine. Sit by the fire; there's nowhere else on the isle to sit that isn't wet."],
      options: [
        { text: "What's the mountain?", to: "mountain" },
        { text: "Just warming up.", act: "close" },
      ],
    },
    mountain: {
      lines: [
        "Sear. It smokes, it rumbles, and every few years it throws a rock at us. The mouth in its south side goes down three levels that anyone's counted.",
        "The red ore's down there, and the things that live on the heat. Folk come for the one and meet the other.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
  },

  storekeeper_tarhollow: {
    start: {
      lines: ["Tarr's. Harpoons, bait, an axe or two, and bread that was fresh when the ferry brought it."],
      options: [
        { text: "Let's see.", act: "shop" },
        { text: "Do you buy?", to: "buy" },
        { text: "Not today.", act: "close" },
      ],
    },
    buy: {
      lines: ["Fish, logs and ore, if they're the isle's own. Blackfish, ironbark, sablewood, the red ore. Nothing else is worth the ferry."],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "Later.", act: "close" },
      ],
    },
  },

  woodcutter_isle: {
    start: {
      lines: ["Hob. I cut the ironbark, when the axe holds, which is less often than you'd think."],
      options: [
        { text: "What's special about it?", to: "ironbark" },
        { text: "Mind your fingers.", act: "close" },
      ],
    },
    ironbark: {
      lines: [
        "It rings when you hit it, and it blunts a steel edge in a morning. Sixty-odd in the skill before it'll fall for you at all.",
        "The sablewood's worse. That's on the mountain, and the mountain's worse again.",
      ],
      options: [{ text: "I'll work up to it.", act: "close" }],
    },
  },

  islanders: {
    start: {
      lines: ["Sablewood. You're either off the ferry or you've been here too long. Which?"],
      options: [
        { text: "Off the ferry.", to: "new" },
        { text: "Too long.", act: "close" },
      ],
    },
    new: {
      lines: ["Then keep to the path, keep off the mountain, and keep your coins for the fare home. That's three things more than most manage."],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  // --- Deepdelve and Hollow Pass (Wave 3) -------------------------------------------------------------

  pass_keeper: {
    start: {
      lines: ["Hollow Pass. The Delve Road's north, up to the town. The gate's west, and it's barred, and it stays barred."],
      options: [
        { text: "What's past the gate?", to: "caldmoor" },
        { text: "Why is it barred?", to: "why" },
        { text: "North it is.", act: "close" },
      ],
    },
    caldmoor: {
      lines: [
        "Caldmoor. Another country, with its own king, its own coin and its own opinion of us.",
        "Fallowmede's the first place you'd meet, a long day down the far side. Nobody's making that walk from here yet.",
      ],
      options: [{ text: "One day, then.", act: "close" }],
    },
    why: {
      lines: ["Because the road on the far side isn't held, and what comes up it in the dark isn't ours. When Thornbury sends men to hold it, I'll lift the bar. Not before."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  smith_deepdelve: {
    start: {
      lines: ["Cadwal. These two furnaces run white, and there's nothing in the ground they won't take."],
      options: [
        { text: "Nothing at all?", to: "white" },
        { text: "Where's the ore?", to: "ore" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    white: {
      lines: [
        "Bronze to starfall. Kilnhold's run hot; mine run hotter, and starfall wants that or it just sits in the coals and sulks.",
        "The starfall itself is under the Broken Tower in the Harrow, and that's a walk I don't recommend to anyone I like.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
    ore: {
      lines: [
        "Under your feet. The mouth's in the cliff by the square: coal and silver on the first level, coldiron on the second, gold at the bottom.",
        "Each level's worse company than the last. The gold's got something keeping it that used to be a man.",
      ],
      options: [{ text: "I'll go carefully.", act: "close" }],
    },
  },

  toolseller: {
    start: {
      lines: ["Delve Tools. A pick for every rock in the hill, and coal for the furnace when you've brought the ore up."],
      options: [
        { text: "Let's see.", act: "shop" },
        { text: "Do you buy?", to: "buy" },
        { text: "Not today.", act: "close" },
      ],
    },
    buy: {
      lines: ["Ore and bars. Whatever the mine gives and whatever Cadwal makes of it. Nothing else earns its place on the shelf."],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "Later.", act: "close" },
      ],
    },
  },

  innkeeper_deepdelve: {
    start: {
      lines: ["The Pick and Lantern. Under a cliff the sun leaves early, so the fire's lit early. Sit."],
      options: [
        { text: "What's the town for?", to: "town" },
        { text: "Just the fire.", act: "close" },
      ],
    },
    town: {
      lines: [
        "The mine. Everything here goes down the hole or comes up out of it. The smiths came for the coldiron, the bank came for the smiths, and I came for the bank.",
        "The pass keeps Caldmoor out, and the cliff keeps the weather off. It's a good town, if you like the dark.",
      ],
      options: [{ text: "I might.", act: "close" }],
    },
  },

  foreman: {
    start: {
      lines: ["Idris. Foreman. If you're going down, you're going down on your own count, not mine."],
      options: [
        { text: "What's down there?", to: "down" },
        { text: "Understood.", act: "close" },
      ],
    },
    down: {
      lines: [
        "Three levels. The first's rats and bats and a brute that thinks the coal's his. The second's what's left of the crew that didn't listen to me.",
        "The third's the gold, and I don't send anyone to the third any more.",
      ],
      options: [{ text: "I'll listen.", act: "close" }],
    },
  },

  miners: {
    start: {
      lines: ["Twelve hours on the coal face and you'd want a word with someone too. What?"],
      options: [
        { text: "Any advice for the mine?", to: "advice" },
        { text: "Nothing. Carry on.", act: "close" },
      ],
    },
    advice: {
      lines: ["Take a pick that's better than the rock. Iron for the coal, steel for the coldiron, and for the gold take a friend."],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  delvers: {
    start: {
      lines: ["Deepdelve. You can tell the newcomers: they keep looking up at the cliff like it's about to come down on them. It hasn't yet."],
      options: [
        { text: "How long has the town been here?", to: "long" },
        { text: "Good to know.", act: "close" },
      ],
    },
    long: {
      lines: ["Since the coldiron. Before that it was a camp, and before that it was a hole in a hill that a dog found."],
      options: [{ text: "Ha.", act: "close" }],
    },
  },
};

/** The node a conversation starts at. */
export const DIALOGUE_START = "start";
