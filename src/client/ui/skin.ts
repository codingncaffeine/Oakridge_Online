import { mulberry32 } from "../../shared/rng.ts";

// The interface's surfaces, painted in code once at startup and handed to the stylesheet as CSS
// variables: dressed stone for frames and tabs, darker worn stone behind panels, and parchment for the
// chatbox. Each tiles seamlessly.

type RGB = [number, number, number];

/** Value noise on a `cells` × `cells` grid that wraps, so a texture made from it repeats without seams. */
function tilingNoise(cells: number, rand: () => number): (u: number, v: number) => number {
  const grid = Float32Array.from({ length: cells * cells }, rand);
  const at = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]!;
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function paint(size: number, color: (x: number, y: number) => RGB): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, gr, b] = color(x, y), i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

const shadeOf = ([r, g, b]: RGB, k: number): RGB => [r * k, g * k, b * k];

/** Courses of rough-cut blocks with dark joints, each block a little lighter along its top edge. */
function stone(size: number, base: RGB, seed: number): string {
  const rand = mulberry32(seed);
  const grain = tilingNoise(32, rand), mottle = tilingNoise(6, rand);
  const rowHeight = size / 8;
  // Each course: block boundaries (in pixels, wrapping at `size`) and a shade per block.
  const rows = Array.from({ length: 8 }, () => {
    const edges: number[] = [];
    for (let x = rand() * 20; x < size; x += 22 + rand() * 26) edges.push(x);
    return { edges, shades: edges.map(() => 0.9 + rand() * 0.2) };
  });
  return paint(size, (x, y) => {
    const row = rows[Math.floor(y / rowHeight)]!, inRow = y % rowHeight;
    let block = row.edges.length - 1, joint = size;
    for (let i = 0; i < row.edges.length; i++) {
      const e = row.edges[i]!;
      joint = Math.min(joint, Math.abs(x - e), Math.abs(x - e + size), Math.abs(x - e - size));
      if (x >= e) block = i;
    }
    let k = row.shades[block]! * (0.86 + 0.28 * mottle(x / size, y / size)) * (0.92 + 0.16 * grain(x / size, y / size));
    if (joint < 1.2 || inRow < 1.2) k = 0.45;
    else if (inRow < 2.6) k *= 1.18;
    else if (inRow > rowHeight - 2.4 || joint < 2.4) k *= 0.8;
    return shadeOf(base, k);
  });
}

/** Worn stone without joints: soft blotches and fine grain. */
function smoothStone(size: number, base: RGB, seed: number): string {
  const rand = mulberry32(seed);
  const grain = tilingNoise(48, rand), blotch = tilingNoise(5, rand);
  return paint(size, (x, y) => shadeOf(base, (0.88 + 0.2 * blotch(x / size, y / size)) * (0.94 + 0.12 * grain(x / size, y / size))));
}

/** Parchment: pale and warm, with faint darker clouds and fibres. */
function parchment(size: number, seed: number): string {
  const rand = mulberry32(seed);
  const cloud = tilingNoise(4, rand), fibre = tilingNoise(64, rand), fine = tilingNoise(24, rand);
  return paint(size, (x, y) => {
    const u = x / size, v = y / size;
    const k = 0.9 + 0.1 * cloud(u, v) + 0.035 * (fibre(u, v * 0.25) - 0.5) + 0.04 * (fine(u, v) - 0.5);
    return shadeOf([222, 208, 168], k);
  });
}

/** Paints the textures and sets them on the page as --stone, --stone-dark and --parchment. */
export function applySkin(): void {
  const root = document.documentElement.style;
  root.setProperty("--stone", `url(${stone(128, [96, 86, 72], 7)})`);
  root.setProperty("--stone-dark", `url(${smoothStone(128, [64, 56, 45], 11)})`);
  root.setProperty("--parchment", `url(${parchment(128, 13)})`);
}
