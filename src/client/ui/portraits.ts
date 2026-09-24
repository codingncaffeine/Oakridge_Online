// Chat heads (PLAN Phase 9): the speaker's head in the dialogue box, rendered once from their own model
// — the same head, hair and jaw the world draws them with — into a small picture and kept, so it costs
// one render a person a session and nothing a frame.
import * as THREE from "three";
import { MONSTER_BY_KEY } from "../../shared/monsters.ts";
import { modelFor } from "../entity.ts";
import { GROUND_LIGHT, SKY_LIGHT, SUN_COLOR } from "../palette.ts";

/** The picture's size in pixels, and where the camera stands to frame a head and shoulders. */
const SIZE = 96;

export class Portraits {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 10);
  private readonly cache = new Map<string, string>();

  constructor() {
    this.camera.position.set(0.42, 1.52, 1.15);
    this.camera.lookAt(0, 1.4, 0);
    this.scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 1.9));
    const sun = new THREE.DirectionalLight(SUN_COLOR, 2.3);
    sun.position.set(-0.6, 1, 1.2);
    this.scene.add(sun);
  }

  /** The speaker's head as a PNG data URL, or null for a creature with no person's look. */
  of(npc: string): string | null {
    const had = this.cache.get(npc);
    if (had) return had;
    const def = MONSTER_BY_KEY.get(npc);
    if (!def?.look) return null;
    try {
      this.renderer ??= new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: true, alpha: true });
      this.renderer.setSize(SIZE, SIZE, false);
      const model = modelFor(npc, def.look, []);
      this.scene.add(model.root);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL("image/png");
      this.scene.remove(model.root);
      model.dispose();
      this.cache.set(npc, url);
      return url;
    } catch {
      // No WebGL for a second context: the box goes without a head, as it did before.
      return null;
    }
  }
}
