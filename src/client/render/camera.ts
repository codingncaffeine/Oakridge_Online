import * as THREE from "three";

const PITCH_MIN = THREE.MathUtils.degToRad(22.5);
const PITCH_MAX = THREE.MathUtils.degToRad(67.5);
const DIST_MIN = 5;
const DIST_MAX = 22;
const KEY_YAW_SPEED = 2.4; // radians per second
const KEY_PITCH_SPEED = 1.2;
const DRAG_SPEED = 0.006; // radians per pixel

/** Orbits the player: arrow keys or middle-drag turn and tilt it, the wheel zooms. Yaw 0 looks north. */
export class OrbitCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = THREE.MathUtils.degToRad(36);
  distance = 10;
  /** Multiplies how fast the keys and dragging turn the camera (a player setting). */
  speed = 1;
  private readonly target = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private dragging: { x: number; y: number } | null = null;
  private snapped = false;

  constructor(dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    // Arrow keys turn the camera even while typing in the chat line (marked data-keys="camera"), not in other fields.
    const typing = (e: KeyboardEvent) => (e.target instanceof HTMLInputElement && e.target.dataset.keys !== "camera") || e.target instanceof HTMLTextAreaElement;
    window.addEventListener("keydown", (e) => {
      if (typing(e) || !e.key.startsWith("Arrow")) return;
      this.keys.add(e.key);
      e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key));
    window.addEventListener("blur", () => this.keys.clear());
    dom.addEventListener("pointerdown", (e) => {
      if (e.button !== 1) return;
      this.dragging = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    dom.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      // Grab-the-world feel: dragging right orbits the camera left, so the scene follows the cursor.
      this.yaw += (e.clientX - this.dragging.x) * DRAG_SPEED * this.speed;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.dragging.y) * DRAG_SPEED * this.speed, PITCH_MIN, PITCH_MAX);
      this.dragging = { x: e.clientX, y: e.clientY };
    });
    const endDrag = () => { this.dragging = null; };
    dom.addEventListener("pointerup", endDrag);
    dom.addEventListener("pointercancel", endDrag);
    dom.addEventListener("wheel", (e) => {
      this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(e.deltaY * 0.001), DIST_MIN, DIST_MAX);
      e.preventDefault();
    }, { passive: false });
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Follows `focus` (world position at the player's chest). */
  update(dt: number, focus: THREE.Vector3): void {
    if (this.keys.has("ArrowLeft")) this.yaw += KEY_YAW_SPEED * this.speed * dt;
    if (this.keys.has("ArrowRight")) this.yaw -= KEY_YAW_SPEED * this.speed * dt;
    if (this.keys.has("ArrowUp")) this.pitch = Math.min(PITCH_MAX, this.pitch + KEY_PITCH_SPEED * this.speed * dt);
    if (this.keys.has("ArrowDown")) this.pitch = Math.max(PITCH_MIN, this.pitch - KEY_PITCH_SPEED * this.speed * dt);
    if (!this.snapped) {
      this.target.copy(focus);
      this.snapped = true;
    } else {
      this.target.lerp(focus, 1 - Math.exp(-dt * 14));
    }
    // Looking north means standing south of the target; north is -z.
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x - Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }

  /** Jump straight to the focus on the next update (after a reconnect or teleport). */
  snap(): void {
    this.snapped = false;
  }
}
