import * as THREE from "three";
import { ROOF_CLAY_TONES, ROOF_SLATE_TONES, THATCH_TONES } from "../palette.ts";
import { stoneTexture, thatchTexture, tileTexture } from "./textures.ts";

/**
 * The textured materials buildings are drawn with, made once. Every one takes vertex colours as a
 * tint on top of its texture: white leaves the surface as painted, and a darker colour is shadow.
 * Roofs are open surfaces seen from below when the camera dips, so they draw both faces.
 */
export interface Surfaces {
  stone: THREE.Material;
  clay: THREE.Material;
  slate: THREE.Material;
  thatch: THREE.Material;
  /** Plain flat-shaded colour, for boards, caps and frames. */
  trim: THREE.Material;
}

let cache: Surfaces | null = null;

export function surfaces(): Surfaces {
  cache ??= {
    stone: new THREE.MeshLambertMaterial({ map: stoneTexture(), vertexColors: true, flatShading: true }),
    clay: new THREE.MeshLambertMaterial({ map: tileTexture(ROOF_CLAY_TONES, 4, 31), vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    slate: new THREE.MeshLambertMaterial({ map: tileTexture(ROOF_SLATE_TONES, 5, 32), vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    thatch: new THREE.MeshLambertMaterial({ map: thatchTexture(THATCH_TONES, 33), vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
  return cache;
}

/**
 * A box whose faces carry UVs in world units — a face `w` wide and `h` tall runs u over `w` and v over
 * `h` from (u0, v0) — so a repeating texture keeps one scale on every wall and every roof, and two
 * walls that overlap show the same stones where they do. BoxGeometry's faces come +x, −x, +y, −y, +z,
 * −z, four corners each, with u across the face and v up it.
 */
export function slab(w: number, h: number, d: number, u0 = 0, v0 = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const across = [d, d, w, w, w, w], up = [h, h, d, d, h, h];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, u0 + uv.getX(k) * across[face]!, v0 + uv.getY(k) * up[face]!);
    }
  }
  return g;
}
