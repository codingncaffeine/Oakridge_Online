import * as THREE from "three";
import { mulberry32 } from "../../shared/rng.ts";
import { LEAF_BACKING, LEAF_GREENS } from "../palette.ts";

/** Rows of the leaf texture (from the top) that are solid foliage; below it is the ragged fringe. */
export const LEAF_SOLID = 0.7;

/**
 * Foliage drawn from thousands of small leaves, tiling left to right. The top LEAF_SOLID of the image
 * is solid foliage, darker further down. Below that, strands of leaves hang with gaps between them, so
 * an alpha-tested canopy gets a ragged hanging edge. On a canopy, v = 1 is the crown and v = 0 is the
 * tip of the fringe.
 */
export function leafTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const rand = mulberry32(20260922);
  const solid = size * LEAF_SOLID;

  g.fillStyle = LEAF_BACKING;
  g.fillRect(0, 0, size, solid);

  const leaf = (x: number, y: number, len: number, color: string) => {
    const angle = rand() * Math.PI * 2, width = len * (0.45 + rand() * 0.2);
    g.fillStyle = color;
    for (const dx of [-size, 0, size]) {
      g.beginPath();
      g.ellipse(x + dx, y, len, width, angle, 0, Math.PI * 2);
      g.fill();
    }
  };
  // Deeper leaves are darker; sunlit ones near the crown are lighter.
  const shadeFor = (y: number) => {
    const depth = Math.min(1, Math.max(0, y / size));
    const i = Math.min(LEAF_GREENS.length - 1, Math.max(0, Math.floor(depth * 5 + rand() * 4 - 1)));
    return LEAF_GREENS[i]!;
  };
  // Clumps: a dark core with lighter leaves on top, so the foliage has depth rather than even noise.
  for (let i = 0; i < 260; i++) {
    const cx = rand() * size, cy = rand() * solid;
    leaf(cx, cy + 3, 12 + rand() * 6, LEAF_GREENS[6 + Math.floor(rand() * 2)]!);
    for (let j = 0; j < 7; j++) {
      const y = cy + (rand() - 0.6) * 14;
      leaf(cx + (rand() - 0.5) * 18, y, 5 + rand() * 5, shadeFor(y - 18));
    }
  }
  for (let i = 0; i < 900; i++) {
    const y = rand() * solid;
    leaf(rand() * size, y, 4 + rand() * 5, shadeFor(y));
  }

  // The fringe: strands hanging from the solid edge to random lengths, leaves thinning as they fall.
  const strands = 58;
  for (let s = 0; s < strands; s++) {
    const x0 = ((s + rand() * 0.8) / strands) * size;
    const length = (size - solid) * (0.25 + rand() * 0.75);
    for (let d = -8; d < length; d += 3) {
      const spread = 3 + (d / length) * 6;
      leaf(x0 + (rand() - 0.5) * spread * 2, solid + d, 4 + rand() * 5 * (1 - (d / length) * 0.5), shadeFor(solid + d * 0.6));
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}
