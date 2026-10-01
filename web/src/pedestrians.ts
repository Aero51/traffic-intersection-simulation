// People using the two crosswalks. Pressing Tipkalo brings a few to the kerbs; they wait
// for their pedestrian light and walk across on green. Pure TypeScript, no DOM.

import type { SimSnapshot } from './sim';
import type { Point } from './traffic';

export interface Crossing {
  id: string;
  /** Pedestrian light indices (0-3) that show green for this crossing. */
  lights: [number, number];
  /** Kerb-to-kerb centre line, measured on the background photo. */
  a: Point;
  b: Point;
  /** Half the width of the striped area, across the walking direction. */
  halfWidth: number;
}

export const CROSSINGS: Crossing[] = [
  { id: 'main', lights: [0, 1], a: [472, 302], b: [395, 433], halfWidth: 15 },
  { id: 'side', lights: [2, 3], a: [486, 48], b: [486, 158], halfWidth: 13 },
];

export interface Walker {
  id: number;
  crossing: Crossing;
  /** Starting kerb: walks a -> b when false, b -> a when true. */
  reverse: boolean;
  /** 0 at the starting kerb, 1 at the other; negative while waiting on the pavement. */
  t: number;
  /** Sideways position within the crosswalk, px. */
  offset: number;
  speed: number;
  walking: boolean;
  clothes: string;
  hair: string;
}

const WAIT_AT = -0.07;
const MAX_WAITING_PER_KERB = 3;

export const CLOTHES = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#37474f', '#ef6c00', '#00838f', '#eeeeee', '#5d4037'];
export const HAIR = ['#2b1d14', '#111111', '#6d4c2f', '#d9b36c', '#9e9e9e'];

export class Pedestrians {
  walkers: Walker[] = [];
  private nextId = 1;

  constructor(private random: () => number = Math.random) {}

  /** Tipkalo: one to three people walk up to each kerb of each crossing. */
  call(): void {
    for (const crossing of CROSSINGS) {
      for (const reverse of [false, true]) {
        const waiting = this.walkers.filter((w) => w.crossing === crossing && w.reverse === reverse && !w.walking);
        const add = Math.min(MAX_WAITING_PER_KERB - waiting.length, 1 + Math.floor(this.random() * 3));
        for (let i = 0; i < add; i++) this.add(crossing, reverse, waiting.length + i);
      }
    }
  }

  step(dt: number, snap: SimSnapshot): void {
    for (const w of this.walkers) {
      const green = w.crossing.lights.every((i) => snap.pedestrians[i].green);
      // Once on the road, keep going even if the light changes.
      if (!w.walking && green) w.walking = true;
      if (w.walking) w.t += (w.speed * dt) / crossingLength(w.crossing);
    }
    this.walkers = this.walkers.filter((w) => w.t < 1.08);
  }

  private add(crossing: Crossing, reverse: boolean, slot: number): void {
    // Spread the people waiting at one kerb across the crosswalk's width.
    const lanes = [-0.55, 0.55, 0];
    this.walkers.push({
      id: this.nextId++,
      crossing,
      reverse,
      t: WAIT_AT - this.random() * 0.03,
      offset: lanes[slot % lanes.length] * crossing.halfWidth + (this.random() - 0.5) * 4,
      speed: 20 + this.random() * 8,
      walking: false,
      clothes: CLOTHES[Math.floor(this.random() * CLOTHES.length)],
      hair: HAIR[Math.floor(this.random() * HAIR.length)],
    });
  }
}

export function crossingLength(c: Crossing): number {
  return Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
}

/** Position and heading of a walker on the photo. */
export function walkerPose(w: Walker): { x: number; y: number; angle: number } {
  const { a, b } = w.crossing;
  const [from, to] = w.reverse ? [b, a] : [a, b];
  const len = crossingLength(w.crossing);
  const ux = (to[0] - from[0]) / len;
  const uy = (to[1] - from[1]) / len;
  return {
    x: from[0] + ux * len * w.t - uy * w.offset,
    y: from[1] + uy * len * w.t + ux * w.offset,
    angle: Math.atan2(uy, ux),
  };
}
