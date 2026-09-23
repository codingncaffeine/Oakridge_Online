import * as THREE from "three";
import { cornerHeight, tileShape, type WorldMap } from "../../shared/map.ts";
import { OVERLAY_COLORS, UNDERLAY_COLORS } from "../palette.ts";

/**
 * The ground as one mesh. Underlay colours blend smoothly across tiles; overlays (paths, water) keep
 * crisp edges that follow tile diagonals where they bend (see tileShape). Normals come from the height
 * field, so the light stays smooth across tile seams.
 * World axes: x east, y up, z south (tile y grows north, so z = -y).
 */
export function buildTerrain(map: WorldMap): THREE.Mesh {
  const { width: W, height: H, originX: OX, originY: OY } = map;
  const under = UNDERLAY_COLORS.map((c) => new THREE.Color(c));
  const over = OVERLAY_COLORS.map((c) => new THREE.Color(c));

  // The arrays are local to the map's origin; every coordinate that leaves this function is a world
  // one, because that is what the accessors, the entities and the scene all speak (PLAN §7.1).
  const cornerColor: THREE.Color[] = [];
  for (let cy = 0; cy <= H; cy++) {
    for (let cx = 0; cx <= W; cx++) {
      const c = new THREE.Color(0, 0, 0);
      let n = 0;
      for (let ty = cy - 2; ty <= cy + 1; ty++) {
        for (let tx = cx - 2; tx <= cx + 1; tx++) {
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          c.add(under[map.underlay[ty * W + tx]!]!);
          n++;
        }
      }
      cornerColor.push(c.multiplyScalar((1 + 0.1 * noise(cx, cy)) / n));
    }
  }
  const normalAt = (cx: number, cy: number) => new THREE.Vector3(
    -(cornerHeight(map, cx + 1, cy) - cornerHeight(map, cx - 1, cy)) / 2,
    1,
    (cornerHeight(map, cx, cy + 1) - cornerHeight(map, cx, cy - 1)) / 2,
  ).normalize();
  const cornerNormal: THREE.Vector3[] = [];
  for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) cornerNormal.push(normalAt(OX + cx, OY + cy));

  const count = W * H * 6;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  let v = 0;
  const tileColor = new THREE.Color();
  for (let ly = 0; ly < H; ly++) {
    for (let lx = 0; lx < W; lx++) {
      const x = OX + lx, y = OY + ly;
      const shape = tileShape(map, x, y);
      if (shape.fill[0] || shape.fill[1]) tileColor.copy(over[shape.overlay]!).multiplyScalar(1 + 0.08 * noise(lx * 3 + 1, ly * 3 + 2));
      const sw: Corner = [x, y], se: Corner = [x + 1, y], ne: Corner = [x + 1, y + 1], nw: Corner = [x, y + 1];
      const tris = shape.swNe ? [sw, se, ne, sw, ne, nw] : [sw, se, nw, se, ne, nw];
      for (let i = 0; i < 6; i++) {
        const [cx, cy] = tris[i]!;
        const ci = (cy - OY) * (W + 1) + (cx - OX);
        positions.set([cx, cornerHeight(map, cx, cy), -cy], v * 3);
        const col = shape.fill[i < 3 ? 0 : 1] ? tileColor : cornerColor[ci]!;
        colors.set([col.r, col.g, col.b], v * 3);
        const nrm = cornerNormal[ci]!;
        normals.set([nrm.x, nrm.y, nrm.z], v * 3);
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "terrain";
  return mesh;
}

type Corner = [number, number];

/** Deterministic value in [-1, 1) per lattice point. */
function noise(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
