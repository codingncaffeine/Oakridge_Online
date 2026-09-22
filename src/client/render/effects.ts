import * as THREE from "three";

/** Sparks in one level-up, and how long they last (seconds). */
const SPARKS = 64;
const LIFE = 1.6;
/** Where the sparks start, above the feet (about chest height). */
const CHEST = 1.05;
const GRAVITY = 2.6;
const COLORS = [0xffe27a, 0xfff6cc, 0xffa53c, 0xffd23f, 0xa8e4ff];

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

interface Burst {
  points: THREE.Points;
  velocity: Float32Array;
  age: number;
}

/**
 * One-off effects in the world. A level-up throws a fountain of golden sparks up and out from the
 * character's chest in a loose spiral; they arc down, twinkle and fade. They ride on the character, so
 * they follow it if it walks off.
 */
export class Effects {
  private readonly bursts: Burst[] = [];

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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
    const material = new THREE.PointsMaterial({
      size: 0.17, map: glow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    on.add(points);
    this.bursts.push({ points, velocity, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.age += dt;
      const material = b.points.material as THREE.PointsMaterial;
      if (b.age >= LIFE) {
        b.points.removeFromParent();
        b.points.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.getAttribute("position") as THREE.BufferAttribute, v = b.velocity;
      for (let k = 0; k < SPARKS; k++) {
        v[k * 3 + 1]! -= GRAVITY * dt;
        // A little drag, so the fountain opens out and then hangs before it falls.
        const drag = Math.max(0, 1 - 1.2 * dt);
        v[k * 3]! *= drag;
        v[k * 3 + 2]! *= drag;
        pos.setXYZ(k, pos.getX(k) + v[k * 3]! * dt, pos.getY(k) + v[k * 3 + 1]! * dt, pos.getZ(k) + v[k * 3 + 2]! * dt);
      }
      pos.needsUpdate = true;
      const t = b.age / LIFE;
      material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      material.size = 0.17 * (1 + 0.25 * Math.sin(b.age * 40));
    }
  }
}
