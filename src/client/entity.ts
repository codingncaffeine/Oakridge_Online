import { TICK_MS } from "../shared/constants.ts";
import { heightAt, type WorldMap } from "../shared/map.ts";
import type { ActView } from "../shared/protocol.ts";
import { CharacterModel } from "./render/character.ts";
import { MonsterModel } from "./render/monster.ts";
import type { ActionName } from "./render/poses.ts";

/** What the world draws for an entity: a person, or a creature. Both answer the same calls. */
export type Model = CharacterModel | MonsterModel;

/** Seconds a body takes to topple once it is killed. */
const FALL_SECONDS = 1;

interface Waypoint {
  x: number;
  y: number;
  /** Seconds this step takes: one tick split among the tick's steps. */
  duration: number;
}

const TURN_SPEED = 11; // radians per second
const MOVING_GRACE = 0.12; // seconds of idle between steps that still count as walking

/** Something drawn in the world that the server moves tile by tile: glides between tile centres. */
export class Entity {
  readonly id: number;
  readonly name: string;
  /** A creature's key in the bestiary, or null for a player. */
  readonly npc: string | null;
  model: Model;
  tileX: number;
  tileY: number;
  /** Where the model is drawn, in tile coordinates (tile centres are at +0.5). */
  fx: number;
  fy: number;
  private readonly queue: Waypoint[] = [];
  private fromX = 0;
  private fromY = 0;
  private elapsed = 0;
  private facing = 0;
  private targetFacing = 0;
  private idleFor = 1;
  private running = false;

  /** Worn item ids in VISIBLE_GEAR order, kept so a look change can rebuild the model with them. */
  gear: number[];
  look: number[];
  /** The skill action under way (chopping, mining, netting, fighting), or null. */
  act: ActView | null = null;
  /** Hitpoints now and at full, once the server has said; null before then. */
  hp: [number, number] | null = null;
  /** Seconds into toppling over, or null while it is on its feet. */
  private fallAt: number | null = null;
  /** Called each time this entity lands a blow or a tool, for the sound of it. */
  onImpact: ((action: ActionName) => void) | null = null;

  constructor(id: number, name: string, look: number[], gear: number[], x: number, y: number, npc: string | null = null) {
    this.id = id;
    this.name = name;
    this.npc = npc;
    this.look = look;
    this.gear = gear;
    this.model = npc === null ? new CharacterModel(look, gear) : new MonsterModel(npc);
    this.model.onImpact = (action) => this.onImpact?.(action);
    this.tileX = x;
    this.tileY = y;
    this.fx = x + 0.5;
    this.fy = y + 0.5;
  }

  /** Throws one blow: the model plays it through once. */
  swing(): void {
    this.model.swing();
  }

  /** Killed: it topples where it stands and stays down until it leaves the world. */
  die(): void {
    this.fallAt ??= 0;
  }

  /**
   * Back on its feet, standing upright again. A creature's body leaves the world and takes its entity
   * with it, but a player's does not: they wake at the spawn as the same entity, so without this they
   * walk about lying on their side, half in the ground.
   */
  rise(): void {
    this.fallAt = null;
    this.model.root.rotation.z = 0;
  }

  get dying(): boolean {
    return this.fallAt !== null;
  }

  /** Where anything drawn over this entity's head belongs, in tiles above its feet. */
  get overhead(): number {
    return this.model.height + 0.28;
  }

  /** Steps the server made this tick; they share one tick of time, so two steps is running. */
  addSteps(steps: Array<[number, number]>): void {
    const duration = TICK_MS / 1000 / steps.length;
    for (const [x, y] of steps) this.queue.push({ x, y, duration });
    const last = steps.at(-1);
    if (last) [this.tileX, this.tileY] = last;
    this.running = steps.length > 1;
  }

  /** The direction the model faces, in radians about the vertical (0 = south, toward +z). */
  get heading(): number {
    return this.facing;
  }

  /**
   * Starts, changes or (with null) ends an action: the tool goes in hand and the entity turns to face
   * the tile it works. Fighting shows as the guard stance, with each blow played over it.
   */
  setAct(act: ActView | null): void {
    this.act = act;
    const anim = act === null ? null : act.anim === "fight" ? "guard" : act.anim;
    this.model.act(anim, act?.tool ?? 0);
  }

  /** A new model for a new look or new gear, standing and facing as the old one did and still doing what it did. */
  restyle(look: number[], gear: number[]): Model {
    const old = this.model;
    this.look = look;
    this.gear = gear;
    this.model = new CharacterModel(look, gear);
    this.model.onImpact = (action) => this.onImpact?.(action);
    this.model.root.position.copy(old.root.position);
    this.model.root.rotation.copy(old.root.rotation);
    this.setAct(this.act);
    return old;
  }

  snapTo(x: number, y: number): void {
    this.queue.length = 0;
    this.elapsed = 0;
    this.tileX = x;
    this.tileY = y;
    this.fx = x + 0.5;
    this.fy = y + 0.5;
  }

  update(dt: number, map: WorldMap): void {
    // Falling behind the server (network bunching) plays the backlog faster until caught up.
    let time = dt * (this.queue.length > 3 ? 1 + (this.queue.length - 3) * 0.5 : 1);
    const startX = this.fx, startY = this.fy;
    while (time > 0 && this.queue.length > 0) {
      const wp = this.queue[0]!;
      if (this.elapsed === 0) {
        this.fromX = this.fx;
        this.fromY = this.fy;
        const dx = wp.x + 0.5 - this.fromX, dy = wp.y + 0.5 - this.fromY;
        if (dx !== 0 || dy !== 0) this.targetFacing = Math.atan2(dx, -dy);
      }
      const left = wp.duration - this.elapsed;
      if (time >= left) {
        time -= left;
        this.fx = wp.x + 0.5;
        this.fy = wp.y + 0.5;
        this.queue.shift();
        this.elapsed = 0;
      } else {
        this.elapsed += time;
        const k = this.elapsed / wp.duration;
        this.fx = this.fromX + (wp.x + 0.5 - this.fromX) * k;
        this.fy = this.fromY + (wp.y + 0.5 - this.fromY) * k;
        time = 0;
      }
    }
    const moved = Math.hypot(this.fx - startX, this.fy - startY);
    this.idleFor = moved > 0 ? 0 : this.idleFor + dt;
    // Arrived and working something: turn to face it.
    if (this.act && this.queue.length === 0) {
      const dx = this.act.x + 0.5 - this.fx, dy = this.act.y + 0.5 - this.fy;
      if (dx !== 0 || dy !== 0) this.targetFacing = Math.atan2(dx, -dy);
    }

    let turn = this.targetFacing - this.facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.facing += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * dt);

    const root = this.model.root;
    root.position.set(this.fx, heightAt(map, this.fx, this.fy), -this.fy);
    root.rotation.y = this.facing;
    // Killed: it goes over onto its side, and settles there.
    if (this.fallAt !== null) {
      this.fallAt += dt;
      const t = Math.min(1, this.fallAt / FALL_SECONDS);
      root.rotation.z = (1 - (1 - t) ** 3) * Math.PI * 0.46;
    }
    this.model.animate(dt, moved, this.idleFor < MOVING_GRACE, this.running && this.idleFor < MOVING_GRACE);
  }
}
