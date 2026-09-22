import { MUSIC_TRACKS, SOUND_FILES, type SoundName } from "./sounds/index.ts";

/** Within this many tiles an area sound is at full volume; past MAX_TILES it isn't played at all. */
const FULL_TILES = 2;
const MAX_TILES = 12;
/** At most this many sounds at once, so a crowd of choppers can't pile up. */
const MAX_VOICES = 16;
/** Music: seconds of quiet between tracks, and the fades at either end of one. */
const BETWEEN_TRACKS = 8;
const FADE_IN = 2;
const FADE_OUT = 3;

export type { SoundName };

/** The volumes the player can set, each from 0 to 1. */
export interface Volumes {
  effects: number;
  area: number;
  music: number;
}

/**
 * Background music: the tracks in a shuffled order, one after another with a pause between, each
 * fading in and out. They are streamed rather than loaded, since minutes of sound held in memory would
 * be tens of megabytes. Nothing is fetched at all while the music volume is at nothing.
 */
class Music {
  /** For the self-test: tracks begun (which must stay 0 while the sound system is muted). */
  readonly stats = { started: 0 };
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private player: HTMLAudioElement | null = null;
  private fade: GainNode | null = null;
  private order: string[] = [];
  private next = 0;
  private level = 0.3;
  /** Whether the world is up: music stays off on the login screen and in the previews. */
  private wanted = false;
  private fading = false;
  private waiting = 0;

  /** The sound system opened. A null channel (the muted self-test) means music never plays. */
  open(ctx: AudioContext, out: GainNode | null): void {
    this.ctx = ctx;
    this.out = out;
    this.check();
  }

  /** Music starts once the world is up, not on the login screen. */
  play(on: boolean): void {
    this.wanted = on;
    this.check();
  }

  setLevel(level: number): void {
    this.level = level;
    this.check();
  }

  private check(): void {
    const should = this.wanted && this.level > 0 && this.ctx !== null && this.out !== null;
    if (should && !this.player) this.begin();
    else if (!should && this.player) this.stop();
  }

  private begin(): void {
    const ctx = this.ctx!, out = this.out!;
    this.player = new Audio();
    this.player.preload = "auto";
    this.fade = ctx.createGain();
    ctx.createMediaElementSource(this.player).connect(this.fade).connect(out);
    this.player.addEventListener("ended", () => this.afterAPause());
    this.player.addEventListener("error", () => this.afterAPause());
    this.player.addEventListener("timeupdate", () => this.fadeOut());
    this.order = [];
    this.startTrack();
  }

  private startTrack(): void {
    const ctx = this.ctx, player = this.player, fade = this.fade;
    if (!ctx || !player || !fade) return;
    if (this.next >= this.order.length) {
      this.order = MUSIC_TRACKS.slice();
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
      }
      this.next = 0;
    }
    player.src = this.order[this.next++]!;
    this.fading = false;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(0.0001, ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_IN);
    player.play().then(() => { this.stats.started++; }).catch(() => this.afterAPause());
  }

  /** The last seconds of a track fade away, so one never stops dead. */
  private fadeOut(): void {
    const ctx = this.ctx, player = this.player, fade = this.fade;
    if (!ctx || !player || !fade || this.fading || !Number.isFinite(player.duration)) return;
    const left = player.duration - player.currentTime;
    if (left > FADE_OUT) return;
    this.fading = true;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.max(0.1, left));
  }

  private afterAPause(): void {
    clearTimeout(this.waiting);
    this.waiting = window.setTimeout(() => this.startTrack(), BETWEEN_TRACKS * 1000);
  }

  private stop(): void {
    clearTimeout(this.waiting);
    this.player?.pause();
    this.player = null;
    this.fade?.disconnect();
    this.fade = null;
  }
}

/**
 * The game's sound. Three channels, as in the classic: effects for what you do, area sounds for what
 * happens around you, and music, each with its own volume. Browsers keep a page silent until it is
 * clicked or typed into, so the sound system starts on the first of those and loads its sounds then.
 * Every play picks one of a sound's files and shifts its pitch a little, so repeats don't sound identical.
 */
export class Sound {
  /** What the self-test reads: how many sounds are loaded, how many failed, and the plays of each. */
  readonly stats = { loaded: 0, failed: 0, played: {} as Record<string, number> };
  /** Background music, which plays once the world is up. */
  readonly music = new Music();
  private ctx: AudioContext | null = null;
  private effectsGain: GainNode | null = null;
  private areaGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer[]>();
  private volumes: Volumes = { effects: 0.6, area: 0.6, music: 0.3 };
  /** When each sound now playing ends, on the context's clock: a crowd can't pile up past MAX_VOICES. */
  private voices: number[] = [];
  /** Muted holds the sound system off the speakers entirely: the self-test must never be audible. */
  private readonly muted: boolean;

  constructor(muted = false) {
    this.muted = muted;
    if (muted) this.start();
    else for (const event of ["pointerdown", "keydown"]) window.addEventListener(event, () => this.start(), { once: true, capture: true });
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = { ...volumes };
    if (this.effectsGain) this.effectsGain.gain.value = volumes.effects;
    if (this.areaGain) this.areaGain.gain.value = volumes.area;
    if (this.musicGain) this.musicGain.gain.value = volumes.music;
    this.music.setLevel(volumes.music);
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
    if (!ctx || !out || !files?.length) return;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((end) => end > now);
    if (this.voices.length >= MAX_VOICES) return;
    const source = ctx.createBufferSource();
    const buffer = files[Math.floor(Math.random() * files.length)]!;
    const rate = 0.94 + Math.random() * 0.12;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(level).connect(out);
    source.start();
    this.voices.push(now + buffer.duration / rate + 0.05);
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
    this.musicGain = ctx.createGain();
    this.setVolumes(this.volumes);
    // Muted: the channels lead nowhere, so nothing ever reaches the speakers. The clock still has to
    // run either way, or sounds would never finish and the voices would fill up.
    if (!this.muted) {
      this.effectsGain.connect(ctx.destination);
      this.areaGain.connect(ctx.destination);
      this.musicGain.connect(ctx.destination);
    }
    this.music.open(ctx, this.muted ? null : this.musicGain);
    void ctx.resume();
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
