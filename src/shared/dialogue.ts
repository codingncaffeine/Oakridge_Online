// What the people of Oakridge say. Phase 9 brings conditions, quest stages and chat heads; this is the
// plain version Phase 7 needs so a banker can open the bank and a keeper can explain a shut gate.
// Every line is this game's own wording (PLAN §5's standing rule).

/** What choosing an option does besides moving the conversation on. */
export type DialogueAct = "bank" | "shop" | "close";

export interface DialogueOption {
  /** What the player says. */
  text: string;
  /** Where the conversation goes next; leaving it out ends the talk. */
  to?: string;
  /** Something that happens when this option is taken. */
  act?: DialogueAct;
}

export interface DialogueNode {
  /** What the NPC says, one line per box. */
  lines: string[];
  /** What the player may say back. An empty list ends the talk on a click. */
  options?: DialogueOption[];
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
      lines: ["Gate's shut. Has been a while."],
      options: [
        { text: "Can you open it?", to: "no" },
        { text: "What's on the other side?", to: "beyond" },
        { text: "Fair enough.", act: "close" },
      ],
    },
    no: {
      lines: [
        "I could. I won't.",
        "Orders from Thornbury, and they don't explain themselves to me either.",
      ],
      options: [{ text: "Understood.", act: "close" }],
    },
    beyond: {
      lines: [
        "The Emberway, and then the Cinderwaste.",
        "Hot, and getting hotter the further you go. Kilnhold's out there somewhere.",
        "Nothing you want today.",
      ],
      options: [{ text: "Another time, then.", act: "close" }],
    },
  },

  innkeeper: {
    start: {
      lines: ["Welcome to the Split Oak. Mind the step."],
      options: [
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
      options: [
        { text: "Mind if I take a hide?", to: "hides" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    hides: {
      lines: ["Take what falls. The tanner in the village will cure it for a few coins."],
      options: [{ text: "Good of you.", act: "close" }],
    },
  },

  miller: {
    start: {
      lines: ["Flour's not much use to you yet. Come back when there's a baker."],
      options: [{ text: "Right.", act: "close" }],
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
      lines: ["Harbourmaster. Three berths, two boats, and no sailings, before you ask."],
      options: [
        { text: "Where do the boats go?", to: "routes" },
        { text: "What is this place?", to: "port" },
        { text: "I'll leave you to it.", act: "close" },
      ],
    },
    routes: {
      lines: [
        "The Sablewood ferry works the far berth, when it works. Tarhollow is a day out across open water, and the crossing's not fit: Sennen has the hull open on the stocks.",
        "The long run east to Serai is a rumour with a berth kept for it. Ask Tregear if you want the ferry. He'll tell you the same, at more length.",
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
      lines: ["Mind the shavings. If it's the ferry you're after, she's on the stocks, and she stays there till the planking's done."],
      options: [
        { text: "What are you building?", to: "hull" },
        { text: "Do you sell anything?", to: "sell" },
        { text: "I'll not keep you.", act: "close" },
      ],
    },
    hull: {
      lines: [
        "Rebuilding. She came back from Sablewood with a strake sprung and a crew who'd sooner have walked. New planks, new pitch, then she sails.",
        "Ask me another day.",
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
      lines: ["Tregear. The ferry's mine, and she's on the stocks, so I'm a man with a berth and no boat in it."],
      options: [
        { text: "When does she sail?", to: "when" },
        { text: "Where to?", to: "where" },
        { text: "Good luck with it.", act: "close" },
      ],
    },
    when: {
      lines: [
        "When Sennen says. She says when the planking's done. The planking's done when the timber comes, and the timber's in a wood past the Greycaps that nobody's cut yet.",
        "So: not today.",
      ],
      options: [{ text: "Not today, then.", act: "close" }],
    },
    where: {
      lines: [
        "Sablewood. Tarhollow, on the isle: black pine, a mountain that smokes, and folk who don't come back to the mainland much.",
        "There's a berth kept for the Serai run too. That's a longer story, and a longer boat.",
      ],
      options: [{ text: "I'll wait for the short one.", act: "close" }],
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
        "You can carry them. Shooting them is another matter, and nobody's taught it round here yet.",
        "Buy now, learn later. The price won't be going down.",
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
      lines: ["Staves. Or there will be. The wood's cut and the runes aren't."],
      options: [
        { text: "When?", to: "when" },
        { text: "I'll come back.", act: "close" },
      ],
    },
    when: {
      lines: ["When somebody in this city can make the things do more than lean in a corner. I'm told that's coming."],
      options: [{ text: "So am I.", act: "close" }],
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
        "Kilnhold can wait. So can whatever's crossing the Cinderwaste to get here.",
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
};

/** The node a conversation starts at. */
export const DIALOGUE_START = "start";
