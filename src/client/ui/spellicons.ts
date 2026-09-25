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
  paint(g, spell.element, spell.tier);
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
