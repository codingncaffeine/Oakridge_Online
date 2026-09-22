import { TICK_MS } from "../shared/constants.ts";
import { heightAt, type WorldMap } from "../shared/map.ts";
import { CharacterModel } from "./render/character.ts";

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
  readonly model: CharacterModel;
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

  constructor(id: number, name: string, look: number[], x: number, y: number) {
    this.id = id;
    this.name = name;
    this.model = new CharacterModel(look);
    this.tileX = x;
    this.tileY = y;
    this.fx = x + 0.5;
    this.fy = y + 0.5;
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

    let turn = this.targetFacing - this.facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.facing += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * dt);

    const root = this.model.root;
    root.position.set(this.fx, heightAt(map, this.fx, this.fy), -this.fy);
    root.rotation.y = this.facing;
    this.model.animate(dt, moved, this.idleFor < MOVING_GRACE, this.running && this.idleFor < MOVING_GRACE);
  }
}
