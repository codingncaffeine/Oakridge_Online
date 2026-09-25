import * as THREE from "three";
import { SPELL_BY_KEY, type Element, type Tier } from "../../shared/spells.ts";

// Spells in flight (the magic plan, §5): the reference's animations are the floor. Every spell gathers at
// the caster's hands, crosses to its target with a head and a trail in its element's manner, lights the
// ground it passes over, and lands with a hit that grows with its tier. Everything is pooled and built once
// — two particle pools (one glowing, one of smoke and dust), heads, rings, ground glows and ground marks —
// so a cast allocates nothing.

/** Where a spell leaves the caster, above their feet: the hands, about chest height. */
const HANDS = 1.05;
/** How long the cast takes to wind up before the spell leaves the hands: the cast pose's release (poses.ts). */
export const CAST_WINDUP = 0.35;
const Z_AXIS = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

/** Each element's colours: the heart (brightest), the body, the edge, and what it sheds (motes, droplets, grit, sparks). */
const FX: Record<Element, { heart: number; body: number; edge: number; shed: number; dust: number }> = {
  gale: { heart: 0xffffff, body: 0xd8e0ea, edge: 0x8a96a8, shed: 0xf2f6fc, dust: 0xc8ccd4 },
  tide: { heart: 0xb8e2ff, body: 0x2f78ff, edge: 0x14307a, shed: 0x6ab8ff, dust: 0x6a8ab4 },
  stone: { heart: 0xf4dc98, body: 0xa8742c, edge: 0x5a3e1c, shed: 0x6a5434, dust: 0x9a8a66 },
  ember: { heart: 0xffe08a, body: 0xff5a14, edge: 0xb02a10, shed: 0xffa030, dust: 0x4a4440 },
};

/** Each tier's weight: seconds to cross, head size, trail rate, hit sizes, trailing rings, and whether it marks the ground. */
const TIERS: Record<Tier, { flight: number; head: number; trail: number; burst: number; shards: number; rings: number; flash: number; spread: number; mark: boolean }> = {
  shot: { flight: 0.36, head: 0.34, trail: 70, burst: 16, shards: 0, rings: 0, flash: 0.7, spread: 0.7, mark: false },
  lance: { flight: 0.34, head: 0.4, trail: 100, burst: 24, shards: 8, rings: 0, flash: 0.9, spread: 0.9, mark: false },
  crash: { flight: 0.32, head: 0.46, trail: 130, burst: 36, shards: 12, rings: 0, flash: 1.5, spread: 1.15, mark: false },
  storm: { flight: 0.4, head: 0.56, trail: 150, burst: 54, shards: 14, rings: 16, flash: 1.7, spread: 1.35, mark: false },
  fury: { flight: 0.42, head: 0.7, trail: 190, burst: 80, shards: 18, rings: 22, flash: 2.1, spread: 1.6, mark: true },
};

const VERTEX = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float scale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = alpha > 0.0 ? size * scale / -mv.z : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 1.7) * vAlpha;
    gl_FragColor = vec4(vColor * soft, soft);
  }
`;
const DUST_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - r * r) * vAlpha);
  }
`;

/** A pool of points that live a while and fade: glowing ones add their light, dust and smoke cover what is behind. */
class Particles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly start: Float32Array;
  private readonly base: Float32Array;
  private readonly grow: Float32Array;
  private readonly count: number;
  private next = 0;
  private live = 0;

  constructor(count: number, glow: boolean) {
    this.count = count;
    this.position = new Float32Array(count * 3);
    this.color = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    this.velocity = new Float32Array(count * 3);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count).fill(1);
    this.gravity = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.start = new Float32Array(count);
    this.base = new Float32Array(count);
    this.grow = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } }, vertexShader: VERTEX, fragmentShader: glow ? GLOW_FRAGMENT : DUST_FRAGMENT,
      transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = glow ? 3 : 2;
    const drawn = new THREE.Vector2();
    // A point's size is in world units: the drawing's height over the camera's view at unit distance.
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(drawn);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
      this.material.uniforms.scale!.value = drawn.y / (2 * Math.tan((fov * Math.PI) / 360));
    };
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, gravity = 0, drag = 0, alpha = 1, grow = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.position.set([x, y, z], i * 3);
    this.velocity.set([vx, vy, vz], i * 3);
    this.color.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.base[i] = size;
    this.grow[i] = grow;
    this.age[i] = 0;
    this.life[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.start[i] = alpha;
    this.alpha[i] = alpha;
    this.live = this.count;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.alpha[i] === 0) continue;
      const age = (this.age[i]! += dt), life = this.life[i]!;
      if (age >= life) {
        this.alpha[i] = 0;
        continue;
      }
      any = true;
      const k = i * 3, keep = Math.max(0, 1 - this.drag[i]! * dt);
      this.velocity[k]! *= keep;
      this.velocity[k + 2]! *= keep;
      this.velocity[k + 1] = this.velocity[k + 1]! * keep - this.gravity[i]! * dt;
      this.position[k]! += this.velocity[k]! * dt;
      this.position[k + 1]! += this.velocity[k + 1]! * dt;
      this.position[k + 2]! += this.velocity[k + 2]! * dt;
      const t = age / life;
      this.alpha[i] = this.start[i]! * (t < 0.2 ? 1 : 1 - (t - 0.2) / 0.8);
      if (this.grow[i]! > 0) this.size[i] = this.base[i]! * (1 + this.grow[i]! * t);
    }
    if (!any) this.live = 0;
    const g = this.points.geometry;
    for (const name of ["position", "alpha"]) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A soft round glow drawn once: what a ground glow and a ring's shine are painted with. */
function glowTexture(): THREE.Texture {
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const g = canvas.getContext("2d")!;
  const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.35, "rgba(255,255,255,0.45)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** The mark a Fury leaves on the ground for a moment, painted once per element: a scorch, a splash, cracks, a swirl. */
function markTexture(element: Element): THREE.Texture {
  const canvas = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
  const g = canvas.getContext("2d")!;
  const rnd = (n: number) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };
  if (element === "ember") {
    const burn = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    burn.addColorStop(0, "rgba(20,12,8,0.95)");
    burn.addColorStop(0.55, "rgba(40,22,12,0.8)");
    burn.addColorStop(0.8, "rgba(200,70,20,0.55)");
    burn.addColorStop(1, "rgba(200,70,20,0)");
    g.fillStyle = burn;
    g.fillRect(0, 0, 128, 128);
  } else if (element === "tide") {
    g.fillStyle = "rgba(18,40,80,0.55)";
    for (let i = 0; i < 14; i++) {
      const a = rnd(i) * Math.PI * 2, r = 10 + rnd(i + 20) * 44, s = 4 + rnd(i + 40) * 12;
      g.beginPath();
      g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(64, 64, 30, 0, Math.PI * 2);
    g.fill();
  } else if (element === "stone") {
    g.strokeStyle = "rgba(40,30,18,0.85)";
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + rnd(i) * 0.4, x = 64, y = 64;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        a += (rnd(i * 7 + s) - 0.5) * 0.7;
        x += Math.cos(a) * 11;
        y += Math.sin(a) * 11;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else {
    g.strokeStyle = "rgba(240,244,250,0.6)";
    g.lineWidth = 4;
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let s = 0; s <= 40; s++) {
        const a = arm * ((Math.PI * 2) / 3) + s * 0.12, r = 6 + s * 1.3;
        g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

/** A spiked ball: a Storm's or a Fury's head, spikes out along twelve directions. */
function spikedBall(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dirs = new THREE.IcosahedronGeometry(1, 0).getAttribute("position");
  const seen = new Set<string>();
  for (let i = 0; i < dirs.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
    const key = `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cone = new THREE.ConeGeometry(0.22, 1, 5);
    cone.translate(0, 0.5, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
    parts.push(cone);
  }
  parts.push(new THREE.IcosahedronGeometry(0.42, 1));
  return mergeGeometries(parts);
}

/** Joins non-indexed copies of geometries into one, position only (these are drawn flat, in one colour). */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const total = flat.reduce((n, p) => n + p.getAttribute("position").count, 0);
  const out = new Float32Array(total * 3);
  let at = 0;
  for (const p of flat) {
    out.set(p.getAttribute("position").array as Float32Array, at);
    at += p.getAttribute("position").count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  return g;
}

/** A pool of meshes, each with its own material so each can fade on its own. */
class Pool<T extends THREE.Object3D> {
  private readonly free: T[] = [];
  constructor(make: () => T, count: number, group: THREE.Group) {
    for (let i = 0; i < count; i++) {
      const o = make();
      o.visible = false;
      group.add(o);
      this.free.push(o);
    }
  }
  take(): T | null {
    const o = this.free.pop() ?? null;
    if (o) o.visible = true;
    return o;
  }
  give(o: T): void {
    o.visible = false;
    this.free.push(o);
  }
}

interface Missile {
  from: THREE.Object3D;
  element: Element;
  tier: Tier;
  to: THREE.Object3D;
  strike: number;
  start: THREE.Vector3;
  startGround: number;
  age: number;
  /** Seconds of wind-up left before it leaves the hands. */
  windup: number;
  head: THREE.Mesh | null;
  glow: THREE.Mesh | null;
  ringDue: number;
  spin: number;
}
interface Fading {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  from: number;
  to: number;
  opacity: number;
  pool: Pool<THREE.Mesh>;
}

/**
 * The spells in flight and what they leave behind. `cast` is told who cast what at whom (entity roots in
 * the scene); `update` steps everything each frame.
 */
export class SpellFx {
  /** A spell landed: the sound of its element's hit (light, or heavy for a Storm or a Fury), where, and who cast it. */
  onLand: (sound: string, x: number, z: number, from: THREE.Object3D) => void = () => {};
  private readonly group = new THREE.Group();
  private readonly glow = new Particles(4096, true);
  private readonly dust = new Particles(1536, false);
  private readonly spikes: Pool<THREE.Mesh>;
  private readonly balls: Pool<THREE.Mesh>;
  private readonly rings: Pool<THREE.Mesh>;
  private readonly glows: Pool<THREE.Mesh>;
  private readonly marks: Pool<THREE.Mesh>;
  private readonly markMaps: Record<Element, THREE.Texture>;
  private readonly missiles: Missile[] = [];
  private readonly fading: Fading[] = [];
  private readonly c = new THREE.Color();
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  constructor() {
    this.group.name = "spellfx";
    this.group.add(this.glow.points, this.dust.points);
    const additive = (color = 0xffffff, map: THREE.Texture | null = null) =>
      new THREE.MeshBasicMaterial({ color, map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // The heads and the rings are solid in the element's colour, so a spell reads by its colour over any
    // ground; the glow round them is the particles' (additive) work.
    const solid = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
    const spike = new THREE.OctahedronGeometry(1, 0).scale(0.28, 0.28, 1);
    this.spikes = new Pool(() => new THREE.Mesh(spike, solid()), 16, this.group);
    const ball = spikedBall();
    this.balls = new Pool(() => new THREE.Mesh(ball, solid()), 10, this.group);
    const ring = new THREE.TorusGeometry(1, 0.07, 6, 36);
    this.rings = new Pool(() => new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })), 80, this.group);
    const soft = glowTexture();
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.glows = new Pool(() => new THREE.Mesh(flat, additive(0xffffff, soft)), 24, this.group);
    this.markMaps = { gale: markTexture("gale"), tide: markTexture("tide"), stone: markTexture("stone"), ember: markTexture("ember") };
    this.marks = new Pool(() => new THREE.Mesh(flat, new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })), 6, this.group);
  }

  /** Whether a shot's kind is a spell this module draws. */
  static draws(kind: string): boolean {
    return SPELL_BY_KEY.has(kind);
  }

  /** Seconds from the cast to the spell reaching its target: the wind-up, then the flight. */
  static arrival(kind: string): number {
    const spell = SPELL_BY_KEY.get(kind);
    return spell ? CAST_WINDUP + TIERS[spell.tier].flight : 0;
  }

  /** A spell cast from one entity at another: `strike` is how high on the target it lands. */
  cast(from: THREE.Object3D, to: THREE.Object3D, kind: string, strike: number): void {
    const spell = SPELL_BY_KEY.get(kind);
    const scene = from.parent;
    if (!spell || !scene) return;
    if (this.group.parent !== scene) scene.add(this.group);
    const start = from.position.clone().setY(from.position.y + HANDS);
    // Out in front of the caster's chest, toward the target.
    this.v.subVectors(to.position, from.position).setY(0);
    if (this.v.lengthSq() > 0) start.addScaledVector(this.v.normalize(), 0.3);
    const tier = TIERS[spell.tier];
    this.gather(start, spell.element, spell.tier);
    let head: THREE.Mesh | null = null;
    if (spell.tier === "lance" || spell.tier === "crash") head = this.spikes.take();
    else if (spell.tier === "storm" || spell.tier === "fury") head = this.balls.take();
    if (head) {
      head.visible = false;
      (head.material as THREE.MeshBasicMaterial).color.setHex(FX[spell.element].body);
      const s = tier.head * (spell.tier === "crash" ? 0.75 : spell.tier === "lance" ? 0.55 : 0.36);
      head.scale.set(s, s, spell.tier === "crash" ? s * 1.9 : s);
      head.position.copy(start);
    }
    const glow = this.glows.take();
    if (glow) {
      glow.visible = false;
      (glow.material as THREE.MeshBasicMaterial).color.setHex(FX[spell.element].body);
    }
    this.missiles.push({
      from, element: spell.element, tier: spell.tier, to, strike, start, startGround: from.position.y, age: 0, windup: CAST_WINDUP, head, glow, ringDue: 0, spin: Math.random() * Math.PI * 2,
    });
  }

  /** Motes drawn in to the hands from all round over the wind-up, meeting there as the spell leaves. */
  private gather(at: THREE.Vector3, element: Element, tier: Tier): void {
    const t = TIERS[tier], n = Math.round(10 + t.head * 36);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 0.4 + Math.random() * 0.3;
      const dx = Math.sin(b) * Math.cos(a) * r, dy = Math.cos(b) * r, dz = Math.sin(b) * Math.sin(a) * r;
      this.c.setHex(i % 3 === 0 ? FX[element].heart : FX[element].body);
      this.glow.spawn(at.x + dx, at.y + dy, at.z + dz, -dx / CAST_WINDUP, -dy / CAST_WINDUP, -dz / CAST_WINDUP, this.c, 0.1 + t.head * 0.18, CAST_WINDUP);
    }
  }

  update(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      // Winding up: the motes are gathering at the hands; at the release a flash there, and it leaves.
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup > 0) {
          const k = 1 - m.windup / CAST_WINDUP;
          this.c.setHex(FX[m.element].body);
          this.glow.spawn(m.start.x, m.start.y, m.start.z, 0, 0, 0, this.c, TIERS[m.tier].head * (0.4 + 1.6 * k), 0.05, 0, 0, 0.8);
          continue;
        }
        this.c.setHex(FX[m.element].heart);
        this.glow.spawn(m.start.x, m.start.y, m.start.z, 0, 0, 0, this.c, TIERS[m.tier].head * 1.3, 0.16);
        if (m.head) m.head.visible = true;
        if (m.glow) m.glow.visible = true;
      }
      m.age += dt;
      const tier = TIERS[m.tier], fx = FX[m.element];
      const t = Math.min(1, m.age / tier.flight);
      const end = this.w.copy(m.to.position).setY(m.to.position.y + m.strike);
      const at = this.v.copy(m.start).lerp(end, t);
      if (m.tier === "storm" || m.tier === "fury") at.y += 0.3 * Math.sin(t * Math.PI);
      this.axis.subVectors(end, m.start).normalize();
      // The head: a spike turning end over end as it spins, or a spiked ball rolling.
      if (m.head) {
        m.head.position.copy(at);
        m.head.lookAt(end);
        m.spin += dt * (m.tier === "lance" ? 22 : 9);
        m.head.rotateZ(m.spin);
        if (m.tier === "storm" || m.tier === "fury") m.head.rotateX(m.spin * 0.7);
      }
      // A bright heart riding at the front of it all.
      this.c.setHex(fx.body);
      if (!m.head) this.dust.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.head * 1.1, 0.05, 0, 0, 0.95);
      this.glow.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.head * 2.4, 0.06, 0, 0, 0.9);
      this.c.setHex(fx.heart);
      this.glow.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.head * 0.6, 0.06);
      this.trail(m, at, dt);
      // The ground under it lit as it passes, the brighter the nearer it flies.
      const ground = m.startGround + (m.to.position.y - m.startGround) * t;
      if (m.glow) {
        m.glow.position.set(at.x, ground + 0.03, at.z);
        const s = 0.9 + tier.head * 2;
        m.glow.scale.set(s, 1, s);
        (m.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, 1 - (at.y - ground) / 3);
      }
      // A Storm and a Fury leave rings behind them that open out as they fall back.
      if (tier.rings > 0 && (m.ringDue -= dt) <= 0) {
        m.ringDue = 1 / tier.rings;
        this.ring(at, this.axis, fx.body, 0.12, 0.5 * tier.spread, 0.32, 0.8, false);
      }
      if (t >= 1) {
        this.land(m, at.clone(), ground);
        if (m.head) this.pool(m.tier).give(m.head);
        if (m.glow) this.glows.give(m.glow);
        this.missiles.splice(i, 1);
      }
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i]!;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.pool.give(f.mesh);
        this.fading.splice(i, 1);
        continue;
      }
      const s = f.from + (f.to - f.from) * (1 - (1 - t) * (1 - t));
      f.mesh.scale.set(s, s, s);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.opacity * (1 - t);
    }
    this.glow.update(dt);
    this.dust.update(dt);
  }

  private pool(tier: Tier): Pool<THREE.Mesh> {
    return tier === "lance" || tier === "crash" ? this.spikes : this.balls;
  }

  /** What each element sheds behind it: gale curls of air, tide droplets that fall, stone grit and dust, ember sparks and smoke. */
  private trail(m: Missile, at: THREE.Vector3, dt: number): void {
    const tier = TIERS[m.tier], fx = FX[m.element];
    const n = Math.max(1, Math.round(tier.trail * dt));
    const r = () => Math.random() - 0.5;
    for (let k = 0; k < n; k++) {
      switch (m.element) {
        case "gale": {
          // Streaks that curl round the line of flight.
          const a = m.age * 30 + k * 2.1, off = 0.12 + tier.head * 0.25;
          const ox = Math.cos(a) * off, oy = Math.sin(a) * off;
          this.c.setHex(k % 2 === 0 ? fx.shed : fx.body);
          this.glow.spawn(at.x + ox * this.axis.z, at.y + oy, at.z - ox * this.axis.x, -oy * 2 + r() * 0.3, ox * 2, r() * 0.3, this.c, 0.07 + tier.head * 0.08, 0.28, 0, 2);
          break;
        }
        case "tide":
          this.c.setHex(k % 3 === 0 ? fx.heart : fx.shed);
          this.glow.spawn(at.x + r() * 0.1, at.y + r() * 0.1, at.z + r() * 0.1, r() * 1.2, 0.4 + Math.random() * 0.8, r() * 1.2, this.c, 0.05 + tier.head * 0.07, 0.5, 5);
          break;
        case "stone":
          this.c.setHex(fx.shed);
          this.dust.spawn(at.x + r() * 0.12, at.y + r() * 0.12, at.z + r() * 0.12, r() * 1.4, 0.3 + Math.random() * 0.8, r() * 1.4, this.c, 0.05 + tier.head * 0.05, 0.6, 7);
          if (k % 2 === 0) {
            this.c.setHex(fx.dust);
            this.dust.spawn(at.x, at.y, at.z, r() * 0.3, 0.2, r() * 0.3, this.c, 0.2 + tier.head * 0.3, 0.8, -0.2, 1, 0.16, 2.6);
          }
          break;
        case "ember":
          this.c.setHex(k % 2 === 0 ? fx.shed : fx.heart);
          this.glow.spawn(at.x + r() * 0.1, at.y + r() * 0.1, at.z + r() * 0.1, r() * 0.9, 0.5 + Math.random() * 1.2, r() * 0.9, this.c, 0.05 + tier.head * 0.06, 0.35, -0.5);
          if (k % 2 === 0) {
            this.c.setHex(fx.dust);
            this.dust.spawn(at.x, at.y, at.z, r() * 0.2, 0.5, r() * 0.2, this.c, 0.18 + tier.head * 0.3, 1, -0.3, 1, 0.12, 3);
          }
          break;
      }
    }
  }

  /** The hit: a flash, a burst in the element's manner, shards, a ring along the ground, and a Fury's mark. */
  private land(m: Missile, at: THREE.Vector3, ground: number): void {
    const tier = TIERS[m.tier], fx = FX[m.element];
    this.onLand(m.tier === "storm" || m.tier === "fury" ? `${m.element}_big` : m.element, at.x, at.z, m.from);
    const r = () => Math.random() - 0.5;
    this.c.setHex(fx.body);
    this.dust.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.flash * 0.9, 0.18, 0, 0, 0.85, 0.8);
    this.glow.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.flash * 2.2, 0.26, 0, 0, 0.9);
    this.c.setHex(fx.heart);
    this.glow.spawn(at.x, at.y, at.z, 0, 0, 0, this.c, tier.flash, 0.16);
    for (let k = 0; k < tier.burst; k++) {
      const a = Math.random() * Math.PI * 2, up = Math.random() * 1.6 - 0.3, speed = (1 + Math.random() * 1.8) * tier.spread;
      const vx = Math.cos(a) * speed, vz = Math.sin(a) * speed, vy = up * speed;
      switch (m.element) {
        case "gale":
          this.c.setHex(k % 2 === 0 ? fx.heart : fx.shed);
          this.glow.spawn(at.x, at.y, at.z, vx * 1.3, vy * 0.4, vz * 1.3, this.c, 0.08 + Math.random() * 0.08, 0.4, 0, 3);
          break;
        case "tide":
          this.c.setHex(k % 3 === 0 ? fx.heart : fx.shed);
          this.glow.spawn(at.x, at.y, at.z, vx * 0.8, Math.abs(vy) + 1.2, vz * 0.8, this.c, 0.07 + Math.random() * 0.07, 0.7, 6);
          break;
        case "stone":
          this.c.setHex(fx.shed);
          this.dust.spawn(at.x, at.y, at.z, vx * 0.9, Math.abs(vy) + 0.8, vz * 0.9, this.c, 0.07 + Math.random() * 0.08, 0.8, 8);
          break;
        case "ember":
          this.c.setHex(k % 2 === 0 ? fx.shed : fx.heart);
          this.glow.spawn(at.x, at.y, at.z, vx, vy + 0.6, vz, this.c, 0.07 + Math.random() * 0.07, 0.55, 1.2, 1.5);
          break;
      }
    }
    // Shards: bright splinters flung out flat, the Lance's and everything above it.
    for (let k = 0; k < tier.shards; k++) {
      const a = (k / tier.shards) * Math.PI * 2, speed = 2.4 * tier.spread;
      this.c.setHex(fx.body);
      this.glow.spawn(at.x, at.y, at.z, Math.cos(a) * speed, r() * 0.6, Math.sin(a) * speed, this.c, 0.14, 0.3, 0, 4);
    }
    // Dust or smoke rolling out where the heavier elements land.
    if (m.element === "stone" || m.element === "ember") {
      this.c.setHex(fx.dust);
      for (let k = 0; k < Math.round(tier.burst / 4); k++) {
        this.dust.spawn(at.x + r() * 0.3, ground + 0.2 + Math.random() * 0.4, at.z + r() * 0.3, r() * 1.2, 0.3 + Math.random() * 0.4, r() * 1.2, this.c, 0.35 + tier.head * 0.5, 1.3, -0.1, 1.2, 0.35, 1.6);
      }
    }
    // A ring along the ground, pushed out by the hit.
    this.w.set(0, 1, 0);
    this.ring(this.v.set(at.x, ground + 0.06, at.z), this.w, fx.body, 0.2, 0.9 * tier.spread, 0.45, 0.9, true);
    // The ground lit round the target for the moment of the hit.
    const flash = this.glows.take();
    if (flash) {
      (flash.material as THREE.MeshBasicMaterial).color.setHex(fx.body);
      flash.position.set(at.x, ground + 0.04, at.z);
      this.fading.push({ mesh: flash, age: 0, life: 0.35, from: 1.2 * tier.flash, to: 2.2 * tier.flash, opacity: 0.8, pool: this.glows });
    }
    if (tier.mark) {
      const mark = this.marks.take();
      if (mark) {
        const material = mark.material as THREE.MeshBasicMaterial;
        material.map = this.markMaps[m.element];
        material.needsUpdate = true;
        mark.position.set(at.x, ground + 0.02, at.z);
        mark.rotation.y = Math.random() * Math.PI * 2;
        this.fading.push({ mesh: mark, age: 0, life: 1.4, from: 1.6, to: 1.8, opacity: 0.95, pool: this.marks });
      }
    }
  }

  /** A ring at `at` facing along `normal`, opening from one radius to another as it fades. */
  private ring(at: THREE.Vector3, normal: THREE.Vector3, color: number, from: number, to: number, life: number, opacity: number, flat: boolean): void {
    const mesh = this.rings.take();
    if (!mesh) return;
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.position.copy(at);
    mesh.quaternion.setFromUnitVectors(Z_AXIS, flat ? UP : normal);
    this.fading.push({ mesh, age: 0, life, from, to, opacity, pool: this.rings });
  }
}
