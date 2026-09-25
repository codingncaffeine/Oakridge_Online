// The fight's music (PLAN Phase 13): that a fight begun fades it in over the world's music, which fades down
// and waits where it was, and that a fight over fades it away and brings the world's back — held to what each
// fade is told, on a stand-in audio context, since a test cannot listen.
import assert from "node:assert/strict";
import { test } from "node:test";

/** A gain whose every ramp is written down: the last one says where the fade is heading. */
class FakeGain {
  readonly ramps: number[] = [];
  readonly gain = {
    value: 1,
    cancelScheduledValues: () => undefined,
    setValueAtTime: (v: number) => void (this.gain.value = v),
    exponentialRampToValueAtTime: (v: number) => void this.ramps.push(v),
  };
  connect<T>(to: T): T {
    return to;
  }
  disconnect(): void {}
  get heading(): number | undefined {
    return this.ramps.at(-1);
  }
}

/** A media element as far as the music uses one: a new source starts from its beginning, as a real one loads. */
class FakeAudio {
  static made: FakeAudio[] = [];
  private source = "";
  get src(): string {
    return this.source;
  }
  set src(v: string) {
    this.source = v;
    this.currentTime = 0;
    this.ended = false;
  }
  paused = true;
  ended = false;
  loop = false;
  preload = "";
  currentTime = 0;
  duration = Number.NaN;
  constructor(src = "") {
    this.source = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(): void {}
}

const gains: FakeGain[] = [];
const sources = new Map<FakeAudio, FakeGain>();
const ctx = {
  currentTime: 0,
  createGain: () => {
    const g = new FakeGain();
    gains.push(g);
    return g;
  },
  createMediaElementSource: (el: FakeAudio) => ({ connect: (g: FakeGain) => (sources.set(el, g), g) }),
};
const globals = globalThis as Record<string, unknown>;
globals.Audio = FakeAudio;
globals.window = globalThis;
const { Music } = await import("../../src/client/music.ts");
const MUSIC_TRACKS = ["/assets/tune-a.mp3", "/assets/tune-b.mp3", "/assets/tune-c.mp3"];
const BATTLE_TRACK = "/assets/fight.mp3";

test("a fight fades its music in over the world's, and the world's comes back when it is over", async () => {
  const music = new Music(MUSIC_TRACKS, BATTLE_TRACK);
  music.open(ctx as unknown as AudioContext, new FakeGain() as unknown as GainNode);
  music.setArea(0);
  music.play(true);
  const world = FakeAudio.made[0]!;
  assert.equal(world.src, MUSIC_TRACKS[0], "the area's own tune plays");
  assert.ok(!world.paused);

  music.setBattle(true);
  const fight = FakeAudio.made.find((a) => a.src === BATTLE_TRACK);
  assert.ok(fight && !fight.paused && fight.loop, "the fight's music starts, looping");
  assert.equal(sources.get(fight)!.heading, 1, "and fades in");
  assert.ok(sources.get(world)!.heading! < 0.01, "while the world's fades down");
  assert.equal(music.stats.battles, 1);

  // A border crossed mid-fight: the new tune waits for the fight to end instead of cutting in.
  music.setArea(1);
  assert.equal(world.src, MUSIC_TRACKS[0], "no new tune starts during the fight");

  music.setBattle(false);
  assert.ok(sources.get(fight)!.heading! < 0.01, "the fight over, its music fades away");
  assert.equal(world.src, MUSIC_TRACKS[1], "and the part of the world the player is in now has its tune");
  assert.equal(sources.get(world)!.heading, 1, "fading in");
  assert.ok(!world.paused);

  // The control: a fight in the same place resumes the tune where it was rather than starting another.
  music.setBattle(true);
  world.currentTime = 42;
  music.setBattle(false);
  assert.equal(world.src, MUSIC_TRACKS[1], "the same tune comes back");
  assert.equal(world.currentTime, 42, "from where it had got to");
  assert.equal(music.stats.battles, 2);
});
