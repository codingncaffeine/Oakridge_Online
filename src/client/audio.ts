import { SOUND_FILES, type SoundName } from "./sounds/index.ts";

/** Within this many tiles an area sound is at full volume; past MAX_TILES it isn't played at all. */
const FULL_TILES = 2;
const MAX_TILES = 12;
/** At most this many sounds at once, so a crowd of choppers can't pile up. */
const MAX_VOICES = 16;

export type { SoundName };

/**
 * The game's sound. Two channels, as in the classic: effects for what you do, area sounds for what
 * happens around you, each with its own volume. Browsers keep a page silent until it is clicked or
 * typed into, so the sound system starts on the first of those and loads its sounds then. Every play
 * picks one of a sound's files and shifts its pitch a little, so repeats don't sound identical.
 */
export class Sound {
  /** What the self-test reads: how many sounds are loaded, how many failed, and the plays of each. */
  readonly stats = { loaded: 0, failed: 0, played: {} as Record<string, number> };
  private ctx: AudioContext | null = null;
  private effectsGain: GainNode | null = null;
  private areaGain: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer[]>();
  private volumes = { effects: 0.6, area: 0.6 };
  private voices = 0;
  /** Muted holds the sound system off the speakers entirely: the self-test must never be audible. */
  private readonly muted: boolean;

  constructor(muted = false) {
    this.muted = muted;
    if (muted) this.start();
    else for (const event of ["pointerdown", "keydown"]) window.addEventListener(event, () => this.start(), { once: true, capture: true });
  }

  setVolumes(effects: number, area: number): void {
    this.volumes = { effects, area };
    if (this.effectsGain) this.effectsGain.gain.value = effects;
    if (this.areaGain) this.areaGain.gain.value = area;
  }

  /** Something you did. */
  effect(name: SoundName): void {
    this.play(name, this.effectsGain, 1);
  }

  /** Something that happened `tiles` away: quieter with distance, and not heard at all far off. */
  area(name: SoundName, tiles: number): void {
    const falloff = Math.min(1, Math.max(0, (MAX_TILES - tiles) / (MAX_TILES - FULL_TILES)));
    if (falloff > 0) this.play(name, this.areaGain, falloff);
  }

  /**
   * The level-up flourish: four notes of a rising chord, each a tone with two faint overtones that
   * fade away, built here rather than recorded.
   */
  levelUp(): void {
    const ctx = this.ctx, out = this.effectsGain;
    if (!ctx || !out) return;
    this.stats.played.levelup = (this.stats.played.levelup ?? 0) + 1;
    const start = ctx.currentTime + 0.03;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, i) => {
      const at = start + i * 0.12, length = i === notes.length - 1 ? 0.9 : 0.38;
      for (const [multiple, level] of [[1, 0.3], [2, 0.09], [3, 0.03]] as const) {
        const tone = ctx.createOscillator();
        tone.frequency.value = note * multiple;
        const fade = ctx.createGain();
        fade.gain.setValueAtTime(0.0001, at);
        fade.gain.exponentialRampToValueAtTime(level, at + 0.012);
        fade.gain.exponentialRampToValueAtTime(0.0001, at + length);
        tone.connect(fade).connect(out);
        tone.start(at);
        tone.stop(at + length + 0.05);
      }
    });
  }

  private play(name: SoundName, out: GainNode | null, gain: number): void {
    const ctx = this.ctx, files = this.buffers.get(name);
    if (!ctx || !out || !files?.length || this.voices >= MAX_VOICES) return;
    const source = ctx.createBufferSource();
    source.buffer = files[Math.floor(Math.random() * files.length)]!;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(level).connect(out);
    this.voices++;
    source.onended = () => { this.voices--; };
    source.start();
    this.stats.played[name] = (this.stats.played[name] ?? 0) + 1;
  }

  /** Opens the sound system and loads every sound. Called on the first click or key press. */
  private start(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.effectsGain = ctx.createGain();
    this.areaGain = ctx.createGain();
    this.setVolumes(this.volumes.effects, this.volumes.area);
    // Muted: the channels lead nowhere, so nothing ever reaches the speakers.
    if (!this.muted) {
      this.effectsGain.connect(ctx.destination);
      this.areaGain.connect(ctx.destination);
      void ctx.resume();
    }
    void this.load(ctx);
  }

  private async load(ctx: AudioContext): Promise<void> {
    await Promise.all(Object.entries(SOUND_FILES).map(async ([name, urls]) => {
      const buffers = await Promise.all((urls as readonly string[]).map(async (url) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          this.stats.loaded++;
          return buffer;
        } catch {
          this.stats.failed++;
          return null;
        }
      }));
      this.buffers.set(name as SoundName, buffers.filter((b): b is AudioBuffer => b !== null));
    }));
  }
}
