// The sky (PLAN Phase 16): a dome drawn in code round the camera — a gradient from horizon to zenith,
// the sun and its glow, the moon, stars, and a layer of cloud drifting on the wind — under a day that
// turns on the world's clock, so every player sees the same sky at the same moment; the weather over
// the player's ground, read off the same clock; the rain that falls in it; and the lights and the fog,
// which follow the hour and the weather, so a village at dusk and a village in rain are two pictures.
// Below ground there is no sky, and the cave's own lights and fog stand (PLAN §8.5).
import * as THREE from "three";
import {
  daylight, dayPhase, kindOf, lightningAt, moonDirection, nightness, sunDirection, weatherAt, type Weather,
} from "../../shared/sky.ts";
import {
  CAVE_FOG_FAR, CAVE_FOG_NEAR, CAVE_SKY_INTENSITY, CAVE_SUN_INTENSITY, CLOUD_DAY, CLOUD_NIGHT, FOG_COLOR, FOG_FAR, FOG_NEAR, GROUND_LIGHT,
  MIST_COLOR, MIST_FOG_FAR, MIST_FOG_NEAR, NIGHT_SKY_INTENSITY, NIGHT_SUN_INTENSITY, RAIN_COLOR, SKY_INTENSITY, SKY_LIGHT, STORM_CLOUD,
  SUN_COLOR, SUN_FROM, SUN_INTENSITY,
} from "../palette.ts";
import { mix, rgb, skyAt, type Rgb } from "./skycolours.ts";

/** The dome's radius: inside the game camera's far plane, and far past the fog. */
const DOME_RADIUS = 150;
/** The rain: how many streaks fall round the player, over how many tiles across, from how high. */
const RAIN_DROPS = 2200;
const RAIN_BOX = 28;
const RAIN_HEIGHT = 16;
/** The sun's light never comes from under this height over the horizon, or every wall would be black by evening. */
const LOWEST_SUN = 0.22;
/** How much a flash of lightning adds to the light from the sky. */
const FLASH_LIGHT = 3;

const DOME_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The dome's colour by direction: the gradient, the sun's disc and glow, the moon, a field of stars
 * that shows as the night comes up, and cloud as a drifting layer of noise that thickens with the cover.
 */
const DOME_FRAGMENT = `
precision highp float;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 cloudColor;
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform float night;
uniform float cover;
uniform float flash;
uniform float time;
uniform vec2 wind;
varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  // A band of haze the fog's own colour for the first few degrees over the horizon, so what the fog has
  // taken (a far tree's few pixels) vanishes into the sky rather than showing pale against the blue.
  float t = clamp((up - 0.1) / 0.9, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(t, 0.55));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (smoothstep(0.9990, 0.9996, s) * 1.6 + pow(s, 10.0) * 0.16) * (1.0 - night);
  float m = max(dot(d, moonDir), 0.0);
  col += vec3(0.86, 0.9, 1.0) * smoothstep(0.99935, 0.9997, m) * night;
  vec2 sp = vec2(atan(d.x, d.z) * 24.0, asin(clamp(d.y, -1.0, 1.0)) * 40.0);
  vec2 cell = floor(sp);
  float star = step(0.985, hash(cell)) * smoothstep(0.32, 0.06, length(fract(sp) - 0.5)) * (0.5 + 0.5 * hash(cell + 7.0));
  col += vec3(star) * night * smoothstep(0.03, 0.2, up);
  vec2 cp = d.xz / max(d.y, 0.08) * 0.4 + wind * time * 0.012;
  float cl = fbm(cp);
  float cloud = smoothstep(1.0 - cover * 1.15, 1.0 - cover * 0.4 + 0.001, cl) * smoothstep(0.0, 0.14, up) * step(0.005, cover);
  col = mix(col, cloudColor, cloud);
  col += vec3(0.9, 0.92, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * The rain: every streak's place is worked out here from its seed, the time and where the player is,
 * fixed in the world and wrapping round the player's box, so nothing on the CPU moves a drop. A seed
 * past the rain's level puts its streak off screen.
 */
const RAIN_VERTEX = `
attribute float seed;
attribute float tip;
uniform float time;
uniform float level;
uniform vec3 anchor;
uniform vec2 slant;
float h(float s) {
  return fract(sin(s * 12.9898 + 78.233) * 43758.5453);
}
void main() {
  float box = ${RAIN_BOX.toFixed(1)}, height = ${RAIN_HEIGHT.toFixed(1)};
  if (h(seed + 5.1) > level) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float x = anchor.x - box * 0.5 + mod(h(seed) * box - anchor.x, box);
  float z = anchor.z - box * 0.5 + mod(h(seed + 1.3) * box - anchor.z, box);
  float speed = 13.0 + 6.0 * h(seed + 2.1);
  float y = mod(h(seed + 3.7) * height - time * speed, height);
  float t = y / height;
  vec3 p = vec3(x + slant.x * t, anchor.y + y - tip * 0.5, z + slant.y * t);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const RAIN_FRAGMENT = `
precision highp float;
uniform vec3 color;
uniform float alpha;
void main() {
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

const CLEAR: Weather = { kind: "clear", cover: 0, rain: 0, mist: 0, storm: 0, wind: [0, 0] };

const set = (c: THREE.Color, v: Rgb): THREE.Color => c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);

export class Sky {
  /** The dome and the rain: put in the scene, and hidden below ground. */
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly rain: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly scene: THREE.Scene;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly fog: THREE.Fog;
  /** The world's clock, as how far the server's is from this machine's. */
  private offset = 0;
  /** A preview or a check draws this hour and this weather instead of the clock's. */
  forcedPhase: number | null = null;
  forcedWeather: Partial<Weather> | null = null;
  forcedFlash: number | null = null;
  /** The player's brightness setting. */
  brightness = 1;
  /** The fog's reach above ground: the game's, or pushed out for a preview that shows a whole site. */
  fogRange: [number, number] = [FOG_NEAR, FOG_FAR];
  /** What was last drawn, for the caption and the report. */
  phase = 0;
  weather: Weather = CLEAR;
  flash = 0;
  below = false;
  /** The sounds: how hard it is raining (every frame), and a clap of thunder (once each). */
  onRain: (level: number) => void = () => {};
  onThunder: (loudness: number) => void = () => {};
  private thunderDone = 0;
  private time = 0;

  constructor(scene: THREE.Scene, hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight, fog: THREE.Fog) {
    this.scene = scene;
    this.hemi = hemi;
    this.sun = sun;
    this.fog = fog;
    const domeMaterial = new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
        cloudColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
        night: { value: 0 }, cover: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, wind: { value: new THREE.Vector2() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 18), domeMaterial);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    const seeds = new Float32Array(RAIN_DROPS * 2), tips = new Float32Array(RAIN_DROPS * 2);
    for (let i = 0; i < RAIN_DROPS; i++) {
      seeds[i * 2] = seeds[i * 2 + 1] = i * 0.731 + 0.17;
      tips[i * 2 + 1] = 1;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
    rainGeometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
    rainGeometry.setAttribute("tip", new THREE.Float32BufferAttribute(tips, 1));
    const rainMaterial = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      uniforms: {
        time: { value: 0 }, level: { value: 0 }, anchor: { value: new THREE.Vector3() }, slant: { value: new THREE.Vector2() },
        color: { value: new THREE.Color(RAIN_COLOR) }, alpha: { value: 0.4 },
      },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.rain = new THREE.LineSegments(rainGeometry, rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.dome, this.rain);
  }

  /** The server said what time it is: the sky keeps to that clock from here on. */
  syncClock(serverNow: number): void {
    this.offset = serverNow - Date.now();
  }

  /** The world's time now, on the server's clock. */
  now(): number {
    return Date.now() + this.offset;
  }

  /**
   * Draws the sky for this frame: the dome round the camera, the rain round the player, and the lights
   * and the fog set for the hour and the weather over the player's ground. Below ground, the cave's own.
   */
  update(dt: number, cameraPosition: THREE.Vector3, focus: THREE.Vector3, plane: number): void {
    this.time += dt;
    const now = this.now();
    const phase = this.forcedPhase ?? dayPhase(now);
    this.phase = phase;
    const read = weatherAt(focus.x, -focus.z, now);
    const weather = this.forcedWeather ? { ...read, ...this.forcedWeather } : read;
    if (this.forcedWeather) weather.kind = kindOf(weather);
    this.weather = weather;
    this.below = plane < 0;
    this.group.visible = !this.below;
    if (this.below) {
      this.lightUnderground();
      this.flash = 0;
      this.onRain(0);
      return;
    }
    const c = skyAt(phase);
    const day = daylight(phase), night = nightness(phase);
    const { cover, rain, mist, storm } = weather;
    const lightning = lightningAt(now, storm);
    const flash = this.forcedFlash ?? lightning.flash;
    this.flash = flash;

    // The sun's light: from the sun by day and the moon by night, never from under the horizon.
    const sunDir = sunDirection(phase), moonDir = moonDirection(phase);
    const from = day >= night ? sunDir : moonDir;
    this.sun.position.set(from[0], Math.max(from[1], LOWEST_SUN), from[2]).normalize();
    const dim = 1 - 0.45 * cover - 0.25 * storm;
    set(this.sun.color, mix(c.sun, rgb(SKY_KEYS_NIGHT_SUN), night));
    this.sun.intensity = this.brightness * (SUN_INTENSITY * day * dim + NIGHT_SUN_INTENSITY * night * (1 - 0.5 * cover));

    // The light from the sky, greyed by cloud; from the ground, the hour's; and a flash on top of both.
    const cloudCol = mix(mix(rgb(CLOUD_DAY), rgb(CLOUD_NIGHT), night), rgb(STORM_CLOUD), Math.max(storm, rain * 0.6));
    set(this.hemi.color, mix(c.sky, cloudCol, cover * 0.5));
    set(this.hemi.groundColor, c.ground);
    this.hemi.intensity = this.brightness * (SKY_INTENSITY * day * (1 - 0.25 * cover) + NIGHT_SKY_INTENSITY * night) + FLASH_LIGHT * flash;

    // The fog: the horizon's colour, greyed by cloud, whitened and drawn in by mist, drawn in a little by rain.
    let fogCol = mix(c.horizon, cloudCol, cover * 0.7);
    fogCol = mix(fogCol, mix(rgb(MIST_COLOR), rgb(CLOUD_NIGHT), night * 0.8), mist);
    const [near, far] = this.fogRange;
    this.fog.near = near + (MIST_FOG_NEAR - near) * mist;
    this.fog.far = (far + (MIST_FOG_FAR - far) * mist) * (1 - 0.15 * rain);
    set(this.fog.color, fogCol);
    if (this.scene.background instanceof THREE.Color) set(this.scene.background, fogCol);

    // The dome, round the camera.
    this.dome.position.copy(cameraPosition);
    const u = this.dome.material.uniforms;
    set(u.zenith!.value as THREE.Color, c.zenith);
    set(u.horizon!.value as THREE.Color, fogCol);
    set(u.sunColor!.value as THREE.Color, c.sun);
    set(u.cloudColor!.value as THREE.Color, cloudCol);
    (u.sunDir!.value as THREE.Vector3).set(...sunDir);
    (u.moonDir!.value as THREE.Vector3).set(...moonDir);
    u.night!.value = night;
    u.cover!.value = cover;
    u.flash!.value = flash;
    u.time!.value = this.time;
    (u.wind!.value as THREE.Vector2).set(weather.wind[0], -weather.wind[1]);

    // The rain, round the player, leaning with the wind.
    this.rain.visible = rain > 0.01;
    const r = this.rain.material.uniforms;
    r.time!.value = this.time;
    r.level!.value = rain;
    (r.anchor!.value as THREE.Vector3).set(focus.x, focus.y - 3, focus.z);
    (r.slant!.value as THREE.Vector2).set(weather.wind[0] * 0.12, -weather.wind[1] * 0.12);
    set(r.color!.value as THREE.Color, mix(rgb(RAIN_COLOR), [0.3, 0.34, 0.42], night));
    r.alpha!.value = 0.3 + 0.25 * rain;
    this.onRain(rain);
    // Thunder, once, when its moment passes; not one that passed while the tab was away.
    if (lightning.thunder !== null && now >= lightning.thunder && now - lightning.thunder < 1500 && this.thunderDone !== lightning.thunder) {
      this.thunderDone = lightning.thunder;
      this.onThunder(0.5 + 0.5 * storm);
    }
  }

  /**
   * Plain noon daylight, set now: what a picture of the map is rendered under, whatever the hour, so
   * the radar and the map never go dark with the night. The next frame's update takes the sky back.
   */
  lightForPicture(): void {
    this.hemi.color.set(SKY_LIGHT);
    this.hemi.groundColor.set(GROUND_LIGHT);
    this.hemi.intensity = SKY_INTENSITY;
    this.sun.color.set(SUN_COLOR);
    this.sun.intensity = SUN_INTENSITY;
    this.sun.position.set(...SUN_FROM);
  }

  /** Underground (PLAN §8.5): the same lights turned down and the dark drawn in closer. */
  private lightUnderground(): void {
    this.hemi.color.set(SKY_LIGHT);
    this.hemi.groundColor.set(GROUND_LIGHT);
    this.hemi.intensity = CAVE_SKY_INTENSITY * this.brightness;
    this.sun.color.set(SUN_COLOR);
    this.sun.intensity = CAVE_SUN_INTENSITY * this.brightness;
    this.sun.position.set(...SUN_FROM);
    this.fog.color.set(FOG_COLOR);
    this.fog.near = CAVE_FOG_NEAR;
    this.fog.far = CAVE_FOG_FAR;
    if (this.scene.background instanceof THREE.Color) this.scene.background.set(FOG_COLOR);
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.rain.geometry.dispose();
    this.rain.material.dispose();
  }
}

/** The moon's light, which the night's key carries as its sun. */
const SKY_KEYS_NIGHT_SUN = 0xc0ccec;
