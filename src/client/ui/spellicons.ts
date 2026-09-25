import type { Element, Spell, Tier } from "../../shared/spells.ts";

/** Each element's three colours: the bright heart of a spell, its glow, and its shadow. */
export const ELEMENT_COLORS: Record<Element, { core: string; glow: string; dark: string }> = {
  gale: { core: "#ffffff", glow: "#cdd6e2", dark: "#6c7888" },
  tide: { core: "#e2f4ff", glow: "#4a8ae0", dark: "#1a3470" },
  stone: { core: "#f0f4c4", glow: "#8e9e4c", dark: "#48521f" },
  ember: { core: "#fff2a8", glow: "#ff7a2a", dark: "#9a2810" },
};

const cache = new Map<string, string>();

/**
 * A spell's icon, painted in code: its element's colours in the shape of its tier, so the ladder reads at
 * a glance — a Shot is a small ball with a tail, a Lance a spike, a Crash a starburst, a Storm a spiked ball
 * with rings behind it, and a Fury the biggest of all, filling the square.
 */
export function spellIcon(spell: Spell): string {
  const had = cache.get(spell.key);
  if (had) return had;
  const size = 64;
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const g = canvas.getContext("2d")!;
  if (spell.element !== null && spell.tier !== null) paint(g, spell.element, spell.tier);
  else paintOther(g, spell.key);
  const url = canvas.toDataURL();
  cache.set(spell.key, url);
  return url;
}

function paint(g: CanvasRenderingContext2D, element: Element, tier: Tier): void {
  const c = ELEMENT_COLORS[element];
  const orb = (x: number, y: number, r: number) => {
    const fill = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    fill.addColorStop(0, c.core);
    fill.addColorStop(0.55, c.glow);
    fill.addColorStop(1, c.dark);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const tail = (x: number, y: number, r: number, length: number) => {
    const fade = g.createLinearGradient(x, y, x - length, y + length);
    fade.addColorStop(0, c.glow);
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.beginPath();
    g.moveTo(x - r * 0.7, y - r * 0.7);
    g.lineTo(x + r * 0.7, y + r * 0.7);
    g.lineTo(x - length, y + length);
    g.closePath();
    g.fill();
  };
  const burst = (x: number, y: number, points: number, outer: number, inner: number, turn = 0) => {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = turn + (i / (points * 2)) * Math.PI * 2, r = i % 2 === 0 ? outer : inner;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    const fill = g.createRadialGradient(x, y, 0, x, y, outer);
    fill.addColorStop(0, c.core);
    fill.addColorStop(0.45, c.glow);
    fill.addColorStop(1, c.dark);
    g.fillStyle = fill;
    g.fill();
  };
  const rings = (x: number, y: number, count: number, from: number) => {
    g.lineWidth = 3;
    for (let i = 0; i < count; i++) {
      g.strokeStyle = c.glow;
      g.globalAlpha = 0.9 - i * 0.25;
      g.beginPath();
      g.ellipse(x - (from + i * 9) * 0.7, y + (from + i * 9) * 0.7, 5 + i * 2, 11 + i * 3, Math.PI / 4, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  g.lineJoin = "round";
  switch (tier) {
    case "shot":
      tail(38, 26, 11, 26);
      orb(38, 26, 11);
      break;
    case "lance":
      tail(40, 24, 8, 30);
      burst(40, 24, 4, 17, 5, Math.PI / 4);
      orb(40, 24, 5);
      break;
    case "crash":
      burst(33, 31, 8, 26, 10, 0.2);
      orb(33, 31, 8);
      break;
    case "storm":
      rings(36, 28, 2, 12);
      burst(38, 26, 12, 19, 11, 0.1);
      orb(38, 26, 9);
      break;
    case "fury":
      g.globalAlpha = 0.45;
      burst(32, 32, 16, 31, 20, 0);
      g.globalAlpha = 1;
      rings(38, 26, 3, 13);
      burst(38, 26, 12, 22, 12, 0.13);
      orb(38, 26, 10);
      break;
  }
}

/**
 * The spells off the ladder: a curse is its motes in violet or grey — a spiral that befuddles, drops that
 * sap, rings that hex, the stronger three drawn larger and darker (Daze's stars over them); a bind is a
 * coil of roots, brambles or wet vines; Lay to Rest an open hand of pale light; Take Measure an eye.
 */
function paintOther(g: CanvasRenderingContext2D, key: string): void {
  // A teleport's column of light with its town's first letters; Send-to's the same in violet, with an arrow sending someone into it.
  const sends = key.startsWith("send_");
  if (key.endsWith("_teleport") || sends) {
    const town = sends ? key.replace("send_", "") : key.replace("_teleport", "");
    const beam = g.createLinearGradient(0, 4, 0, 60);
    beam.addColorStop(0, sends ? "rgba(200,160,255,0)" : "rgba(154,208,255,0)");
    beam.addColorStop(0.5, sends ? "rgba(232,216,255,0.95)" : "rgba(210,236,255,0.95)");
    beam.addColorStop(1, sends ? "rgba(200,160,255,0.3)" : "rgba(154,208,255,0.3)");
    g.fillStyle = beam;
    g.fillRect(22, 4, 20, 56);
    if (sends) {
      g.strokeStyle = "#f4ecff";
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(4, 30);
      g.lineTo(22, 30);
      g.moveTo(14, 22);
      g.lineTo(22, 30);
      g.lineTo(14, 38);
      g.stroke();
    }
    g.strokeStyle = sends ? "#b890ff" : "#9ad0ff";
    g.lineWidth = 3;
    for (const y of [16, 30, 44]) {
      g.beginPath();
      g.ellipse(32, y, 17, 5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.font = "bold 22px serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 4;
    g.strokeStyle = sends ? "#3a1a70" : "#1a3470";
    const letters = (town[0]!.toUpperCase() + (town[1] ?? "")).slice(0, 2);
    g.strokeText(letters, 32, 50);
    g.fillStyle = "#ffffff";
    g.fillText(letters, 32, 50);
    return;
  }
  const glowDisc = (x: number, y: number, r: number, inner: string, outer: string) => {
    const fill = g.createRadialGradient(x, y, 0, x, y, r);
    fill.addColorStop(0, inner);
    fill.addColorStop(1, outer);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const big = key === "expose" || key === "wither" || key === "daze";
  const violet = big ? "#6a10b0" : "#9a48e8", grey = big ? "#7a7090" : "#c8c8d8";
  g.lineCap = "round";
  switch (key) {
    case "befuddle":
    case "daze": {
      glowDisc(32, 32, 26, "rgba(255,255,255,0.7)", "rgba(160,80,240,0)");
      g.strokeStyle = key === "daze" ? "#e8e0ff" : violet;
      g.lineWidth = big ? 6 : 5;
      g.beginPath();
      for (let s = 0; s <= 60; s++) {
        const a = s * 0.3, r = 3 + s * 0.42;
        g.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r);
      }
      g.stroke();
      if (key === "daze") {
        g.fillStyle = "#ffe060";
        for (const [x, y] of [[16, 12], [32, 7], [48, 12]] as const) star(g, x, y, 6);
      }
      break;
    }
    case "sap":
    case "wither": {
      glowDisc(32, 30, 26, "rgba(255,255,255,0.6)", "rgba(160,160,180,0)");
      g.fillStyle = key === "wither" ? "#6a6088" : grey;
      for (const [x, y, r] of [[22, 20, 5], [36, 16, 6], [44, 30, 5], [28, 36, 6], [38, 46, 5], [24, 52, 4]] as const) {
        g.beginPath();
        g.moveTo(x, y - r * 1.8);
        g.quadraticCurveTo(x + r, y, x, y + r);
        g.quadraticCurveTo(x - r, y, x, y - r * 1.8);
        g.fill();
      }
      break;
    }
    case "hex":
    case "expose": {
      glowDisc(32, 32, 26, "rgba(255,220,255,0.6)", "rgba(140,40,210,0)");
      g.strokeStyle = violet;
      g.lineWidth = big ? 5 : 4;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(32, 14 + i * 12, 18 - i * 1.5, 5, 0, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case "root":
    case "bramble":
    case "mire": {
      const coil = key === "root" ? "#7a5230" : key === "bramble" ? "#2e6a22" : "#3a3a1e";
      if (key === "mire") glowDisc(32, 52, 22, "rgba(60,50,20,0.95)", "rgba(60,50,20,0)");
      glowDisc(32, 40, 24, "rgba(170,240,120,0.55)", "rgba(98,192,64,0)");
      g.strokeStyle = coil;
      g.lineWidth = 6;
      g.beginPath();
      for (let s = 0; s <= 40; s++) {
        const t = s / 40, a = t * Math.PI * 5;
        g.lineTo(32 + Math.cos(a) * (16 - t * 6), 56 - t * 44 + Math.sin(a) * 4);
      }
      g.stroke();
      if (key === "bramble") {
        g.fillStyle = "#a8d890";
        for (const [x, y] of [[18, 44], [44, 36], [22, 26], [42, 18]] as const) star(g, x, y, 3);
      }
      break;
    }
    case "hearthward": {
      glowDisc(32, 36, 28, "rgba(255,240,192,0.9)", "rgba(255,176,64,0)");
      g.fillStyle = "#6a4a2e";
      g.fillRect(16, 30, 32, 24);
      g.fillStyle = "#8a2a1e";
      g.beginPath();
      g.moveTo(12, 32);
      g.lineTo(32, 14);
      g.lineTo(52, 32);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffb040";
      g.fillRect(27, 40, 10, 14);
      break;
    }
    case "lay_to_rest": {
      glowDisc(32, 34, 28, "rgba(255,255,255,0.95)", "rgba(150,190,240,0)");
      g.strokeStyle = "#ffffff";
      g.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.42;
        g.beginPath();
        g.moveTo(32 + Math.cos(a) * 8, 40 + Math.sin(a) * 8);
        g.lineTo(32 + Math.cos(a) * 24, 40 + Math.sin(a) * 24);
        g.stroke();
      }
      break;
    }
    case "bones_to_bread":
    case "bones_to_plums": {
      glowDisc(32, 34, 26, "rgba(255,240,200,0.7)", "rgba(216,168,96,0)");
      g.strokeStyle = "#f4f0e4";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(12, 44);
      g.lineTo(30, 26);
      g.stroke();
      for (const [x, y] of [[10, 46], [14, 42], [28, 28], [32, 24]] as const) {
        g.fillStyle = "#f4f0e4";
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
      if (key === "bones_to_bread") {
        g.fillStyle = "#c88a40";
        g.beginPath();
        g.ellipse(44, 40, 14, 10, -0.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e8b870";
        g.fillRect(36, 34, 3, 8);
        g.fillRect(44, 32, 3, 8);
      } else {
        g.fillStyle = "#6a2a7a";
        g.beginPath();
        g.arc(44, 42, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#4a8a30";
        g.beginPath();
        g.ellipse(50, 28, 6, 3, -0.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "lesser_gilding":
    case "greater_gilding": {
      const great = key === "greater_gilding";
      glowDisc(32, 32, great ? 31 : 26, "rgba(255,240,170,0.95)", "rgba(224,176,32,0)");
      g.fillStyle = "#e0b020";
      g.beginPath();
      g.arc(32, 32, great ? 16 : 13, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#a07810";
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = "#fff2b0";
      g.beginPath();
      g.arc(28, 28, great ? 5 : 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "beckon": {
      glowDisc(32, 32, 26, "rgba(240,216,255,0.6)", "rgba(160,80,240,0)");
      g.strokeStyle = "#a050f0";
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(40, 24, 13, 6, -0.4, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "#f0d8ff";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(34, 30);
      g.lineTo(14, 50);
      g.moveTo(14, 50);
      g.lineTo(26, 50);
      g.moveTo(14, 50);
      g.lineTo(14, 38);
      g.stroke();
      break;
    }
    case "hand_forge": {
      glowDisc(32, 24, 22, "rgba(255,240,160,0.95)", "rgba(255,122,32,0)");
      g.fillStyle = "#8d939b";
      g.beginPath();
      g.moveTo(14, 54);
      g.lineTo(50, 54);
      g.lineTo(44, 44);
      g.lineTo(20, 44);
      g.closePath();
      g.fill();
      g.fillStyle = "#c2c8d0";
      g.fillRect(20, 44, 24, 3);
      break;
    }
    // Stage A4. Thought Dart: a slim violet dart flying up to the right with a short pale tail.
    case "thought_dart": {
      glowDisc(36, 28, 22, "rgba(236,228,255,0.8)", "rgba(154,138,200,0)");
      g.fillStyle = "#9a8ac8";
      g.beginPath();
      g.moveTo(54, 10);
      g.lineTo(30, 30);
      g.lineTo(22, 42);
      g.lineTo(34, 34);
      g.closePath();
      g.fill();
      g.fillStyle = "#f4f0ff";
      g.beginPath();
      g.moveTo(54, 10);
      g.lineTo(36, 28);
      g.lineTo(34, 30);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(236,228,255,0.8)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(22, 42);
      g.lineTo(8, 56);
      g.stroke();
      break;
    }
    // Scorch: a heavy ball of dark fire, tongues of flame round a black heart.
    case "scorch": {
      glowDisc(32, 32, 30, "rgba(255,160,64,0.9)", "rgba(154,40,16,0)");
      g.fillStyle = "#ff6a20";
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.beginPath();
        g.moveTo(32 + Math.cos(a - 0.25) * 14, 32 + Math.sin(a - 0.25) * 14);
        g.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
        g.lineTo(32 + Math.cos(a + 0.25) * 14, 32 + Math.sin(a + 0.25) * 14);
        g.closePath();
        g.fill();
      }
      glowDisc(32, 32, 16, "#3a0a04", "#8a1a0a");
      break;
    }
    // The orb spells: an orb of the element's colours with a star caught in it.
    case "charge_tide_orb":
    case "charge_stone_orb":
    case "charge_ember_orb":
    case "charge_gale_orb": {
      const c = ELEMENT_COLORS[key.replace("charge_", "").replace("_orb", "") as Element];
      glowDisc(32, 32, 30, c.glow, "rgba(0,0,0,0)");
      const fill = g.createRadialGradient(26, 26, 3, 32, 32, 20);
      fill.addColorStop(0, c.core);
      fill.addColorStop(0.6, c.glow);
      fill.addColorStop(1, c.dark);
      g.fillStyle = fill;
      g.beginPath();
      g.arc(32, 32, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff4b0";
      star(g, 32, 32, 9);
      break;
    }
    // Sunfall: a shaft of white-gold light falling from the top onto a burst.
    case "sunfall": {
      const shaft = g.createLinearGradient(0, 0, 0, 50);
      shaft.addColorStop(0, "rgba(255,244,200,0)");
      shaft.addColorStop(1, "rgba(255,244,200,0.95)");
      g.fillStyle = shaft;
      g.fillRect(24, 0, 16, 50);
      glowDisc(32, 48, 16, "#ffffff", "rgba(240,204,64,0)");
      g.fillStyle = "#f0cc40";
      star(g, 32, 48, 11);
      break;
    }
    // Pyre: three tongues of fire up out of a glowing ground.
    case "pyre": {
      glowDisc(32, 54, 26, "rgba(255,208,96,0.95)", "rgba(255,90,20,0)");
      for (const [x, h, colour] of [[20, 30, "#d8401a"], [44, 34, "#d8401a"], [32, 46, "#ff7a20"]] as const) {
        g.fillStyle = colour;
        g.beginPath();
        g.moveTo(x - 9, 56);
        g.quadraticCurveTo(x - 8, 56 - h * 0.6, x, 56 - h);
        g.quadraticCurveTo(x + 8, 56 - h * 0.6, x + 9, 56);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "#ffe08a";
      g.beginPath();
      g.moveTo(26, 56);
      g.quadraticCurveTo(32, 36, 38, 56);
      g.fill();
      break;
    }
    // Wildclaw: three green claw marks raked across.
    case "wildclaw": {
      glowDisc(32, 32, 28, "rgba(208,248,168,0.7)", "rgba(90,154,48,0)");
      g.strokeStyle = "#3a7a20";
      g.lineWidth = 7;
      for (const d of [-12, 0, 12]) {
        g.beginPath();
        g.moveTo(16 + d, 10);
        g.quadraticCurveTo(34 + d, 28, 30 + d, 54);
        g.stroke();
      }
      g.strokeStyle = "#c8f090";
      g.lineWidth = 3;
      for (const d of [-12, 0, 12]) {
        g.beginPath();
        g.moveTo(17 + d, 12);
        g.quadraticCurveTo(34 + d, 28, 30 + d, 52);
        g.stroke();
      }
      break;
    }
    // The enchanting spells: a cut gem of the spell's own colour with a star of light at its crown.
    case "enchant_sapphire":
    case "enchant_emerald":
    case "enchant_ruby":
    case "enchant_diamond":
    case "enchant_wyrmstone":
    case "enchant_onyx":
    case "enchant_sunstone": {
      const GEM: Record<string, [string, string]> = {
        enchant_sapphire: ["#2f5ae0", "#9ab8ff"], enchant_emerald: ["#28c060", "#a8f0c0"], enchant_ruby: ["#d01830", "#ff9aa4"],
        enchant_diamond: ["#c8d8f0", "#ffffff"], enchant_wyrmstone: ["#a040d8", "#e0b8ff"], enchant_onyx: ["#1a1a22", "#8a8aa0"], enchant_sunstone: ["#f0a020", "#fff0a0"],
      };
      const [deep, light] = GEM[key]!;
      glowDisc(32, 34, 28, light, "rgba(0,0,0,0)");
      g.fillStyle = deep;
      g.beginPath();
      g.moveTo(14, 26);
      g.lineTo(22, 16);
      g.lineTo(42, 16);
      g.lineTo(50, 26);
      g.lineTo(32, 54);
      g.closePath();
      g.fill();
      g.fillStyle = light;
      g.beginPath();
      g.moveTo(22, 16);
      g.lineTo(42, 16);
      g.lineTo(38, 26);
      g.lineTo(26, 26);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffffff";
      star(g, 46, 14, 7);
      break;
    }
    // Charge: a ring of gathered power with bolts crackling out of it.
    case "charge": {
      glowDisc(32, 32, 30, "rgba(255,236,190,0.9)", "rgba(160,80,240,0)");
      g.strokeStyle = "#a050f0";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(32, 32, 15, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "#fff2b0";
      g.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        g.beginPath();
        g.moveTo(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17);
        g.lineTo(32 + Math.cos(a + 0.2) * 23, 32 + Math.sin(a + 0.2) * 23);
        g.lineTo(32 + Math.cos(a - 0.1) * 26, 32 + Math.sin(a - 0.1) * 26);
        g.lineTo(32 + Math.cos(a + 0.1) * 31, 32 + Math.sin(a + 0.1) * 31);
        g.stroke();
      }
      break;
    }
    case "take_measure": {
      glowDisc(32, 32, 28, "rgba(200,232,255,0.8)", "rgba(154,208,255,0)");
      g.fillStyle = "#eaf4ff";
      g.beginPath();
      g.moveTo(6, 32);
      g.quadraticCurveTo(32, 8, 58, 32);
      g.quadraticCurveTo(32, 56, 6, 32);
      g.fill();
      g.fillStyle = "#3a7ad0";
      g.beginPath();
      g.arc(32, 32, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#0a1428";
      g.beginPath();
      g.arc(32, 32, 5, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}

/** A small five-pointed star. */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
