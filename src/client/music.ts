// Background music, and the fight's: what plays, when it changes, and the fades between (PLAN Phase 13).

/** Music: seconds of quiet between tracks, and the fades at either end of one. */
const BETWEEN_TRACKS = 8;
const FADE_IN = 2;
const FADE_OUT = 3;
/** The fight's music: seconds to fade it in over the world's when a fight starts, and out again once it is over. */
const BATTLE_IN = 1.5;
const BATTLE_OUT = 4;

/**
 * Background music: the tracks in a shuffled order, one after another with a pause between, each
 * fading in and out. They are streamed rather than loaded, since minutes of sound held in memory would
 * be tens of megabytes. Nothing is fetched at all while the music volume is at nothing.
 */
export class Music {
  private readonly tracks: readonly string[];
  private readonly battleTrack: string;
  /** For the self-test: tracks begun (0 while muted), how many times the area's tune changed, and fights begun. */
  readonly stats = { started: 0, areas: 0, battles: 0 };
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private player: HTMLAudioElement | null = null;
  private fade: GainNode | null = null;
  private order: string[] = [];
  private next = 0;
  private level = 0.3;
  /**
   * The track the part of the world the player is standing in calls for, or null out of the world.
   * While an area names one, that is what plays, over and over with a pause between; the shuffle is
   * what a world with no areas of its own falls back to.
   */
  private area: number | null = null;
  /** Whether the world is up: music stays off on the login screen and in the previews. */
  private wanted = false;
  private fading = false;
  private waiting = 0;
  /** The fight's music: its own player and fade, looping while the player is in a fight. */
  private battle: HTMLAudioElement | null = null;
  private battleFade: GainNode | null = null;
  private battling = false;
  /** Timers that pause a player once its fade has run out, kept by the wall clock (a suspended context's clock stops). */
  private ducked = 0;
  private quietened = 0;

  /** The world's tunes, in the order areas name them, and the fight's. */
  constructor(tracks: readonly string[], battleTrack: string) {
    this.tracks = tracks;
    this.battleTrack = battleTrack;
  }

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

  /**
   * The player crossed into a part of the world with its own tune. The one playing fades away and the
   * new one comes up after the usual pause, so a border is heard rather than cut across.
   */
  setArea(track: number | null): void {
    if (track === this.area) return;
    this.area = track;
    this.stats.areas++;
    if (!this.player) {
      this.check();
      return;
    }
    // In a fight the fight's music is up: the new tune waits, and comes in when the fight is over.
    if (this.battling) return;
    this.fadeAway();
    this.afterAPause();
  }

  /**
   * A fight began or ended. The fight's music fades in over the world's, which fades down and waits
   * where it was; once the fight is over the fight's music fades away and the world's comes back up
   * from where it stopped — or the next tune starts, if the player crossed into another part of the
   * world in the meantime or the track had run out.
   */
  setBattle(on: boolean): void {
    if (on === this.battling) return;
    this.battling = on;
    if (on) this.stats.battles++;
    if (!this.player) return;
    if (on) {
      clearTimeout(this.waiting);
      this.duck();
      this.battleIn();
    } else {
      this.battleOut();
      this.resume();
    }
  }

  /** The fight's music up from wherever it was (a fight begun again as the last one faded picks up where it had got to). */
  private battleIn(): void {
    const ctx = this.ctx!, out = this.out!;
    if (!this.battle) {
      this.battle = new Audio(this.battleTrack);
      this.battle.loop = true;
      this.battle.preload = "auto";
      this.battleFade = ctx.createGain();
      ctx.createMediaElementSource(this.battle).connect(this.battleFade).connect(out);
    }
    clearTimeout(this.quietened);
    const battle = this.battle, fade = this.battleFade!;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(battle.paused ? 0.0001 : Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(1, ctx.currentTime + BATTLE_IN);
    battle.play().catch(() => undefined);
  }

  /** The fight's music away, then stopped and wound back to its start for the next fight. */
  private battleOut(): void {
    const ctx = this.ctx!, battle = this.battle, fade = this.battleFade;
    if (!battle || !fade) return;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + BATTLE_OUT);
    clearTimeout(this.quietened);
    this.quietened = window.setTimeout(() => {
      if (this.battling) return;
      battle.pause();
      battle.currentTime = 0;
    }, BATTLE_OUT * 1000 + 100);
  }

  /** The world's music down under the fight's, and paused where it was once it can't be heard. */
  private duck(): void {
    const ctx = this.ctx!, player = this.player!, fade = this.fade!;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + BATTLE_IN);
    clearTimeout(this.ducked);
    this.ducked = window.setTimeout(() => {
      if (this.battling) player.pause();
    }, BATTLE_IN * 1000 + 100);
  }

  /** The world's music back up after a fight, from where it stopped, unless it is time for another tune. */
  private resume(): void {
    const ctx = this.ctx!, player = this.player!, fade = this.fade!;
    clearTimeout(this.ducked);
    const own = this.area === null ? undefined : this.tracks[this.area];
    if (!player.src || player.ended || (own !== undefined && !player.src.endsWith(own))) {
      this.startTrack();
      return;
    }
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(1, ctx.currentTime + BATTLE_OUT);
    player.play().catch(() => this.afterAPause());
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
    if (this.battling) this.battleIn();
  }

  private startTrack(): void {
    const ctx = this.ctx, player = this.player, fade = this.fade;
    if (!ctx || !player || !fade || this.battling) return;
    // A part of the world with a tune of its own plays that one; anywhere else takes the shuffle.
    const own = this.area === null ? undefined : this.tracks[this.area];
    if (own === undefined && this.next >= this.order.length) {
      this.order = this.tracks.slice();
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
      }
      this.next = 0;
    }
    player.src = own ?? this.order[this.next++]!;
    this.fading = false;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(0.0001, ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_IN);
    player.play().then(() => { this.stats.started++; }).catch(() => this.afterAPause());
  }

  /** Takes the volume down to nothing over the fade, wherever the track had got to. */
  private fadeAway(): void {
    const ctx = this.ctx, fade = this.fade;
    if (!ctx || !fade) return;
    this.fading = true;
    fade.gain.cancelScheduledValues(ctx.currentTime);
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), ctx.currentTime);
    fade.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + FADE_OUT);
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
    clearTimeout(this.ducked);
    clearTimeout(this.quietened);
    this.player?.pause();
    this.player = null;
    this.fade?.disconnect();
    this.fade = null;
    this.battle?.pause();
    this.battle = null;
    this.battleFade?.disconnect();
    this.battleFade = null;
  }
}
