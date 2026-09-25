// The pictures on the trades' signs: the same sign over every door of a trade in every town, so a building
// says what it is from down the street. Each is painted in code onto the board's face — a dark board, a
// panel in the trade's colour ruled round in cream, and the picture on it in the middle — and kept, so every
// bank's sign in the world shares one texture and one material.
import * as THREE from "three";
import { SIGN_ICONS, type SignIcon } from "../../shared/map.ts";

/** The face, in pixels: the board's own proportions (0.58 wide, 0.4 tall). */
export const SIGN_W = 174;
export const SIGN_H = 120;

const TAU = Math.PI * 2;
const BOARD = "#3a2818", RULE = "#eadcb8";
const GOLD = "#e2b843", GOLD_DARK = "#8a6a1c", STEEL = "#cfd4da", STEEL_DARK = "#4a4e56", IRON = "#9aa2aa", IRON_LIGHT = "#c8d0d8";
const INK = "#1c1712", WOOD = "#9a6634", WOOD_DARK = "#5a3a1c", CREAM = "#eadcb8", RED = "#c23a2c", RED_DARK = "#6e1a14";
const LEAF = "#4f8a2e", FOAM = "#f4efe2", CRUST = "#c98a3c", CRUST_DARK = "#6a4018", CRUST_LIGHT = "#f0d48a";

/** Each trade's panel: a colour of its own, so two signs differ before either picture can be made out. */
const PANEL: Record<SignIcon, string> = {
  bank: "#22375e", anvil: "#2f3036", swords: "#6a1e1c", breastplate: "#4a2430", bow: "#2c4a26", star: "#3a2456", tankard: "#5c1c16",
  bread: "#6a4a20", apples: "#2e5226", fish: "#1c4a54", tools: "#3a424a", ring: "#1e1c22", anchor: "#1e3354",
};

type Pen = CanvasRenderingContext2D;

function line(g: Pen, x0: number, y0: number, x1: number, y1: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** A closed shape through the points given as x, y pairs, filled, and outlined if a colour is given. */
function shape(g: Pen, points: readonly number[], fill: string, outline?: string): void {
  g.beginPath();
  g.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i]!, points[i + 1]!);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (outline) {
    g.strokeStyle = outline;
    g.stroke();
  }
}

function disc(g: Pen, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** A sword, point up, turned about its middle. */
function sword(g: Pen, angle: number): void {
  g.save();
  g.rotate(angle);
  g.lineWidth = 1.5;
  shape(g, [-3.5, 12, -3.5, -34, 0, -42, 3.5, -34, 3.5, 12], STEEL, STEEL_DARK);
  line(g, 0, -33, 0, 10);
  g.fillStyle = GOLD;
  g.fillRect(-13, 12, 26, 5);
  g.fillStyle = WOOD_DARK;
  g.fillRect(-2.5, 17, 5, 13);
  disc(g, 0, 33, 4, GOLD);
  g.restore();
}

function apple(g: Pen, x: number, y: number, r: number): void {
  for (const dx of [-0.32, 0.32]) disc(g, x + dx * r, y, r * 0.8, RED);
  g.strokeStyle = WOOD_DARK;
  g.lineWidth = 2.5;
  line(g, x, y - r * 0.6, x + 3, y - r * 1.15);
  g.fillStyle = LEAF;
  g.beginPath();
  g.ellipse(x + 9, y - r, 7, 3.5, -0.5, 0, TAU);
  g.fill();
  g.globalAlpha = 0.35;
  disc(g, x - r * 0.45, y - r * 0.3, r * 0.22, "#ffffff");
  g.globalAlpha = 1;
}

/** Each trade's picture, drawn about the panel's middle, inside ±56 across and ±40 up and down. */
const PICTURES: Record<SignIcon, (g: Pen) => void> = {
  // Scales: the pillar and its foot, the beam, and a pan hung on cords from each end.
  bank(g) {
    g.strokeStyle = GOLD;
    g.fillStyle = GOLD;
    g.lineCap = "round";
    g.lineWidth = 5;
    line(g, 0, -30, 0, 27);
    g.fillRect(-16, 26, 32, 7);
    line(g, -40, -24, 40, -24);
    disc(g, 0, -32, 5, GOLD);
    g.lineWidth = 1.8;
    for (const x of [-36, 36]) {
      line(g, x, -24, x - 13, 4);
      line(g, x, -24, x + 13, 4);
      g.fillStyle = GOLD;
      g.beginPath();
      g.moveTo(x - 17, 4);
      g.quadraticCurveTo(x, 20, x + 17, 4);
      g.closePath();
      g.fill();
    }
  },
  // An anvil, horn to the left, and the hammer resting on its face.
  anvil(g) {
    g.lineJoin = "round";
    g.lineWidth = 2.5;
    g.fillStyle = STEEL;
    g.strokeStyle = STEEL_DARK;
    g.beginPath();
    g.moveTo(-52, -6);
    g.quadraticCurveTo(-36, -14, -22, -14);
    g.lineTo(36, -14);
    g.lineTo(36, -2);
    g.lineTo(20, 0);
    g.lineTo(14, 14);
    g.lineTo(30, 20);
    g.lineTo(30, 30);
    g.lineTo(-24, 30);
    g.lineTo(-24, 20);
    g.lineTo(-10, 14);
    g.lineTo(-14, 0);
    g.quadraticCurveTo(-34, 0, -52, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.globalAlpha = 0.5;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    line(g, -20, -11, 33, -11);
    g.globalAlpha = 1;
    g.save();
    g.translate(16, -20);
    g.rotate(-0.55);
    g.fillStyle = WOOD;
    g.fillRect(-2.5, -30, 5, 28);
    g.lineWidth = 1.5;
    shape(g, [-11, -4, 11, -4, 11, 5, -11, 5], IRON, STEEL_DARK);
    g.restore();
  },
  // Two swords crossed.
  swords(g) {
    sword(g, -0.72);
    sword(g, 0.72);
  },
  // A breastplate: shoulders, the neckline, the ridge down the middle and the lames at its foot.
  breastplate(g) {
    g.lineJoin = "round";
    g.lineWidth = 2.5;
    g.fillStyle = STEEL;
    g.strokeStyle = STEEL_DARK;
    g.beginPath();
    g.moveTo(-14, -34);
    g.quadraticCurveTo(0, -26, 14, -34);
    g.lineTo(30, -30);
    g.quadraticCurveTo(26, -18, 30, -6);
    g.quadraticCurveTo(30, 18, 22, 34);
    g.quadraticCurveTo(0, 40, -22, 34);
    g.quadraticCurveTo(-30, 18, -30, -6);
    g.quadraticCurveTo(-26, -18, -30, -30);
    g.closePath();
    g.fill();
    g.stroke();
    line(g, 0, -27, 0, 36);
    g.beginPath();
    g.moveTo(-27, 16);
    g.quadraticCurveTo(0, 24, 27, 16);
    g.stroke();
    g.globalAlpha = 0.45;
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.moveTo(-18, -14);
    g.quadraticCurveTo(-22, 4, -16, 18);
    g.stroke();
    g.globalAlpha = 1;
  },
  // A bow bent to the right, its string drawn back, and the arrow on it pointing through the grip.
  bow(g) {
    g.lineCap = "round";
    g.strokeStyle = WOOD;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(8, -38);
    g.quadraticCurveTo(48, 0, 8, 38);
    g.stroke();
    g.strokeStyle = CREAM;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(8, -38);
    g.lineTo(-18, 0);
    g.lineTo(8, 38);
    g.stroke();
    g.strokeStyle = WOOD_DARK;
    g.lineWidth = 3;
    line(g, -22, 0, 44, 0);
    shape(g, [44, -6, 56, 0, 44, 6], STEEL);
    shape(g, [-22, 0, -14, -7, -8, -7, -16, 0], RED);
    shape(g, [-22, 0, -14, 7, -8, 7, -16, 0], RED);
  },
  // An eight-pointed star, the four long points on the quarters.
  star(g) {
    const points: number[] = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 4 === 0 ? 38 : i % 2 === 0 ? 25 : 10;
      const a = (i * Math.PI) / 8 - Math.PI / 2;
      points.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.lineWidth = 1.5;
    shape(g, points, GOLD, GOLD_DARK);
    disc(g, 0, 0, 5, PANEL.star);
  },
  // A tankard: staves and two hoops, the handle, and the head of foam spilling over.
  tankard(g) {
    g.strokeStyle = IRON;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(24, 6, 13, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.fillStyle = WOOD;
    g.fillRect(-24, -16, 48, 50);
    g.strokeStyle = WOOD_DARK;
    g.lineWidth = 1.2;
    for (const x of [-12, 0, 12]) line(g, x, -16, x, 34);
    g.lineWidth = 2;
    g.strokeRect(-24, -16, 48, 50);
    g.fillStyle = IRON;
    g.fillRect(-25, -9, 50, 5);
    g.fillRect(-25, 24, 50, 5);
    for (const [x, y, r] of [[-18, -18, 9], [-5, -22, 11], [9, -20, 10], [20, -16, 7]] as const) disc(g, x, y, r, FOAM);
    g.beginPath();
    g.moveTo(-24, -15);
    g.quadraticCurveTo(-29, -3, -23, 3);
    g.lineTo(-20, -13);
    g.fill();
  },
  // A round loaf with its crust slashed.
  bread(g) {
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-46, 22);
    g.bezierCurveTo(-48, -34, 48, -34, 46, 22);
    g.closePath();
    g.fillStyle = CRUST;
    g.fill();
    g.strokeStyle = CRUST_DARK;
    g.stroke();
    g.strokeStyle = CRUST_LIGHT;
    g.lineWidth = 3;
    g.lineCap = "round";
    for (const x of [-22, 0, 22]) {
      g.beginPath();
      g.moveTo(x - 8, 6);
      g.quadraticCurveTo(x, -4, x + 8, -14);
      g.stroke();
    }
    g.globalAlpha = 0.35;
    g.strokeStyle = "#ffffff";
    g.beginPath();
    g.moveTo(-30, -6);
    g.quadraticCurveTo(-18, -18, 0, -20);
    g.stroke();
    g.globalAlpha = 1;
  },
  // Three apples in a pile, stalks and a leaf each.
  apples(g) {
    apple(g, -20, 12, 20);
    apple(g, 20, 12, 20);
    apple(g, 0, -12, 20);
  },
  // A fish, nose to the right: tail, back fin, body, gill and eye.
  fish(g) {
    g.lineJoin = "round";
    g.lineWidth = 2;
    shape(g, [-26, 0, -48, -18, -42, 0, -48, 18], "#b8ccd6", "#2e4650");
    g.beginPath();
    g.moveTo(-4, -14);
    g.quadraticCurveTo(8, -30, 20, -15);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(46, 2);
    g.quadraticCurveTo(10, -30, -28, 0);
    g.quadraticCurveTo(10, 28, 46, 2);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(22, -9);
    g.quadraticCurveTo(17, 1, 22, 11);
    g.stroke();
    disc(g, 32, -3, 3, INK);
  },
  // A pick and an axe, crossed.
  tools(g) {
    g.save();
    g.rotate(-0.72);
    g.fillStyle = WOOD;
    g.fillRect(-2.5, -32, 5, 70);
    g.strokeStyle = STEEL;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-26, -24);
    g.quadraticCurveTo(0, -42, 26, -24);
    g.stroke();
    g.restore();
    g.save();
    g.rotate(0.72);
    g.fillStyle = WOOD;
    g.fillRect(-2.5, -32, 5, 70);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(2, -30);
    g.lineTo(16, -38);
    g.quadraticCurveTo(27, -25, 16, -12);
    g.lineTo(2, -20);
    g.closePath();
    g.fillStyle = STEEL;
    g.fill();
    g.strokeStyle = STEEL_DARK;
    g.stroke();
    g.restore();
  },
  // A gold ring, and a red stone in its setting.
  ring(g) {
    g.strokeStyle = GOLD;
    g.lineWidth = 8;
    g.beginPath();
    g.ellipse(0, 10, 26, 22, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = GOLD_DARK;
    g.lineWidth = 1.5;
    for (const [rx, ry] of [[30, 26], [22, 18]] as const) {
      g.beginPath();
      g.ellipse(0, 10, rx, ry, 0, 0, TAU);
      g.stroke();
    }
    g.fillStyle = GOLD;
    g.fillRect(-10, -18, 20, 8);
    shape(g, [0, -38, 13, -24, 0, -12, -13, -24], RED, RED_DARK);
    g.globalAlpha = 0.6;
    shape(g, [-3, -32, 3, -27, -2, -24], "#ffffff");
    g.globalAlpha = 1;
  },
  // An anchor: ring, stock, shank, and the arms curving up to their flukes.
  anchor(g) {
    g.strokeStyle = IRON_LIGHT;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.arc(0, -31, 6, 0, TAU);
    g.stroke();
    line(g, 0, -25, 0, 30);
    line(g, -18, -16, 18, -16);
    g.beginPath();
    g.moveTo(-32, 6);
    g.quadraticCurveTo(-28, 32, 0, 32);
    g.quadraticCurveTo(28, 32, 32, 6);
    g.stroke();
    shape(g, [-32, -2, -40, 12, -25, 10], IRON_LIGHT);
    shape(g, [32, -2, 40, 12, 25, 10], IRON_LIGHT);
  },
};

/** Whether a tag names a sign's picture. */
export const isSignIcon = (tag: string | undefined): tag is SignIcon => (SIGN_ICONS as readonly string[]).includes(tag ?? "");

/** Paints one sign's face: the board, the trade's panel ruled round, and its picture. A tag that names no picture gets a bare panel. */
export function paintSign(g: Pen, tag: string | undefined): void {
  const icon = isSignIcon(tag) ? tag : null;
  g.fillStyle = BOARD;
  g.fillRect(0, 0, SIGN_W, SIGN_H);
  g.fillStyle = icon ? PANEL[icon] : "#3a3a3a";
  g.fillRect(8, 8, SIGN_W - 16, SIGN_H - 16);
  g.strokeStyle = RULE;
  g.lineWidth = 3;
  g.strokeRect(14, 14, SIGN_W - 28, SIGN_H - 28);
  if (!icon) return;
  g.save();
  g.translate(SIGN_W / 2, SIGN_H / 2);
  PICTURES[icon](g);
  g.restore();
}

const kept = new Map<string, THREE.Material>();

/** The material a sign's two faces are drawn in: its painted face, made once and shared by every sign of its trade. */
export function signMaterial(tag: string | undefined): THREE.Material {
  const key = tag ?? "";
  let material = kept.get(key);
  if (!material) {
    const canvas = document.createElement("canvas");
    canvas.width = SIGN_W;
    canvas.height = SIGN_H;
    paintSign(canvas.getContext("2d")!, tag);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    material = new THREE.MeshLambertMaterial({ map: texture });
    kept.set(key, material);
  }
  return material;
}
