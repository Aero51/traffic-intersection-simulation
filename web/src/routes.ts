// Car routes. Based on GlavnaKlasa.putGore(), which strung eight routes into one Path for
// a single red square. The two turning arcs were replaced with cubic curves that stay on
// the road, and each route is tied to the signal (and turn arrow) next to it.

import type { Point, RouteDef, TrafficGroup } from './traffic';
import type { StringKey } from './i18n';

/** Cars enter and leave this far beyond the picture edge instead of popping in. */
const OFF_SCREEN = 90;

/**
 * Stop points on the white stop bar painted on the photo, just before the crosswalk
 * (from about (500, 330) to (470, 385) on the main road; x = 512 on the side road).
 * The original's invisible `linija` at (529, 384) was a car length further back.
 */
const STOP_BAR_NW_RIGHT: Point = [497, 348];
const STOP_BAR_NW_LEFT: Point = [481, 378];
const STOP_BAR_SIDE: Point = [517, 86];

export const ROUTE_DEFS: RouteDef[] = [
  // North-west bound main road (from bottom right).
  {
    id: 'nw-straight',
    extend: OFF_SCREEN,
    lane: 'nw-right',
    weight: 3,
    control: { signal: 0 },
    stopNear: STOP_BAR_NW_RIGHT,
    path: [
      [703, 466],
      ['L', 542, 375],
      ['L', 396, 287],
      ['L', 275, 204],
      ['L', 159, 118],
      ['L', 18, 4],
    ],
  },
  {
    id: 'nw-right-turn',
    extend: OFF_SCREEN,
    turn: 'right',
    lane: 'nw-right',
    weight: 2,
    control: { signal: 0, arrow: 0 },
    stopNear: STOP_BAR_NW_RIGHT,
    path: [
      [703, 466],
      ['L', 542, 375],
      ['L', 396, 287],
      ['C', 362, 266, 392, 148, 451, 137],
      ['L', 637, 101],
      ['L', 891, 47],
    ],
  },
  {
    id: 'nw-left-lane',
    extend: OFF_SCREEN,
    lane: 'nw-left',
    weight: 1,
    control: { signal: 1 },
    stopNear: STOP_BAR_NW_LEFT,
    path: [
      [653, 470],
      ['L', 446, 357],
      ['L', 316, 275],
      ['L', 182, 177],
      ['L', 1, 39],
    ],
  },
  // South-east bound main road (from top left).
  {
    id: 'se-straight',
    extend: OFF_SCREEN,
    lane: 'se-left',
    weight: 3,
    control: { signal: 3 },
    stopNear: [99, 150],
    path: [
      [2, 73],
      ['L', 64, 128],
      ['L', 279, 283],
      ['L', 395, 361],
      ['L', 519, 436],
      ['L', 582, 471],
    ],
  },
  {
    id: 'se-left-turn',
    extend: OFF_SCREEN,
    turn: 'left',
    lane: 'se-left',
    weight: 1,
    control: { signal: 3, arrow: 1 },
    stopNear: [99, 150],
    path: [
      [2, 73],
      ['L', 64, 128],
      ['C', 110, 169, 300, 150, 441, 136],
      ['L', 637, 101],
      ['L', 891, 47],
    ],
  },
  {
    id: 'se-right-lane',
    extend: OFF_SCREEN,
    lane: 'se-right',
    weight: 1,
    control: { signal: 2 },
    stopNear: [48, 190],
    path: [
      [0, 117],
      ['L', 53, 157],
      ['L', 279, 324],
      ['L', 453, 436],
      ['L', 498, 471],
    ],
  },
  // Side road, coming in from the east.
  {
    id: 'side-right-turn',
    extend: OFF_SCREEN,
    turn: 'right',
    lane: 'side',
    weight: 2,
    control: { signal: 4, arrow: 2 },
    stopNear: STOP_BAR_SIDE,
    path: [
      [892, 14],
      ['L', 543, 82],
      ['L', 377, 98],
      ['L', 288, 93],
      ['L', 169, 74],
      ['L', 58, 35],
      ['L', 14, 0],
    ],
  },
  {
    id: 'side-left-turn',
    extend: OFF_SCREEN,
    turn: 'left',
    lane: 'side',
    weight: 1,
    control: { signal: 4 },
    stopNear: STOP_BAR_SIDE,
    path: [
      [892, 14],
      ['L', 543, 82],
      ['L', 449, 91],
      ['C', 389, 97, 264, 272, 330, 317],
      ['L', 395, 361],
      ['L', 519, 436],
      ['L', 582, 471],
    ],
  },
];

/** The MVC version's sliders: cars arriving from the east, north and west, 0-15 each. */
export interface TrafficSlider extends TrafficGroup {
  label: StringKey;
  description: StringKey;
  initial: number;
}

export const MAX_CARS = 15;

export const TRAFFIC_GROUPS: TrafficSlider[] = [
  {
    id: 'istok',
    label: 'traffic.istok',
    description: 'traffic.istok.desc',
    lanes: { 'nw-right': 0.6, 'nw-left': 0.4 },
    initial: 8,
  },
  {
    id: 'sjever',
    label: 'traffic.sjever',
    description: 'traffic.sjever.desc',
    lanes: { side: 1 },
    initial: 4,
  },
  {
    id: 'zapad',
    label: 'traffic.zapad',
    description: 'traffic.zapad.desc',
    lanes: { 'se-left': 0.6, 'se-right': 0.4 },
    initial: 8,
  },
];
