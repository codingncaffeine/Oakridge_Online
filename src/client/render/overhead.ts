// The world seen straight down: what the radar and the world map are made of. A box of tiles is
// rendered from above with the scene's own lights into a picture at so many pixels a tile, so the map
// IS the game — every roof, canopy, road and shore exactly as it stands — rather than a drawing of it.
// Only what stands on the map layer is drawn: the ground, the objects and the roofs. People, creatures,
// items and effects stay off it and are drawn over the picture live.
import * as THREE from "three";
import type { Box } from "../../shared/map.ts";

/** The layer the map's camera sees. Lights and the built world enable it; everything that moves does not. */
export const MAP_LAYER = 1;

/** Puts an object and everything under it on the map layer. */
export function onMapLayer(object: THREE.Object3D): void {
  object.traverse((o) => o.layers.enable(MAP_LAYER));
}

/** How high the camera sits, and how far down it sees: above every roof, below every valley. */
const CAMERA_HEIGHT = 100;
const CAMERA_FAR = 240;

export class Overhead {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_FAR);
  /** One target per picture size, kept: making one is the expensive part. */
  private readonly targets = new Map<number, THREE.WebGLRenderTarget>();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera.layers.set(MAP_LAYER);
    // Straight down, with north (tile y, which is scene -z) at the top of the picture.
    this.camera.up.set(0, 0, -1);
  }

  /**
   * The tiles of `box` from above, `scale` pixels a tile. `extras` are put in the scene for the render
   * and taken out after: the ground and objects of a region the scene does not hold right now.
   */
  picture(box: Box, scale: number, extras: THREE.Object3D[] = []): HTMLCanvasElement {
    const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
    const W = w * scale, H = h * scale;
    const { renderer, scene, camera } = this;
    const target = this.target(W, H);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    const cx = (box.x0 + box.x1 + 1) / 2, cz = -(box.y0 + box.y1 + 1) / 2;
    camera.position.set(cx, CAMERA_HEIGHT, cz);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld();

    for (const o of extras) {
      onMapLayer(o);
      scene.add(o);
    }
    // No fog and no sky: the picture ends where the ground does.
    const fog = scene.fog, background = scene.background, clearAlpha = renderer.getClearAlpha();
    scene.fog = null;
    scene.background = null;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    const pixels = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(clearAlpha);
    scene.fog = fog;
    scene.background = background;
    for (const o of extras) scene.remove(o);

    // The rows come up from the bottom; a canvas runs down from the top.
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    const image = g.createImageData(W, H);
    for (let row = 0; row < H; row++) image.data.set(pixels.subarray(row * W * 4, (row + 1) * W * 4), (H - 1 - row) * W * 4);
    g.putImageData(image, 0, 0);
    return canvas;
  }

  private target(W: number, H: number): THREE.WebGLRenderTarget {
    const key = W * 65536 + H;
    let target = this.targets.get(key);
    if (!target) {
      target = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: false });
      // Written the way the screen is, so the picture's colours are the game's.
      target.texture.colorSpace = THREE.SRGBColorSpace;
      this.targets.set(key, target);
    }
    return target;
  }
}
