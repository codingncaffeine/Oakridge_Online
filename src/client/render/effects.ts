import * as THREE from "three";
import type { BoltKind } from "../../shared/spells.ts";

/** Sparks in one level-up, and how long they last (seconds). */
const SPARKS = 64;
const LIFE = 1.6;
/** Where the sparks start, above the feet (about chest height). */
const CHEST = 1.05;
const GRAVITY = 2.6;
const COLORS = [0xffe27a, 0xfff6cc, 0xffa53c, 0xffd23f, 0xa8e4ff];

/** What crosses to a target: an arrow, or a spell's bolt (PLAN Phase 11). */
export type ShotKind = "arrow" | BoltKind;
/** A shot takes this long to cross, whatever the distance: a third of a second, as decided (PLAN §5). */
const FLIGHT = 0.33;
/** How high an arrow's arc rises over a straight line, in tiles. */
const ARC = 0.35;
/** The sparks a bolt sheds behind it: how many are kept, how long each lasts, and how many a second. */
const TRAIL = 48;
const TRAIL_LIFE = 0.45;
const TRAIL_RATE = 110;
/** Each spell's colours: the bolt's heart, its trail, and the flash where it lands. */
const BOLT_COLORS: Record<BoltKind, [number, number, number]> = {
  ember: [0xffe08a, 0xff7a1e, 0xff4a12],
  frost: [0xffffff, 0x9fd8ff, 0x62b4ff],
  storm: [0xffffff, 0xcdb8ff, 0x9a7cff],
};
const ARROW_WOOD = 0xc0a070, ARROW_HEAD = 0x9aa2ac, ARROW_FLIGHT = 0x5a4a3a;

let glowTexture: THREE.Texture | null = null;

/** A soft round glow, white at the heart and warm at the rim, drawn once on a canvas. */
function glow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = Object.assign(document.createElement("canvas"), { width: 32, height: 32 });
  const g = canvas.getContext("2d")!;
  const fade = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.28, "rgba(255,240,190,0.95)");
  fade.addColorStop(1, "rgba(255,170,60,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 32, 32);
  return (glowTexture = new THREE.CanvasTexture(canvas));
}

function sparkMaterial(size: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    size, map: glow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

interface Burst {
  points: THREE.Points;
  velocity: Float32Array;
  age: number;
  life: number;
  gravity: number;
  count: number;
  /** The level-up's twinkle; an impact flash just fades. */
  twinkle: boolean;
}

/**
 * The sparks a bolt leaves behind it: a ring of points, each set going where the bolt was and fading
 * as it ages. Additive blending makes a darker colour a fainter spark, so fading is done in the colour.
 */
class Trail {
  readonly points: THREE.Points;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly velocity = new Float32Array(TRAIL * 3);
  private readonly age = new Float32Array(TRAIL).fill(Infinity);
  private readonly base = new THREE.Color();
  private next = 0;
  private due = 0;

  constructor(color: number) {
    this.base.setHex(color);
    this.position = new Float32Array(TRAIL * 3);
    this.color = new Float32Array(TRAIL * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.color, 3));
    this.points = new THREE.Points(geometry, sparkMaterial(0.14));
    this.points.frustumCulled = false;
  }

  /** Sheds sparks at `at`, as many as the time since the last frame is worth. */
  emit(at: THREE.Vector3, dt: number): void {
    this.due += dt * TRAIL_RATE;
    while (this.due >= 1) {
      this.due -= 1;
      const i = this.next;
      this.next = (this.next + 1) % TRAIL;
      this.position.set([at.x + (Math.random() - 0.5) * 0.08, at.y + (Math.random() - 0.5) * 0.08, at.z + (Math.random() - 0.5) * 0.08], i * 3);
      this.velocity.set([(Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5], i * 3);
      this.age[i] = 0;
    }
  }

  /** Ages every spark; true while any is still showing. */
  update(dt: number): boolean {
    let alive = false;
    for (let i = 0; i < TRAIL; i++) {
      const age = (this.age[i]! += dt);
      const fade = age < TRAIL_LIFE ? 1 - age / TRAIL_LIFE : 0;
      if (fade > 0) {
        alive = true;
        this.position[i * 3]! += this.velocity[i * 3]! * dt;
        this.position[i * 3 + 1]! += this.velocity[i * 3 + 1]! * dt;
        this.position[i * 3 + 2]! += this.velocity[i * 3 + 2]! * dt;
      }
      this.color.set([this.base.r * fade, this.base.g * fade, this.base.b * fade], i * 3);
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    return alive;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

interface Shot {
  kind: ShotKind;
  from: THREE.Object3D;
  to: THREE.Object3D;
  /** Where on the target it strikes, above its feet. */
  strike: number;
  /** Where it left from, fixed at the loosing; the far end is read off the target as it moves. */
  start: THREE.Vector3;
  age: number;
  /** The arrow, or the bolt's glowing head. */
  body: THREE.Object3D;
  trail: Trail | null;
  landed: boolean;
}

/**
 * One-off effects in the world. A level-up throws a fountain of golden sparks up and out from the
 * character's chest in a loose spiral; they arc down, twinkle and fade. They ride on the character, so
 * they follow it if it walks off. A shot (PLAN Phase 11) is an arrow arcing to its target, or a spell's
 * bolt — a glowing head shedding sparks in its colour — and a flash of the same where it lands.
 */
export class Effects {
  private readonly bursts: Burst[] = [];
  private readonly shots: Shot[] = [];

  levelUp(on: THREE.Object3D): void {
    const position = new Float32Array(SPARKS * 3), color = new Float32Array(SPARKS * 3), velocity = new Float32Array(SPARKS * 3);
    const c = new THREE.Color();
    for (let i = 0; i < SPARKS; i++) {
      const turn = (i / SPARKS) * Math.PI * 6 + Math.random() * 0.4;
      const out = 0.7 + Math.random() * 1.3, up = 1.6 + Math.random() * 1.9;
      position.set([Math.cos(turn) * 0.12, CHEST + Math.random() * 0.15, Math.sin(turn) * 0.12], i * 3);
      velocity.set([Math.cos(turn) * out, up, Math.sin(turn) * out], i * 3);
      c.setHex(COLORS[i % COLORS.length]!);
      color.set([c.r, c.g, c.b], i * 3);
    }
    this.burst(on, position, color, velocity, SPARKS, 0.17, LIFE, GRAVITY, true);
  }

  /**
   * An arrow loosed or a spell cast from one entity at another. Both are the entities' roots in the
   * scene; `strike` is how high on the target it lands (about its chest). It crosses in a third of a
   * second however far it has to go, and the damage is the server's business, landing on its tick.
   */
  shot(from: THREE.Object3D, to: THREE.Object3D, kind: ShotKind, strike: number): void {
    const scene = from.parent;
    if (!scene) return;
    const start = from.position.clone().setY(from.position.y + CHEST);
    let body: THREE.Object3D, trail: Trail | null = null;
    if (kind === "arrow") {
      body = arrow();
    } else {
      const [heart, tail] = BOLT_COLORS[kind];
      body = head(heart);
      trail = new Trail(tail);
      scene.add(trail.points);
    }
    body.position.copy(start);
    scene.add(body);
    this.shots.push({ kind, from, to, strike, start, age: 0, body, trail, landed: false });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.age += dt;
      const material = b.points.material as THREE.PointsMaterial;
      if (b.age >= b.life) {
        b.points.removeFromParent();
        b.points.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.getAttribute("position") as THREE.BufferAttribute, v = b.velocity;
      for (let k = 0; k < b.count; k++) {
        v[k * 3 + 1]! -= b.gravity * dt;
        // A little drag, so the fountain opens out and then hangs before it falls.
        const drag = Math.max(0, 1 - 1.2 * dt);
        v[k * 3]! *= drag;
        v[k * 3 + 2]! *= drag;
        pos.setXYZ(k, pos.getX(k) + v[k * 3]! * dt, pos.getY(k) + v[k * 3 + 1]! * dt, pos.getZ(k) + v[k * 3 + 2]! * dt);
      }
      pos.needsUpdate = true;
      const t = b.age / b.life;
      material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (b.twinkle) material.size = 0.17 * (1 + 0.25 * Math.sin(b.age * 40));
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.age += dt;
      const t = Math.min(1, s.age / FLIGHT);
      const end = s.to.position.clone().setY(s.to.position.y + s.strike);
      const at = s.start.clone().lerp(end, t);
      if (s.kind === "arrow") at.y += ARC * Math.sin(t * Math.PI);
      if (!s.landed) {
        // An arrow points where it is going; a bolt's head just rides along and lays its trail.
        if (s.kind === "arrow") {
          const ahead = s.start.clone().lerp(end, Math.min(1, t + 0.05));
          ahead.y += ARC * Math.sin(Math.min(1, t + 0.05) * Math.PI);
          s.body.position.copy(at);
          s.body.lookAt(ahead);
        } else {
          s.body.position.copy(at);
          s.trail?.emit(at, dt);
        }
      }
      if (t >= 1 && !s.landed) {
        s.landed = true;
        s.body.removeFromParent();
        disposeAll(s.body);
        if (s.kind !== "arrow") this.flash(s.from.parent ?? s.to, end, BOLT_COLORS[s.kind]);
      }
      const trailing = s.trail ? s.trail.update(dt) : false;
      if (s.landed && !trailing) {
        s.trail?.dispose();
        this.shots.splice(i, 1);
      }
    }
  }

  /** The flash where a bolt lands: two dozen sparks out in every direction, gone in half a second. */
  private flash(scene: THREE.Object3D, at: THREE.Vector3, colors: [number, number, number]): void {
    const count = 24;
    const position = new Float32Array(count * 3), color = new Float32Array(count * 3), velocity = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const turn = Math.random() * Math.PI * 2, tilt = Math.random() * Math.PI - Math.PI / 2, speed = 1.2 + Math.random() * 1.6;
      position.set([at.x, at.y, at.z], i * 3);
      velocity.set([Math.cos(turn) * Math.cos(tilt) * speed, Math.sin(tilt) * speed + 0.6, Math.sin(turn) * Math.cos(tilt) * speed], i * 3);
      c.setHex(colors[i % 3]!);
      color.set([c.r, c.g, c.b], i * 3);
    }
    this.burst(scene, position, color, velocity, count, 0.2, 0.5, 1.5, false);
  }

  private burst(
    on: THREE.Object3D, position: Float32Array, color: Float32Array, velocity: Float32Array, count: number, size: number, life: number,
    gravity: number, twinkle: boolean,
  ): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
    const points = new THREE.Points(geometry, sparkMaterial(size));
    points.frustumCulled = false;
    on.add(points);
    this.bursts.push({ points, velocity, age: 0, life, gravity, count, twinkle });
  }
}

/** An arrow in flight: shaft, head and flights, along +z so `lookAt` aims it. */
function arrow(): THREE.Object3D {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: ARROW_WOOD }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: ARROW_HEAD }));
  tip.position.z = 0.35;
  const flight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.1), new THREE.MeshLambertMaterial({ color: ARROW_FLIGHT }));
  flight.position.z = -0.26;
  g.add(shaft, tip, flight);
  return g;
}

/** A bolt's head: one big glowing point in the spell's brightest colour. */
function head(color: number): THREE.Object3D {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const c = new THREE.Color(color);
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([c.r, c.g, c.b]), 3));
  const points = new THREE.Points(geometry, sparkMaterial(0.55));
  points.frustumCulled = false;
  return points;
}

function disposeAll(o: THREE.Object3D): void {
  o.traverse((child) => {
    const m = child as THREE.Mesh;
    m.geometry?.dispose();
    const material = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((x) => x.dispose());
    else material?.dispose();
  });
}
