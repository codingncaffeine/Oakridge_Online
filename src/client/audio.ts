import { Music } from "./music.ts";
import { BATTLE_TRACK, MUSIC_TRACKS, SOUND_FILES, type SoundName } from "./sounds/index.ts";

/** Within this many tiles an area sound is at full volume; past MAX_TILES it isn't played at all. */
const FULL_TILES = 2;
const MAX_TILES = 12;
/** At most this many sounds at once, so a crowd of choppers can't pile up. */
const MAX_VOICES = 16;

export type { SoundName };

/** The volumes the player can set, each from 0 to 1. */
export interface Volumes {
  effects: number;
  area: number;
  music: number;
}

/** Four seconds of white noise, made once per sound system: what the rain and the thunder are shaped from. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
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
  readonly music = new Music(MUSIC_TRACKS, BATTLE_TRACK);
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
   * A level gained: the user's jingle (sounds/). Until it has loaded, or if it could not be, a flourish
   * built here stands in: four notes of a rising chord, each a tone with two faint overtones that fade away.
   */
  levelUp(): void {
    const ctx = this.ctx, out = this.effectsGain;
    if (!ctx || !out) return;
    // The user's jingle, once it has loaded; the four notes below only stand in if it could not be.
    if (this.buffers.get("levelup")?.length) {
      this.play("levelup", out, 1);
      return;
    }
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

  /** The rain, as a loop of soft noise on the area channel, brought up and down with the weather. */
  private rainVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private rainLevel = 0;

  /**
   * How hard it is raining, 0 to 1, told every frame: the loop starts with the first drop, follows
   * the level gently, and stops a few seconds after the rain does. Built from noise, not recorded.
   */
  rain(level: number): void {
    const ctx = this.ctx, out = this.areaGain;
    if (!ctx || !out) return;
    const want = Math.max(0, Math.min(1, level));
    if (Math.abs(want - this.rainLevel) < 0.005) return;
    this.rainLevel = want;
    if (want > 0 && !this.rainVoice) {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      source.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 350;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 1400;
      low.Q.value = 0.4;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      source.connect(high).connect(low).connect(gain).connect(out);
      source.start();
      this.rainVoice = { source, gain };
      this.stats.played.rain = (this.stats.played.rain ?? 0) + 1;
    }
    if (!this.rainVoice) return;
    const g = this.rainVoice.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(Math.max(0.0001, 0.5 * want * want), ctx.currentTime, 1.2);
    if (want === 0) {
      const voice = this.rainVoice;
      this.rainVoice = null;
      setTimeout(() => {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      }, 5000);
    }
  }

  /** A clap of thunder that rolls away: two rumbles of low noise, the second a little after the first. */
  thunder(loudness: number): void {
    const ctx = this.ctx, out = this.areaGain;
    if (!ctx || !out) return;
    this.stats.played.thunder = (this.stats.played.thunder ?? 0) + 1;
    const at = ctx.currentTime + 0.02;
    for (const [delay, length, level, cutoff] of [[0, 2.6, 0.9, 140], [0.35, 3.4, 0.5, 90]] as const) {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = cutoff;
      low.Q.value = 0.8;
      const gain = ctx.createGain();
      const start = at + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * loudness), start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      source.connect(low).connect(gain).connect(out);
      source.start(start);
      source.stop(start + length + 0.1);
    }
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
