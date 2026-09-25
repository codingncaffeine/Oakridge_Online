// Where the grass grows and what burns (PLAN Phase 15): pure planning over the map, so a test can read
// it, and the meshes (grass.ts, flames.ts) only draw what it says.
import {
  heightAt, indoorsAt, isEdgeKind, isTree, objectsIn, OVERLAY_NONE, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionAt, UNDERLAY_FOREST,
  UNDERLAY_GRASS, underlayAt, type Box, type MapObject, type ObjectKind, type WorldMap,
} from "../../shared/map.ts";
import { propPlacement } from "./placement.ts";

/**
 * Tufts a tile: on open grass; on grass that meets a path, water, a wall, a fence or a building; and
 * round a tree's trunk. The edges are where the eye looks for grass, and where a flat ground colour
 * meeting a hard line reads as a drawing rather than a place.
 */
export const GRASS_OPEN = 0.05;
export const GRASS_EDGE = 0.45;
export const GRASS_ROUND_TREE = 0.8;

/** One tuft: where it stands (world tiles and height), how it is turned, how big, and how green. */
export interface Tuft {
  x: number;
  y: number;
  h: number;
  turn: number;
  scale: number;
  tint: number;
}

/** A hash per tile and purpose, so the same map grows the same grass every time. */
const hash = (a: number, b: number, k: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Every tuft of a box of tiles. */
export function grassPlan(map: WorldMap, box: Box): Tuft[] {
  const tufts: Tuft[] = [];
  const filled = new Map<number, ObjectKind>();
  for (const o of objectsIn(map, box)) if (!isEdgeKind(o.kind)) filled.set(o.y * 65536 + o.x, o.kind);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (!regionAt(map, x, y)?.built) continue;
      const under = underlayAt(map, x, y);
      if ((under !== UNDERLAY_GRASS && under !== UNDERLAY_FOREST) || overlayAt(map, x, y) !== OVERLAY_NONE || indoorsAt(map, x, y) > 0) continue;
      const kind = filled.get(y * 65536 + x);
      // A rock, a bush or a piece of furniture fills its tile; grass grows round a trunk, not through a rock.
      if (kind !== undefined && !isTree(kind)) continue;
      const tree = kind !== undefined;
      // The edges this tile meets: a path or water next door, a building's floor, or a wall, fence, door or gate between.
      const edges: Array<[number, number]> = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const over = overlayAt(map, x + dx, y + dy);
        if (over === OVERLAY_PATH || over === OVERLAY_WATER || indoorsAt(map, x + dx, y + dy) > 0 || map.collision.wallBetween(x, y, dx, dy)) edges.push([dx, dy]);
      }
      const density = tree ? GRASS_ROUND_TREE : GRASS_OPEN + (edges.length > 0 ? GRASS_EDGE : 0);
      const n = Math.floor(density) + (hash(x, y, 1) < density - Math.floor(density) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let fx: number, fy: number;
        if (tree) {
          // Round the trunk, clear of it.
          const a = hash(x, y, 10 + i) * Math.PI * 2, r = 0.36 + 0.12 * hash(x, y, 20 + i);
          fx = x + 0.5 + Math.cos(a) * r;
          fy = y + 0.5 + Math.sin(a) * r;
        } else if (edges.length > 0) {
          // Along one of the edges, a little in from it.
          const [dx, dy] = edges[Math.floor(hash(x, y, 30 + i) * edges.length)]!;
          const along = 0.15 + 0.7 * hash(x, y, 40 + i), inFrom = 0.1 + 0.2 * hash(x, y, 50 + i);
          fx = x + (dx === 0 ? along : dx > 0 ? 1 - inFrom : inFrom);
          fy = y + (dy === 0 ? along : dy > 0 ? 1 - inFrom : inFrom);
        } else {
          fx = x + 0.1 + 0.8 * hash(x, y, 60 + i);
          fy = y + 0.1 + 0.8 * hash(x, y, 70 + i);
        }
        tufts.push({
          x: fx, y: fy, h: heightAt(map, fx, fy),
          turn: hash(x, y, 80 + i) * Math.PI * 2, scale: 0.75 + 0.55 * hash(x, y, 90 + i), tint: 0.85 + 0.3 * hash(x, y, 100 + i),
        });
      }
    }
  }
  return tufts;
}

/** One tongue of flame: where it stands in the scene (x east, y up, z south), how big, which of its fire's it is. */
export interface Tongue {
  x: number;
  y: number;
  z: number;
  size: number;
  /** Its number among its fire's tongues, and how many there are: what spreads them round the fire. */
  index: number;
  of: number;
  /** A number of its own, so no two tongues sway alike. */
  seed: number;
}

/**
 * What burns: the kind, where on it the fire stands (in the object's own frame, before its turn and
 * its size — the hearth's mouth, the forge's, the campfire's heart), how big its tongues are, and how many.
 */
export const FIRES: Partial<Record<ObjectKind, { at: [number, number, number]; size: number; tongues: number }>> = {
  fire: { at: [0, 0.24, 0], size: 1, tongues: 5 },
  kiln: { at: [0, 0.2, 0.52], size: 0.36, tongues: 3 },
  vent: { at: [0, 0.12, 0], size: 0.7, tongues: 4 },
  furnace: { at: [0, 0.3, 0.5], size: 0.45, tongues: 3 },
  range: { at: [0, 0.24, 0.42], size: 0.32, tongues: 3 },
};

/** Every tongue of the fires among `objects`, placed as the renderer places the object it burns on. */
export function flamePlan(map: WorldMap, objects: MapObject[]): Tongue[] {
  const out: Tongue[] = [];
  for (const o of objects) {
    const fire = FIRES[o.kind];
    if (!fire) continue;
    const { turn, scale } = propPlacement(o.variant);
    const cx = o.x + 0.5, cy = o.y + 0.5;
    const ground = heightAt(map, cx, cy);
    const [ax, ay, az] = fire.at;
    // The object's own frame, turned about the vertical as the renderer turns it, then scaled with it.
    const rx = (ax * Math.cos(turn) + az * Math.sin(turn)) * scale, rz = (-ax * Math.sin(turn) + az * Math.cos(turn)) * scale;
    for (let i = 0; i < fire.tongues; i++) {
      out.push({ x: cx + rx, y: ground + ay * scale, z: -cy + rz, size: fire.size * scale, index: i, of: fire.tongues, seed: o.id * 0.37 + i * 1.7 });
    }
  }
  return out;
}
