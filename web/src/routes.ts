// Car routes. Based on GlavnaKlasa.putGore(), which strung eight routes into one Path for
// a single red square. The two turning arcs were replaced with cubic curves that stay on
// the road, and each route is tied to the signal (and turn arrow) next to it.

import type { Point, RouteDef } from './traffic';

/** Where signal 1's stop line was drawn in the original (`linija`, never made visible). */
const MAIN_STOP_LINE: Point = [529, 384];

export const ROUTE_DEFS: RouteDef[] = [
  // North-west bound main road (from bottom right).
  {
    id: 'nw-straight',
    lane: 'nw-right',
    weight: 3,
    control: { signal: 0 },
    stopNear: MAIN_STOP_LINE,
    path: [[703, 466], ['L', 542, 375], ['L', 396, 287], ['L', 275, 204], ['L', 159, 118], ['L', 18, 4]],
  },
  {
    id: 'nw-right-turn',
    lane: 'nw-right',
    weight: 2,
    control: { signal: 0, arrow: 0 },
    stopNear: MAIN_STOP_LINE,
    path: [[703, 466], ['L', 542, 375], ['L', 396, 287], ['C', 362, 266, 392, 148, 451, 137], ['L', 637, 101], ['L', 891, 47]],
  },
  {
    id: 'nw-left-lane',
    lane: 'nw-left',
    weight: 1,
    control: { signal: 1 },
    stopNear: MAIN_STOP_LINE,
    path: [[653, 470], ['L', 446, 357], ['L', 316, 275], ['L', 182, 177], ['L', 1, 39]],
  },
  // South-east bound main road (from top left).
  {
    id: 'se-straight',
    lane: 'se-left',
    weight: 3,
    control: { signal: 3 },
    stopNear: [99, 150],
    path: [[2, 73], ['L', 64, 128], ['L', 279, 283], ['L', 395, 361], ['L', 519, 436], ['L', 582, 471]],
  },
  {
    id: 'se-left-turn',
    lane: 'se-left',
    weight: 1,
    control: { signal: 3, arrow: 1 },
    stopNear: [99, 150],
    path: [[2, 73], ['L', 64, 128], ['C', 110, 169, 300, 150, 441, 136], ['L', 637, 101], ['L', 891, 47]],
  },
  {
    id: 'se-right-lane',
    lane: 'se-right',
    weight: 1,
    control: { signal: 2 },
    stopNear: [48, 190],
    path: [[0, 117], ['L', 53, 157], ['L', 279, 324], ['L', 453, 436], ['L', 498, 471]],
  },
  // Side road, coming in from the east.
  {
    id: 'side-right-turn',
    lane: 'side',
    weight: 2,
    control: { signal: 4, arrow: 2 },
    stopNear: [530, 84],
    path: [[892, 14], ['L', 543, 82], ['L', 377, 98], ['L', 288, 93], ['L', 169, 74], ['L', 58, 35], ['L', 14, 0]],
  },
  {
    id: 'side-left-turn',
    lane: 'side',
    weight: 1,
    control: { signal: 4 },
    stopNear: [530, 84],
    path: [[892, 14], ['L', 543, 82], ['L', 449, 91], ['C', 389, 97, 264, 272, 330, 317], ['L', 395, 361], ['L', 519, 436], ['L', 582, 471]],
  },
];

/** Traffic sliders in the menu: one per approach, each feeding one or more lanes. */
export interface TrafficGroup {
  id: string;
  label: string;
  description: string;
  /** Share of the group's cars that use each lane. */
  lanes: Record<string, number>;
  /** Cars per minute. */
  initial: number;
}

export const MAX_CARS_PER_MINUTE = 40;

export const TRAFFIC_GROUPS: TrafficGroup[] = [
  {
    id: 'se',
    label: 'Glavna ↘',
    description: 'Glavna cesta, vozila prema jugoistoku',
    lanes: { 'se-left': 0.6, 'se-right': 0.4 },
    initial: 20,
  },
  {
    id: 'nw',
    label: 'Glavna ↖',
    description: 'Glavna cesta, vozila prema sjeverozapadu',
    lanes: { 'nw-right': 0.6, 'nw-left': 0.4 },
    initial: 20,
  },
  {
    id: 'side',
    label: 'Sporedna ←',
    description: 'Sporedna cesta, vozila prema raskrižju',
    lanes: { side: 1 },
    initial: 8,
  },
];

/**
 * Spawn interval per lane for a group at `carsPerMinute`: the mean gap gives that rate,
 * with +-40% jitter so cars don't arrive like clockwork. Null means no cars.
 */
export function laneIntervals(group: TrafficGroup, carsPerMinute: number): Record<string, [number, number] | null> {
  const out: Record<string, [number, number] | null> = {};
  for (const [lane, share] of Object.entries(group.lanes)) {
    const perMinute = carsPerMinute * share;
    const mean = 60 / perMinute;
    out[lane] = perMinute > 0 ? [mean * 0.6, mean * 1.4] : null;
  }
  return out;
}

/** Initial spawn intervals for every lane. */
export function initialIntervals(): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const group of TRAFFIC_GROUPS) {
    for (const [lane, interval] of Object.entries(laneIntervals(group, group.initial))) {
      if (interval) out[lane] = interval;
    }
  }
  return out;
}
