// Route geometry: sampling paths into routes, where routes conflict with each other and with
// pedestrian crossings. Pure TypeScript, no state; traffic.ts drives cars along these.

import { SCENE_HEIGHT, SCENE_WIDTH } from './layout';
import { crossingLength, KERB, type Crossing, type Walker } from './pedestrians';

export const MAX_SPEED = 85; // px/s

export const BRAKE = 110; // comfortable deceleration, px/s^2

export const LATERAL_ACCEL = 70; // how hard cars corner, px/s^2

/** Paths closer than this (centre to centre) make cars touch: widest car plus a margin. */
export const CONFLICT_DISTANCE = 24;

/** Extra length on each side of a crossing zone, for car corners at an angle. */
export const ZONE_PADDING = 12;

/** Cars on paths closer than this (centre to centre) touch side by side. */
export const TOUCH_DISTANCE = 20;

/** Merging roads approach at an angle; start zip merging while they're still this far apart. */
export const MERGE_DISTANCE = 45;

/** A merge stays claimed until the car's rear is this far past the point where the roads join. */
export const JOIN_MARGIN = 10;

/** Route points this far beyond the stripes (car's front corners) already count as on them. */
export const CROSSWALK_MARGIN = 4;

/** Half a car's width plus a little: how much of the crossing a passing car covers. */
export const CROSSWALK_BODY = 12;

/** A walker this far past a car's path no longer holds it. */
export const CROSSWALK_PASSED = 6;

export type Point = [number, number];
export type Segment = ['L', number, number] | ['C', number, number, number, number, number, number];

export interface Control {
  /** Vehicle signal index (0-4). */
  signal: number;
  /** Turn arrow index (0-2) that also lets this route go. */
  arrow?: number;
}

export interface RouteDef {
  id: string;
  /** Routes in the same lane share an entry point and queue behind each other. */
  lane: string;
  weight: number;
  control: Control;
  /** The stop line is the point on the route closest to this. */
  stopNear: Point;
  /** Which indicator a car on this route uses before it leaves its lane-mates. */
  turn?: 'left' | 'right';
  /** Extend both ends straight on by this many px, so cars enter and leave off-screen. */
  extend?: number;
  path: [Point, ...Segment[]];
}

export interface Route {
  def: RouteDef;
  /** x, y pairs, one per pixel of length. */
  points: Float64Array;
  /** Highest speed at each pixel that still allows braking for the curves ahead. */
  speed: Float64Array;
  length: number;
  stopAt: number;
  /** Where this route leaves the others in its lane (its turn), or Infinity. */
  divergeAt: number;
}

/**
 * Where a route meets a route from another lane, found from the geometry: the paths come
 * within CONFLICT_DISTANCE of each other. `at`/`otherAt` are stretches on each route.
 * A 'merge' runs to the end of both routes (they leave on the same road); a 'cross' is
 * a crossing or near miss inside the junction.
 */
export interface Conflict {
  kind: 'cross' | 'merge';
  /** Same for both routes' view of one meeting point. */
  key: string;
  other: Route;
  at: [number, number];
  otherAt: [number, number];
  /** Merge: where the two roads have actually joined; positions are compared from here. */
  join: [number, number];
  /** Cars on this route give way to cars on the other at a crossing. */
  yields: boolean;
}

/** Where a route drives over a pedestrian crossing. */
export interface CrosswalkZone {
  crossing: Crossing;
  /** Stretch of the route on the stripes. */
  at: [number, number];
  /** Stretch of the crossing (distance from its kerb a) the cars' bodies cover. */
  u: [number, number];
}


function flatten(def: RouteDef): Point[] {
  const [start, ...segments] = def.path;
  const out: Point[] = [start];
  let [x0, y0] = start;
  for (const seg of segments) {
    if (seg[0] === 'L') {
      out.push([seg[1], seg[2]]);
      [x0, y0] = [seg[1], seg[2]];
    } else {
      const [, x1, y1, x2, y2, x, y] = seg;
      const steps = 48;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        out.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        ]);
      }
      [x0, y0] = [x, y];
    }
  }
  const e = def.extend ?? 0;
  if (e > 0) {
    const away = ([ax, ay]: Point, [bx, by]: Point): Point => {
      const len = Math.hypot(ax - bx, ay - by);
      return [ax + ((ax - bx) / len) * e, ay + ((ay - by) / len) * e];
    };
    out.unshift(away(out[0], out[1]));
    out.push(away(out[out.length - 1], out[out.length - 2]));
  }
  return out;
}

/** Resample a polyline at 1 px spacing. */
function resample(poly: Point[]): Float64Array {
  const out: number[] = [poly[0][0], poly[0][1]];
  let carry = 0; // distance already covered past the last emitted sample
  for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1];
    const [bx, by] = poly[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = 1 - carry;
    while (d <= len) {
      const t = d / len;
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      d += 1;
    }
    carry = len - (d - 1);
  }
  return Float64Array.from(out);
}

/** Corner speed limit from curvature, then a backward pass so cars brake before curves. */
function speedProfile(points: Float64Array, length: number): Float64Array {
  const speed = new Float64Array(length + 1).fill(MAX_SPEED);
  const k = 6;
  const heading = (a: number, b: number) =>
    Math.atan2(points[2 * b + 1] - points[2 * a + 1], points[2 * b] - points[2 * a]);
  for (let i = k; i <= length - k; i++) {
    let turn = Math.abs(heading(i, i + k) - heading(i - k, i));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const curvature = turn / k;
    if (curvature > 1e-4) speed[i] = Math.min(MAX_SPEED, Math.sqrt(LATERAL_ACCEL / curvature));
  }
  for (let i = length - 1; i >= 0; i--) {
    speed[i] = Math.min(speed[i], Math.sqrt(speed[i + 1] ** 2 + 2 * BRAKE));
  }
  return speed;
}

export function buildRoute(def: RouteDef): Route {
  const points = resample(flatten(def));
  const length = points.length / 2 - 1;
  let stopAt = 0;
  let best = Infinity;
  for (let i = 0; i <= length; i++) {
    const d = Math.hypot(points[2 * i] - def.stopNear[0], points[2 * i + 1] - def.stopNear[1]);
    if (d < best) [best, stopAt] = [d, i];
  }
  return { def, points, speed: speedProfile(points, length), length, stopAt, divergeAt: Infinity };
}

/** Position and heading (radians) at distance `s` along a route, averaged over `span` px. */
export function pose(route: Route, s: number, span = 8): { x: number; y: number; angle: number } {
  const clamp = (i: number) => Math.min(route.length, Math.max(0, Math.round(i)));
  const i = clamp(s);
  const a = clamp(s - span / 2);
  const b = clamp(s + span / 2);
  const p = route.points;
  return {
    x: p[2 * i],
    y: p[2 * i + 1],
    angle: Math.atan2(p[2 * b + 1] - p[2 * a + 1], p[2 * b] - p[2 * a]),
  };
}

/** Straight on beats turning right beats turning left; ties go to the earlier route. */
export function priority(route: Route, index: number): number {
  const rank = route.def.turn === 'left' ? 0 : route.def.turn === 'right' ? 1 : 2;
  return rank * 1000 - index;
}

/** Stretches where route `a` comes close to route `b` (see Conflict). */
export function findConflicts(a: Route, b: Route, aYields: boolean): Conflict[] {
  const out: Conflict[] = [];
  const key = [a.def.id, b.def.id].sort().join('|');
  // Distance from each (every other) point of `a` to the nearest point of `b`.
  const dist: number[] = [];
  const near: number[] = [];
  let run: [number, number, number, number] | null = null;
  const close = (endOfRoute: boolean) => {
    if (!run) return;
    const [a0, a1, b0, b1] = run;
    run = null;
    const mid = Math.round((a0 + a1) / 2);
    const [mx, my] = [a.points[2 * mid], a.points[2 * mid + 1]];
    // Routes start and end beyond the picture edge; meetings out there don't matter.
    if (mx < 0 || my < 0 || mx > SCENE_WIDTH || my > SCENE_HEIGHT) return;
    // Running off the end of either route means both leave on the same road. (Requiring
    // both ends can miss by a few px where the routes run off-screen at slightly different
    // angles, and then one side would treat the merge as a crossing.)
    if (endOfRoute || b1 >= b.length - 4) {
      // Compare positions from where cars on the two roads would first touch: on a shallow
      // angle the stretches before and after that point differ noticeably in length.
      let k = a0 / 2;
      while (k < dist.length - 1 && dist[k] > TOUCH_DISTANCE) k++;
      const join: [number, number] = [2 * k, near[k]];
      out.push({ kind: 'merge', key, other: b, at: [a0, a.length], otherAt: [b0, b.length], join, yields: false });
    } else {
      const pad = (lo: number, hi: number, len: number): [number, number] =>
        [Math.max(0, lo - ZONE_PADDING), Math.min(len, hi + ZONE_PADDING)];
      out.push({ kind: 'cross', key, other: b, at: pad(a0, a1, a.length), otherAt: pad(b0, b1, b.length), join: [a0, b0], yields: aYields });
    }
  };
  for (let i = 0; i <= a.length; i += 2) {
    let best = Infinity;
    let bi = 0;
    for (let j = 0; j <= b.length; j += 2) {
      const d = Math.hypot(a.points[2 * i] - b.points[2 * j], a.points[2 * i + 1] - b.points[2 * j + 1]);
      if (d < best) [best, bi] = [d, j];
    }
    dist.push(best);
    near.push(bi);
  }
  dist.forEach((d, k) => {
    const i = 2 * k;
    if (d < CONFLICT_DISTANCE) {
      const bi = near[k];
      run = run ? [run[0], i, Math.min(run[2], bi), Math.max(run[3], bi)] : [i, i, bi, bi];
    } else {
      close(false);
    }
  });
  if (run) {
    // The routes leave together: begin the merge earlier, while the roads still converge.
    let k = (run as [number, number, number, number])[0] / 2;
    while (k > 0 && dist[k - 1] < MERGE_DISTANCE) k--;
    run = [2 * k, run[1], Math.min(run[2], near[k]), run[3]];
  }
  close(true);
  return out;
}

/**
 * How far two routes of one lane stay close enough from their start that cars on them
 * would touch: up to there they queue as one lane, even a little past the actual split.
 */
export function sharedPrefix(a: Route, b: Route, within = CONFLICT_DISTANCE): number {
  if (a === b) return Infinity;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i <= n && Math.hypot(a.points[2 * i] - b.points[2 * i], a.points[2 * i + 1] - b.points[2 * i + 1]) < within) i++;
  return i;
}

/** Where a car's claim on a zone ends: the end of a crossing, or just past a merge's join. */
export function claimEnd(z: Conflict): number {
  return z.kind === 'cross' ? z.at[1] : z.join[0] + JOIN_MARGIN;
}

/** Stretches of a route that run over a crossing's stripes. */
export function findCrosswalks(route: Route, crossing: Crossing): CrosswalkZone[] {
  const len = crossingLength(crossing);
  const [ax, ay] = crossing.a;
  const ux = (crossing.b[0] - ax) / len;
  const uy = (crossing.b[1] - ay) / len;
  const out: CrosswalkZone[] = [];
  let zone: CrosswalkZone | null = null;
  for (let i = 0; i <= route.length; i++) {
    const dx = route.points[2 * i] - ax;
    const dy = route.points[2 * i + 1] - ay;
    const u = dx * ux + dy * uy;
    const across = Math.abs(-dx * uy + dy * ux);
    if (u >= 0 && u <= len && across <= crossing.halfWidth + CROSSWALK_MARGIN) {
      if (!zone) out.push((zone = { crossing, at: [i, i], u: [u, u] }));
      zone.at[1] = i;
      zone.u = [Math.min(zone.u[0], u), Math.max(zone.u[1], u)];
    } else {
      zone = null;
    }
  }
  for (const z of out) z.u = [z.u[0] - CROSSWALK_BODY, z.u[1] + CROSSWALK_BODY];
  return out;
}

/** Is this walker on the road and not yet past the cars' path over the crossing? */
export function walkerInPath(w: Walker, z: CrosswalkZone): boolean {
  if (w.crossing !== z.crossing || !w.walking || w.t < KERB || w.t > 1) return false;
  const len = crossingLength(w.crossing);
  return w.reverse ? (1 - w.t) * len > z.u[0] - CROSSWALK_PASSED : w.t * len < z.u[1] + CROSSWALK_PASSED;
}
