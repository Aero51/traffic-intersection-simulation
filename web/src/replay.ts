// "Ponovi": a rolling recording of the last minute (signals, cars, pedestrians) so the page can
// rewind and scrub through what just happened. View only: leaving the replay goes back to the
// live junction. Pure TypeScript, no DOM.

import type { SimSnapshot } from './sim';
import type { Car } from './traffic';
import type { Walker } from './pedestrians';

/** Seconds between recorded frames, and how many are kept (60 s). */
export const FRAME_EVERY = 0.1;
export const MAX_FRAMES = 600;

export interface Frame {
  /** Seconds of simulated time since recording started. */
  t: number;
  snap: SimSnapshot;
  cars: Car[];
  walkers: Walker[];
}

export class Recorder {
  frames: Frame[] = [];
  private clock = 0;
  private since = FRAME_EVERY; // so the very first call records

  /** Advance simulated time by `dt`; records a frame when due. `source` is only read then. */
  advance(dt: number, source: () => { snap: SimSnapshot; cars: readonly Car[]; walkers: readonly Walker[] }): void {
    this.clock += dt;
    this.since += dt;
    if (this.since < FRAME_EVERY) return;
    this.since = 0;
    const { snap, cars, walkers } = source();
    this.frames.push({
      t: this.clock,
      snap: structuredClone(snap),
      // The copies must not keep other (live) cars alive through `blocker`.
      cars: cars.map((c) => ({ ...c, blocker: null })),
      walkers: walkers.map((w) => ({ ...w })),
    });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  /** Seconds the frame at `index` lies before the newest one. */
  ago(index: number): number {
    const last = this.frames[this.frames.length - 1];
    return last ? last.t - this.frames[index].t : 0;
  }

  clear(): void {
    this.frames = [];
    this.since = FRAME_EVERY;
  }
}
