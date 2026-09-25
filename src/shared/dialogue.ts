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
      branch: [{ when: [{ has: "logs", count: 5 }, { has: "sardine", count: 2 }], to: "table_ready" }],
      options: [
        { text: "I'll see to it.", to: "table_go", do: [{ quest: "split_oak_table", stage: 1 }] },
        { text: "Where would I find sardines?", to: "table_where" },
        { text: "Not today.", to: "table_no" },
      ],
    },
    table_ready: {
      lines: ["Needs? Five logs and two sardines, cooked, and you're stood in my doorway holding exactly that. Were you listening at the window?"],
      options: [
        {
          text: "Just lucky. Here.",
          to: "table_thanks",
          do: [
            { quest: "split_oak_table", stage: 1 }, { take: "logs", count: 5 }, { take: "sardine", count: 2 }, { quest: "split_oak_table", stage: 2 },
            { xp: "cooking", tenths: 3000 }, { give: "coins", count: 60 },
          ],
        },
        { text: "Those are spoken for, sorry.", to: "table_no" },
      ],
    },
    table_where: {
      lines: ["Off the jetty, south of the green. You'll want a net; Odric sells them at the tools shop, across the green. Cook them on the range through there before you bring them, mind."],
      branch: [{ when: [{ has: "fishing_net" }], to: "table_where_net" }],
      options: [
        { text: "I'll see to it.", to: "table_go", do: [{ quest: "split_oak_table", stage: 1 }] },
        { text: "Maybe later.", to: "table_no" },
      ],
    },
    table_where_net: {
      lines: ["Off the jetty, south of the green. You've a net on you already, so that's half of it. Cook them on the range through there before you bring them, mind."],
      options: [
        { text: "I'll see to it.", to: "table_go", do: [{ quest: "split_oak_table", stage: 1 }] },
        { text: "Maybe later.", to: "table_no" },
      ],
    },
    table_no: {
      lines: ["Then the fish get a quiet day. Mind the step on your way out."],
      options: [{ text: "I will.", act: "close" }],
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
        { text: "Are you sure it's goblins?", to: "mischief_sure" },
        { text: "I'd rather not.", to: "mischief_no" },
      ],
    },
    mischief_sure: {
      lines: ["Foxes don't leave boot prints, and they don't take the hen house door off its hinges on the way out. Goblins."],
      options: [
        { text: "Then I'll deal with them.", to: "mischief_go", do: [{ quest: "mudfoot_mischief", stage: 1 }] },
        { text: "I'd still rather not.", to: "mischief_no" },
      ],
    },
    mischief_no: {
      lines: ["Then it's me and a pitchfork up all night again. Don't let the gate swing."],
      options: [{ text: "Good luck.", act: "close" }],
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
      branch: [{ when: [{ has: "bronze_bar", count: 2 }], to: "band_ready" }],
      options: [
        { text: "I'll bring the bars.", to: "band_go", do: [{ quest: "millers_band", stage: 1 }] },
        { text: "Why not dig for it yourself?", to: "band_why" },
        { text: "That's not my trade.", to: "band_no" },
      ],
    },
    band_ready: {
      lines: ["Turning? It's stopped: the band round the stone's cracked through, and Garrow wants two bronze bars to cast another. And there are two in your pack. Are you a smith or a thief?"],
      options: [
        {
          text: "A smith, today. Take them.",
          to: "band_thanks",
          do: [{ quest: "millers_band", stage: 1 }, { take: "bronze_bar", count: 2 }, { quest: "millers_band", stage: 2 }, { xp: "smithing", tenths: 2500 }, { give: "coins", count: 90 }],
        },
        { text: "They're spoken for, sorry.", to: "band_no" },
      ],
    },
    band_why: {
      lines: ["Because the flour doesn't mill itself while I'm down a hole in the quarry, and I'd be no better at digging than the flour would."],
      options: [
        { text: "Fair. I'll bring the bars.", to: "band_go", do: [{ quest: "millers_band", stage: 1 }] },
        { text: "Still not my trade.", to: "band_no" },
      ],
    },
    band_no: {
      lines: ["No, it's mine, and I'm stuck with it. Mind the sacks on your way out."],
      options: [{ text: "Sorry.", act: "close" }],
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
      // The Silence at Mourn (quests.ts): his leave to cross the Rill, for four rill lurkers, and another if it is lost.
      branch: [
        { when: [{ quest: "silence_at_mourn", stage: 2 }, { tally: "rill_lurker", count: 4 }], to: "lurkers_done" },
        { when: [{ quest: "silence_at_mourn", stage: 2 }], to: "lurkers_wait" },
        { when: [{ quest: "silence_at_mourn", stage: 3 }, { has: "sealed_leave" }], to: "leave_have" },
        { when: [{ quest: "silence_at_mourn", stage: 3 }], to: "leave_again" },
      ],
      options: [
        { text: "The Rill warden sent me. I need your leave to cross into the fen.", to: "leave_ask", when: [{ quest: "silence_at_mourn", stage: 1 }] },
        { text: "Who rules here?", to: "lord" },
        { text: "Why is the Emberway Gate shut?", to: "gate" },
        { text: "Why is the Rill bridge barred?", to: "rill", when: [{ quest: "silence_at_mourn", stage: 0 }] },
        { text: "Nothing, my lord.", act: "close" },
      ],
    },
    rill: {
      lines: [
        "Because Mourn stopped sending its tithe, its carts and its excuses, all in the same month, and I do not send men into a fen after a village that has stopped answering.",
        "The warden at the Rill turns everyone back. If you want to be the exception, take it up with him first; he knows what I want.",
      ],
      options: [{ text: "I'll ask him.", act: "close" }],
    },
    leave_ask: {
      lines: [
        "Does he. The Sallowfen is barred because I barred it, and my seal does not go to whoever asks for it.",
        "The rill lurkers have been crawling up onto the Fen Road and taking carters. Kill four of them, and I will believe you can look after yourself out there.",
      ],
      options: [
        { text: "Four lurkers. Consider it done.", to: "lurkers_go", do: [{ quest: "silence_at_mourn", stage: 2 }] },
        { text: "Isn't the road your guard's job?", to: "guard_job" },
      ],
    },
    guard_job: {
      lines: ["My guard's job is the walls. Yours, it seems, is wanting something from me. Four lurkers."],
      options: [
        { text: "Four lurkers, then.", to: "lurkers_go", do: [{ quest: "silence_at_mourn", stage: 2 }] },
        { text: "I'll think about it.", act: "close" },
      ],
    },
    lurkers_go: {
      lines: ["Out of the east gate and along the Fen Road. They come up out of the Rill onto the road's last stretch, west of the bridge. Take a blade, and don't follow them into the water."],
      options: [{ text: "Right.", act: "close" }],
    },
    lurkers_wait: {
      lines: ["Four lurkers. I keep a list of people who told me they would do a thing and didn't. You are on it, in pencil."],
      options: [{ text: "I'm on it.", act: "close" }],
    },
    lurkers_done: {
      lines: [
        "Four, I'm told, and the carters have stopped complaining, which is how I know it is true.",
        "My leave to cross the Rill, under my seal. The warden will know it. Do not lose it; I do not enjoy writing them.",
      ],
      options: [{ text: "Thank you, Castellan.", act: "close", do: [{ quest: "silence_at_mourn", stage: 3 }, { give: "sealed_leave" }] }],
    },
    leave_have: {
      lines: ["You have my leave. The warden is at the Rill, not in my hall."],
      options: [{ text: "Going.", act: "close" }],
    },
    leave_again: {
      lines: ["You have lost it. Four pages and my seal, and you have lost it.", "Here. Another. I am making a note of this."],
      options: [{ text: "Thank you, Castellan.", act: "close", do: [{ give: "sealed_leave" }] }],
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

  // --- The Harrow Gate (Wave 3) -----------------------------------------------------------------------

  ditch_warden: {
    start: {
      lines: ["The Harrow Gate. Past the ditch there's no bank, no law, and nobody coming for you. Still going?"],
      options: [
        { text: "What's out there?", to: "harrow" },
        { text: "Why the ditch?", to: "ditch" },
        { text: "I'll take my chances.", act: "close" },
      ],
    },
    harrow: {
      lines: [
        "Better ground than anything this side. Blackthorn just past the wall, and heartoak deep in, if you believe the ones who came back to say so.",
        "The Broken Tower's off to the north-east. There's a hole under it that the tower was built to keep shut, and the tower's not keeping anything now.",
      ],
      options: [{ text: "Noted.", act: "close" }],
    },
    ditch: {
      lines: ["The old kings dug it to keep the north out. The north stopped listening a long time ago. These days it mostly tells you where the safe part ends."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  // --- Sandreach and the Dunes (Wave 4) ---------------------------------------------------------------

  caravan_master: {
    start: {
      lines: ["The Caravan Post. Whatever you've got, some caravan will carry it east, so I'll buy it off you. And I sell what the road wants."],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "What's east?", to: "east" },
        { text: "Not today.", act: "close" },
      ],
    },
    east: {
      lines: [
        "More sand, then the sea, then Serai, if the caravan masters are telling the truth. None of it's for walking to from here.",
        "What comes back this way is gold out of the Dunes, and glass the storms make of the sand. Mostly gold.",
      ],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "Later.", act: "close" },
      ],
    },
  },

  innkeeper_sandreach: {
    start: {
      lines: ["The Last Well. Last before the Dunes, anyway. There's water out there, but you have to know where, and the sand keeps moving it."],
      options: [
        { text: "What's in the Dunes?", to: "dunes" },
        { text: "Just passing through.", act: "close" },
      ],
    },
    dunes: {
      lines: ["Gold, for whoever can carry it home. Tombs, for whoever can open them, and nobody can. And raiders who reckon the gold's theirs."],
      options: [{ text: "Noted.", act: "close" }],
    },
  },

  tomb_warden: {
    start: {
      lines: ["Those tombs were sealed before Sandreach was a well with a name. I keep them sealed."],
      options: [
        { text: "What's inside them?", to: "inside" },
        { text: "Who sealed them?", to: "who" },
        { text: "I'll leave them be.", act: "close" },
      ],
    },
    inside: {
      lines: ["Kings, the stories say, and what they were buried with, and whatever was buried with them to keep it. Leave the slabs alone."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
    who: {
      lines: ["People who knew what they were doing. The slabs haven't shifted in all the years I've watched them, and not for want of people trying."],
      options: [{ text: "Right.", act: "close" }],
    },
  },

  sandreachers: {
    start: {
      lines: ["Sandreach. The road ends here, the water's here, and that's the whole reason there's a town."],
      options: [
        { text: "Busy place?", to: "busy" },
        { text: "Good to know.", act: "close" },
      ],
    },
    busy: {
      lines: ["When a caravan's in. Otherwise it's us, the well, and the scorpions deciding whether today's the day."],
      options: [{ text: "Ha.", act: "close" }],
    },
  },

  caravaneers: {
    start: {
      lines: ["Mind the loads. Every crate in this yard has been further than you have, and it's going further yet."],
      options: [
        { text: "Where are you headed?", to: "where" },
        { text: "Sorry.", act: "close" },
      ],
    },
    where: {
      lines: ["East, when the master says so. Nobody asks the master when."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  // --- The Rill crossing and Mourn (Wave 4): The Silence at Mourn -------------------------------------

  rill_warden: {
    start: {
      lines: ["The Rill bridge. It's barred, by order of the castle, and I'm the order."],
      branch: [
        { when: [{ quest: "silence_at_mourn", stage: 8 }], to: "after" },
        { when: [{ quest: "silence_at_mourn", stage: 7 }], to: "mourn_quiet" },
        { when: [{ quest: "silence_at_mourn", atLeast: 5 }], to: "passing" },
        { when: [{ quest: "silence_at_mourn", stage: 4 }], to: "see_pell" },
        { when: [{ quest: "silence_at_mourn", stage: 3 }, { has: "sealed_leave" }], to: "leave_shown" },
        { when: [{ quest: "silence_at_mourn", stage: 3 }], to: "leave_lost" },
        { when: [{ quest: "silence_at_mourn", stage: 2 }], to: "waiting_job" },
        { when: [{ quest: "silence_at_mourn", stage: 1 }], to: "waiting" },
      ],
      options: [
        { text: "Why is it barred?", to: "why" },
        { text: "What's over there?", to: "fen" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    why: {
      lines: [
        "Mourn's gone quiet. No carts over the causeway since the spring, no word, and no smoke from the chimneys some nights.",
        "The castle doesn't like what it can't see, so nobody crosses without the castellan's leave: his seal, on paper. Not my say-so, and certainly not yours.",
      ],
      options: [
        { text: "Then I'll get his leave.", to: "leave_ask", do: [{ quest: "silence_at_mourn", stage: 1 }] },
        { text: "What happened at Mourn?", to: "happened" },
        { text: "Paper. Of course.", to: "paper" },
      ],
    },
    happened: {
      lines: [
        "If I knew, I'd have told the castle, and the castle would have told me to bar the bridge anyway.",
        "Fen folk keep to themselves. Lately they keep to themselves harder.",
      ],
      options: [
        { text: "I'll get the castellan's leave and find out.", to: "leave_ask", do: [{ quest: "silence_at_mourn", stage: 1 }] },
        { text: "Not my business.", act: "close" },
      ],
    },
    paper: {
      lines: ["Of course. Thornbury runs on paper, and on fear of the lord coming home to read it."],
      options: [
        { text: "Fine. Where do I find the castellan?", to: "leave_ask", do: [{ quest: "silence_at_mourn", stage: 1 }] },
        { text: "Some other time.", act: "close" },
      ],
    },
    leave_ask: {
      lines: ["Castellan Vane, in Thornbury keep, at the top of the King's Way. Say the Rill warden sent you, and don't let him keep you standing more than a day."],
      options: [{ text: "Right.", act: "close" }],
    },
    fen: {
      lines: ["The Sallowfen. Water, reeds, dead wood, and a causeway through it to Mourn on its mound. Nothing else stands out there, and I'd like it to stay that way."],
      options: [
        { text: "Why is the bridge barred?", to: "why", when: [{ quest: "silence_at_mourn", stage: 0 }] },
        { text: "Right.", act: "close" },
      ],
    },
    waiting: {
      lines: ["No seal, no crossing. The castellan's in Thornbury keep, and he's in no hurry. Neither is the Rill."],
      options: [{ text: "I'm working on it.", act: "close" }],
    },
    waiting_job: {
      lines: ["Sent you after the lurkers first, did he? He does that. Says it's to see what a person's made of. It's to get the lurkers killed."],
      options: [
        { text: "Where do I find them?", to: "lurkers" },
        { text: "I'll see to them.", act: "close" },
      ],
    },
    lurkers: {
      lines: ["They come up out of the Rill onto this bank, mostly south of the road, and a few crawl a good way up it toward Thornbury. Keep out of the water and they're no worse than a wolf with a grudge."],
      options: [{ text: "I'll see to them.", act: "close" }],
    },
    leave_shown: {
      lines: ["That's his seal, and his hand. Four pages to say one thing. Give it here."],
      options: [{ text: "Here. Lift the bar.", to: "turn", do: [{ take: "sealed_leave" }, { quest: "silence_at_mourn", stage: 4 }] }],
    },
    turn: {
      lines: [
        "I'll lift it. But before you go over there's someone you ought to hear, and I'd sooner you heard him from me than found him yourself.",
        "The castle's orders say anyone out of the fen goes to Thornbury in irons. One came out a month back, half drowned and wholly terrified. I didn't send him. I put him in my guardhouse.",
        "His name's Pell. He lit the lamps at Mourn. Hear him out, and then you'll know what you're walking into.",
      ],
      options: [
        { text: "You've been hiding him from the castle?", to: "hiding" },
        { text: "I'll talk to him.", act: "close" },
      ],
    },
    hiding: {
      lines: ["I've been keeping him from being hanged for running from something nobody at the castle has seen. If that's hiding, I've been hiding him. The guardhouse, behind me."],
      options: [
        { text: "Your secret's safe with me.", act: "close" },
        { text: "I'll talk to him.", act: "close" },
      ],
    },
    leave_lost: {
      lines: ["The castellan's leave? I don't see it. If you've lost it he'll have to write you another, and he'll enjoy telling you so."],
      options: [{ text: "I'll go and ask him.", act: "close" }],
    },
    see_pell: {
      lines: ["Talk to Pell first. The guardhouse, behind me. He'll tell you what's over there better than I can."],
      options: [{ text: "Right.", act: "close" }],
    },
    passing: {
      lines: ["Go up to the gate and I'll lift the bar for you. Only you, mind: the castle's orders stand for everyone else."],
      options: [
        { text: "What will I find in Mourn?", to: "mourn_what" },
        { text: "Right.", act: "close" },
      ],
    },
    mourn_what: {
      lines: ["The reeve, if he's still there. Hollis. His house is by the causeway as it comes in. He'll be the one looking like he's got something to say and won't say it."],
      options: [{ text: "Right.", act: "close" }],
    },
    mourn_quiet: {
      lines: ["You're back, and in one piece. What's in Mourn?"],
      options: [
        {
          text: "The dead, rising to a bell the village sank itself. Three of them won't rise again.",
          to: "done",
          do: [
            { quest: "silence_at_mourn", stage: 8 }, { xp: "attack", tenths: 30000 }, { xp: "strength", tenths: 30000 }, { xp: "prayer", tenths: 10000 },
            { give: "coins", count: 500 },
          ],
        },
      ],
    },
    done: {
      lines: [
        "They sank their own bell. And I've spent all spring barring a bridge against it.",
        "Pell can go home, then. I'll tell the castle Mourn is quiet, which is true, and leave out the rest, which it wouldn't believe. Take this: it's what the castle pays me for bad news, and yours was worse.",
      ],
      options: [{ text: "Look after Pell.", act: "close" }],
    },
    after: {
      lines: ["The bar's still down, for the castle's sake. Not for yours. Go up to the gate whenever you like."],
      options: [{ text: "Thanks.", act: "close" }],
    },
  },

  lamp_man: {
    start: {
      lines: ["There's nobody in here. I mean, I'm the warden's cousin. Visiting."],
      branch: [
        { when: [{ quest: "silence_at_mourn", stage: 4 }], to: "story" },
        { when: [{ quest: "silence_at_mourn", stage: 8 }], to: "home" },
        { when: [{ quest: "silence_at_mourn", atLeast: 5 }], to: "waiting" },
      ],
      options: [
        { text: "A cousin, visiting a guardhouse?", to: "cousin" },
        { text: "Sorry to bother you.", act: "close" },
      ],
    },
    cousin: {
      lines: ["It's a very comfortable guardhouse. Please go away."],
      options: [{ text: "Suit yourself.", act: "close" }],
    },
    story: {
      lines: [
        "He told you, then. Good. I'm tired of being his cousin.",
        "I lit Mourn's lamps. Every dusk: the chapel's first, then the square's, then along the houses.",
        "The chapel bell cracked in the spring, they said, and the reeve had it taken down. Then one night I was lighting the square, and I heard it. The bell. Ringing out in the fen, under the water.",
        "Every lamp I'd lit went out at once, and out on the pools things stood up. I didn't wait to see what. I ran till I hit the Rill.",
      ],
      options: [
        { text: "A bell can't ring under water.", to: "cant" },
        { text: "I'll find out what's happening in Mourn.", to: "go", do: [{ quest: "silence_at_mourn", stage: 5 }] },
      ],
    },
    cant: {
      lines: ["No. It can't. I heard it anyway, and so would you have."],
      options: [{ text: "Then I'll go and see for myself.", to: "go", do: [{ quest: "silence_at_mourn", stage: 5 }] }],
    },
    go: {
      lines: ["Ask the reeve, Hollis. He had the bell taken down, so if anyone knows why it's ringing, it's him. And tell Aske I said to lift the bar for you."],
      options: [{ text: "I will.", act: "close" }],
    },
    waiting: {
      lines: ["Is it still ringing? No, don't tell me. Tell me when it's stopped."],
      options: [{ text: "Soon.", act: "close" }],
    },
    home: {
      lines: ["The warden says I can go home. I'll wait till it's light, if it's all the same to you."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
  },

  mourn_reeve: {
    start: {
      lines: ["Mourn's closed. To visitors, to carts, and to questions. The causeway's back the way you came."],
      branch: [
        { when: [{ quest: "silence_at_mourn", stage: 5 }], to: "pell_sent" },
        { when: [{ quest: "silence_at_mourn", stage: 6 }, { tally: "fen_wight", count: 3 }], to: "laid" },
        { when: [{ quest: "silence_at_mourn", stage: 6 }], to: "wights_wait" },
        { when: [{ quest: "silence_at_mourn", stage: 7 }], to: "tell_warden" },
        { when: [{ quest: "silence_at_mourn", stage: 8 }], to: "after" },
      ],
      options: [
        { text: "Who closed it?", to: "closed" },
        { text: "I'll go.", act: "close" },
      ],
    },
    closed: {
      lines: ["I did. I'm the reeve. It's what reeves are for."],
      options: [{ text: "Fair enough.", act: "close" }],
    },
    pell_sent: {
      lines: ["The warden let you over? Then the castle knows something, or thinks it does. What do you want?"],
      options: [
        { text: "Pell sent me. He heard your bell ringing under the fen.", to: "confess" },
        { text: "Just looking round.", to: "looking" },
      ],
    },
    looking: {
      lines: ["There's nothing to look at. That's rather the point of Mourn, lately."],
      options: [
        { text: "Pell says otherwise. He heard your bell ringing under the fen.", to: "confess" },
        { text: "Then I'll be going.", act: "close" },
      ],
    },
    confess: {
      lines: [
        "Pell. Of course it's Pell.",
        "The bell never cracked. Three of us took it down, rowed it out to the deep pools, and let it go. Every time it rang for a burial, the dead came up out of the fen to hear it.",
        "Mourn stands on an older Mourn, one the fen swallowed. Its people never stopped listening for that bell.",
        "Now it rings down there on its own, and they walk. I'll not send anyone of Mourn out there. I'm asking you: lay three of them back down.",
      ],
      options: [
        { text: "I'll lay them to rest.", to: "wights_go", do: [{ quest: "silence_at_mourn", stage: 6 }] },
        { text: "You sank your own bell and told nobody?", to: "blame" },
      ],
    },
    blame: {
      lines: ["I told everyone who needed telling, which was nobody. What would you have done, rung it?"],
      options: [
        { text: "Fine. I'll deal with them.", to: "wights_go", do: [{ quest: "silence_at_mourn", stage: 6 }] },
        { text: "I need to think about this.", act: "close" },
      ],
    },
    wights_go: {
      lines: ["They walk the fen either side of the causeway, west of here. You'll know them: they're dressed for church."],
      options: [{ text: "Right.", act: "close" }],
    },
    wights_wait: {
      lines: ["Three of them. I'll know when they're down; the fen goes quiet."],
      options: [{ text: "I'm on it.", act: "close" }],
    },
    laid: {
      lines: [
        "The fen's gone still. That's three down, and they'll be slower to rise again.",
        "Tell the warden Mourn is quiet. And tell him Pell can come home: nobody here blames him for running. I'd have run, if I'd had the sense.",
      ],
      options: [{ text: "I'll tell him.", act: "close", do: [{ quest: "silence_at_mourn", stage: 7 }] }],
    },
    tell_warden: {
      lines: ["Go on. The warden's waiting, and so is Pell."],
      options: [{ text: "Going.", act: "close" }],
    },
    after: {
      lines: ["Mourn's open again. To visitors, anyway. Not to bells."],
      options: [
        { text: "The slab's off the stair behind the bank.", to: "slab" },
        { text: "Understood.", act: "close" },
      ],
    },
    slab: {
      lines: [
        "I know. I went up with a lamp at first light to look at it.",
        "It was shoved from underneath. That stair goes down to the old Mourn, what the fen left of it: the lanes, the chapel, and everyone who was in them.",
        "We let the bell go in the deep pools. If it kept on sinking, it went to the chapel it was cast for. And something down there is ringing it.",
      ],
      options: [
        { text: "Then I'll go down and see to it.", to: "slab_go" },
        { text: "Mourn's troubles are Mourn's.", to: "slab_no" },
      ],
    },
    slab_go: {
      lines: ["Go armed, take a light, and don't come back up with anything that rings."],
      options: [{ text: "I'll travel light.", act: "close" }],
    },
    slab_no: {
      lines: ["They were, until they rang under the fen and came walking up the causeway. Think it over."],
      options: [{ text: "I will.", act: "close" }],
    },
  },

  mourn_storekeeper: {
    start: {
      lines: ["Carrow's. Bread, fire and bait, and I'll take fish off you. Nobody else is buying."],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "Quiet round here.", to: "quiet" },
        { text: "Not today.", act: "close" },
      ],
    },
    quiet: {
      lines: ["Quiet's all we've got. The reeve says it's better than the alternative, and he won't say what that is."],
      options: [
        { text: "Let's trade.", act: "shop" },
        { text: "Right.", act: "close" },
      ],
    },
  },

  mournfolk: {
    start: {
      lines: ["Keep your voice down. Sound carries, out here."],
      branch: [{ when: [{ quest: "silence_at_mourn", atLeast: 7 }], to: "after" }],
      options: [
        { text: "Carries to whom?", to: "whom" },
        { text: "What's under the slab behind the bank?", to: "slab" },
        { text: "Sorry.", act: "close" },
      ],
    },
    whom: {
      lines: ["Ask the reeve. Or better, don't."],
      options: [{ text: "Right.", act: "close" }],
    },
    slab: {
      lines: ["The Hollows. Old Mourn's down there, the one the fen took. Somebody's moved the slab, and nobody up here will own to it."],
      options: [{ text: "I see.", act: "close" }],
    },
    after: {
      lines: ["It's quieter at night now. The right sort of quiet. Was that you?"],
      options: [
        { text: "Maybe.", act: "close" },
        { text: "What's under the slab behind the bank?", to: "slab" },
      ],
    },
  },
};

/** The node a conversation starts at. */
export const DIALOGUE_START = "start";
