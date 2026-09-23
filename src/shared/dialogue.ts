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
};

/** The node a conversation starts at. */
export const DIALOGUE_START = "start";
