// Cars driving along routes and obeying the signals. Replaces the original
// PathTransition + checkForCollision(), which paused one square at signal 1's stop line.
// Pure TypeScript: positions are distances along routes sampled every pixel.

import type { SimSnapshot } from './sim';
import { SCENE_HEIGHT, SCENE_WIDTH } from './layout';

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

/** Cars entering from one side of the map, shared between that side's lanes. */
export interface TrafficGroup {
  id: string;
  /** Share of the group's cars that use each lane. */
  lanes: Record<string, number>;
}

export type VehicleKind = 'sedan' | 'hatch' | 'van';

export interface VehicleType {
  kind: VehicleKind;
  length: number;
  width: number;
  weight: number;
}

/** Sized after the cars parked in the background photo (about 40-46 x 18-19 px). */
export const VEHICLE_TYPES: VehicleType[] = [
  { kind: 'sedan', length: 42, width: 18, weight: 5 },
  { kind: 'hatch', length: 36, width: 17, weight: 3 },
  { kind: 'van', length: 48, width: 20, weight: 1.2 },
];

export interface Car {
  id: number;
  group: string;
  route: Route;
  kind: VehicleKind;
  length: number;
  width: number;
  /** Distance of the car's front along its route. */
  s: number;
  v: number;
  color: string;
  /** Slowing down or standing still: brake lights on. */
  braking: boolean;
  /** Standing still because something is in the way (last step). */
  blocked: boolean;
  /** Has claimed its whole way through the junction (decided at its stop line). */
  cleared: boolean;
  /** Seconds spent waiting at its gate for another road's traffic (not a red light or a queue). */
  waited: number;
  /** Set each step while it waits at its gate for another road's traffic. */
  yielding: boolean;
  indicator: 'left' | 'right' | null;
}

export const MIN_GAP = 7;
export const MAX_SPEED = 85; // px/s
const ACCEL = 50;
const BRAKE = 110; // comfortable deceleration, px/s^2
const LATERAL_ACCEL = 70; // how hard cars corner, px/s^2

/** Paths closer than this (centre to centre) make cars touch: widest car plus a margin. */
const CONFLICT_DISTANCE = 24;
/** Extra length on each side of a crossing zone, for car corners at an angle. */
const ZONE_PADDING = 12;
/** Cars on paths closer than this (centre to centre) touch side by side. */
const TOUCH_DISTANCE = 20;
/** Merging roads approach at an angle; start zip merging while they're still this far apart. */
const MERGE_DISTANCE = 45;
/**
 * Beyond the stop line a car needs this much room past its own length (the crosswalk)
 * before it may enter, so it never ends up standing on the crosswalk.
 */
const CLEAR_JUNCTION = 45;
/** A merge stays claimed until the car's rear is this far past the point where the roads join. */
const JOIN_MARGIN = 10;
/** Seconds between one road's last car leaving a merge and the other road's car reaching it. */
const MERGE_HEADWAY = 1;
/** Longest time step the car model takes at once, so fast cars can't skip past each other. */
const MAX_STEP = 1 / 60;
/** A car yields if a car with priority would reach the crossing within this many seconds. */
const GAP_TIME = 2.2;
/**
 * After waiting this long for a gap, a car that gives way goes as soon as the crossing is
 * physically free (like a driver nosing out), so it can't be starved by endless traffic.
 */
const PATIENCE = 8;

/** How far before its stop line a waiting car is picked up by the induction loop. */
export const LOOP_LENGTH = 50;
const SPAWN_SPACING: [number, number] = [0.6, 1.4]; // seconds between cars from one side

/** Indicator: on from this far before the turn until this far into it. */
const INDICATE_BEFORE = 220;
const INDICATE_AFTER = 120;

export const CAR_COLORS = [
  '#b71c1c', '#0d47a1', '#eceff1', '#eceff1', '#212121', '#263238', '#9e9e9e', '#78909c',
  '#f9a825', '#1b5e20', '#4e342e', '#e65100', '#1565c0', '#cfd8dc',
];

// ------------------------------------------------------------------ geometry

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
function priority(route: Route, index: number): number {
  const rank = route.def.turn === 'left' ? 0 : route.def.turn === 'right' ? 1 : 2;
  return rank * 1000 - index;
}

/** Stretches where route `a` comes close to route `b` (see Conflict). */
function findConflicts(a: Route, b: Route, aYields: boolean): Conflict[] {
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
function sharedPrefix(a: Route, b: Route, within = CONFLICT_DISTANCE): number {
  if (a === b) return Infinity;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i <= n && Math.hypot(a.points[2 * i] - b.points[2 * i], a.points[2 * i + 1] - b.points[2 * i + 1]) < within) i++;
  return i;
}

// ------------------------------------------------------------------ signals

export type Light = 'go' | 'caution' | 'stop';

export function lightFor(control: Control, snap: SimSnapshot): Light {
  const v = snap.vehicles[control.signal];
  if (v.green || v.yellowBlinking) return 'go';
  if (control.arrow !== undefined && snap.turns[control.arrow].green) return 'go';
  if (v.red) return 'stop';
  if (v.yellow) return 'caution';
  return 'go';
}

// ------------------------------------------------------------------ traffic
//
// How the junction works: every car decides once, at its gate (its stop line, or just
// before its first conflict if that comes earlier). It either claims its whole way through
// - every crossing and merge on its route - or it waits at the gate. Once through the
// gate it never stops for another road's car again; it only follows the car in front.
// A claim blocks the *other* road only, so a platoon on the same route can share it.
// Claims are released zone by zone as the car's rear leaves each one.

export class Traffic {
  readonly routes: Route[];
  cars: Car[] = [];
  readonly conflicts = new Map<Route, Conflict[]>();
  private nextId = 1;
  private shared = new Map<Route, Map<Route, number>>();
  private spawnTimers = new Map<string, number>();
  private targets = new Map<string, number>();
  /** Where each route's cars decide whether they may enter the junction. */
  private gate = new Map<Route, number>();
  /** Cars holding each conflict zone (keyed like Conflict.key). */
  private claims = new Map<string, Set<Car>>();
  /** The car that limited the last roomAhead result. */
  private leaderCar: Car | null = null;

  constructor(
    defs: RouteDef[],
    private groups: TrafficGroup[],
    private random: () => number = Math.random,
  ) {
    this.routes = defs.map(buildRoute);
    for (const a of this.routes) {
      const m = new Map<Route, number>();
      for (const b of this.routes) {
        if (a.def.lane !== b.def.lane) continue;
        m.set(b, sharedPrefix(a, b));
        // Indicators are timed from where the paths actually split.
        if (a !== b && a.def.turn) a.divergeAt = Math.min(a.divergeAt, sharedPrefix(a, b, 1.5));
      }
      this.shared.set(a, m);
    }
    this.routes.forEach((a, i) => {
      const list: Conflict[] = [];
      this.routes.forEach((b, j) => {
        if (a.def.lane !== b.def.lane) list.push(...findConflicts(a, b, priority(a, i) < priority(b, j)));
      });
      this.conflicts.set(a, list);
    });
    // Both routes' views of one crossing share a key, so a claim covers both.
    let n = 0;
    for (const [a, list] of this.conflicts) {
      for (const c of list) {
        if (c.kind !== 'cross' || c.key.includes('#')) continue;
        const twin = this.conflicts.get(c.other)!.find(
          (d) => d.kind === 'cross' && d.other === a && d.at[0] <= c.otherAt[1] && c.otherAt[0] <= d.at[1] && !d.key.includes('#'),
        );
        c.key = `${c.key}#${n}`;
        if (twin) twin.key = c.key;
        n++;
      }
    }
    for (const r of this.routes) {
      const first = Math.min(...this.conflicts.get(r)!.map((c) => c.at[0]));
      this.gate.set(r, Math.min(r.stopAt, first - 2));
    }
    // Stagger the first cars so the sides don't all start at once.
    for (const g of groups) this.spawnTimers.set(g.id, this.random() * 2);
  }

  /**
   * How many cars should be driving in from one side ("Vozila istok/sjever/zapad" in the
   * MVC version). New cars enter until the count is reached; lowering it lets the extra
   * cars drive off without being replaced.
   */
  setTarget(groupId: string, count: number): void {
    this.targets.set(groupId, count);
  }

  count(groupId: string): number {
    return this.cars.filter((c) => c.group === groupId).length;
  }

  /**
   * Induction loops ("induktivna petlja"): true if a car is standing in front of a stop
   * line that isn't letting it through.
   */
  waitingAtRed(snap: SimSnapshot): boolean {
    return this.occupiedLoops(snap).size > 0;
  }

  /** Lanes whose induction loop currently has a car waiting on it. */
  occupiedLoops(snap: SimSnapshot): Set<string> {
    const lanes = new Set<string>();
    for (const car of this.cars) {
      const toLine = car.route.stopAt - car.s;
      if (toLine >= -0.5 && toLine <= LOOP_LENGTH && car.v < 1 && lightFor(car.route.def.control, snap) !== 'go') {
        lanes.add(car.route.def.lane);
      }
    }
    return lanes;
  }

  /** Add a car at the start of a route if there's room. Returns it, or null. */
  spawn(route: Route, group = route.def.lane): Car | null {
    const room = this.roomAhead(route, 0, null);
    if (room < 0) return null;
    const type = this.pick(VEHICLE_TYPES.map((t) => [t, t.weight] as const));
    const car: Car = {
      id: this.nextId++,
      group,
      route,
      kind: type.kind,
      length: type.length,
      width: type.width,
      s: 0,
      v: Math.min(route.speed[0], Math.sqrt(2 * BRAKE * room)),
      color: CAR_COLORS[Math.floor(this.random() * CAR_COLORS.length)],
      braking: false,
      blocked: false,
      cleared: false,
      waited: 0,
      yielding: false,
      indicator: null,
    };
    this.cars.push(car);
    return car;
  }

  step(dt: number, snap: SimSnapshot): void {
    if (dt <= 0) return;
    const steps = Math.ceil(dt / MAX_STEP - 1e-9);
    for (let i = 0; i < steps; i++) this.substep(dt / steps, snap);
  }

  private substep(dt: number, snap: SimSnapshot): void {
    this.spawnDue(dt);

    // Free distance for each car, from positions at the start of the step. (Claims made
    // here are seen by the cars evaluated after, so two cars can't both claim a zone.)
    const limits = this.cars.map((car) => this.limitFor(car, snap));
    this.cars.forEach((car, i) => {
      const limit = limits[i];
      const { route } = car;
      const curve = route.speed[Math.min(route.length, Math.max(0, Math.floor(car.s)))];
      const target = Math.min(curve, Math.sqrt(2 * BRAKE * Math.max(0, limit)));
      car.braking = target < car.v - 0.5 || car.v < 1;
      car.v = car.v < target ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - 3 * BRAKE * dt);
      car.s += Math.min(car.v * dt, Math.max(0, limit));
      car.blocked = limit < 0.5 && car.v < 1;
      car.waited = car.yielding && car.blocked ? car.waited + dt : 0;

      const d = car.s - route.divergeAt;
      car.indicator = route.def.turn && d > -INDICATE_BEFORE && d < INDICATE_AFTER ? route.def.turn : null;
    });
    this.cars = this.cars.filter((c) => c.s - c.length < c.route.length);

    // Release zones the cars have left, and everything held by cars that drove off.
    const alive = new Set(this.cars);
    for (const [key, holders] of this.claims) {
      for (const car of holders) {
        const zone = this.conflicts.get(car.route)!.find((z) => z.key === key);
        if (!alive.has(car) || !zone || car.s - car.length > claimEnd(zone)) holders.delete(car);
      }
      if (holders.size === 0) this.claims.delete(key);
    }
  }

  private spawnDue(dt: number): void {
    for (const group of this.groups) {
      const t = (this.spawnTimers.get(group.id) ?? 0) - dt;
      if (t > 0) {
        this.spawnTimers.set(group.id, t);
        continue;
      }
      if (this.count(group.id) >= (this.targets.get(group.id) ?? 0)) {
        this.spawnTimers.set(group.id, 0);
        continue;
      }
      const lane = this.pick(Object.entries(group.lanes));
      const route = this.pick(this.routes.filter((r) => r.def.lane === lane).map((r) => [r, r.def.weight] as const));
      const [min, max] = SPAWN_SPACING;
      // Retry soon if the entry is blocked by a queue.
      this.spawnTimers.set(group.id, this.spawn(route, group.id) ? min + this.random() * (max - min) : 0.3);
    }
  }

  private pick<T>(weighted: readonly (readonly [T, number])[]): T {
    let r = this.random() * weighted.reduce((sum, [, w]) => sum + w, 0);
    return (weighted.find(([, w]) => (r -= w) < 0) ?? weighted[0])[0];
  }

  /** Distance this car may still travel before it has to be stopped. */
  private limitFor(car: Car, snap: SimSnapshot): number {
    const limit = Math.min(this.roomAhead(car.route, car.s, car), this.exitRoom(car));
    car.yielding = false;
    if (car.cleared) return Math.min(limit, this.mergeSafety(car)); // committed: only the car in front matters now

    if (this.heldAtLine(car, snap)) return Math.min(limit, Math.max(0, car.route.stopAt - car.s));
    // Decide when the gate is about a stopping distance away (or already reached).
    const toGate = this.gate.get(car.route)! - car.s;
    if (toGate > (car.v * car.v) / (2 * BRAKE) + 15) return limit;
    const verdict = this.canEnter(car, snap);
    if (verdict === 'go') {
      this.claimPassage(car);
      return limit;
    }
    car.yielding = verdict === 'other road';
    return Math.min(limit, Math.max(0, toGate));
  }

  /** Stopping for the signal: red, or yellow when it can still stop comfortably. */
  private heldAtLine(car: Car, snap: SimSnapshot): boolean {
    const toLine = car.route.stopAt - car.s;
    if (toLine < -0.5) return false;
    const light = lightFor(car.route.def.control, snap);
    const stoppingDistance = (car.v * car.v) / (2 * BRAKE);
    return light === 'stop' || (light === 'caution' && stoppingDistance <= toLine + 2);
  }

  /**
   * May this car enter the junction now? Every conflict on its way must be free of the
   * other road's cars (claimed or physically there); at a crossing where it gives way, no
   * car with priority may be about to arrive; and there must be room to get all the way
   * through the crossings (and off the crosswalk) without stopping.
   */
  private canEnter(car: Car, snap: SimSnapshot): 'go' | 'other road' | 'no room' {
    let clearUntil = car.route.stopAt + CLEAR_JUNCTION;
    for (const z of this.conflicts.get(car.route)!) {
      if (z.kind === 'merge') {
        // A merge can be far down the exit road: what matters is whether the other road's
        // cars will be past it by the time this car gets there.
        const arrival = Math.max(0, z.at[0] - car.s) / MAX_SPEED;
        const leaveAt = z.join[1] + JOIN_MARGIN;
        for (const o of this.cars) {
          if (o.route !== z.other || o.s - o.length > leaveAt) continue;
          const coming = o.cleared || (o.s > z.otherAt[0] && o.s - o.length < leaveAt);
          if (!coming) continue;
          if ((leaveAt + o.length - o.s) / Math.max(o.v, 20) + MERGE_HEADWAY > arrival) return 'other road';
        }
        continue;
      }
      for (const holder of this.claims.get(z.key) ?? []) if (holder.route === z.other) return 'other road';
      const [o0, o1] = z.otherAt;
      for (const o of this.cars) {
        if (o.route !== z.other) continue;
        if (o.s > o0 && o.s - o.length < o1) return 'other road'; // physically in the way
        // Someone on the other road has run out of patience waiting: let them go first.
        if (!o.cleared && o.waited > PATIENCE && o.waited > car.waited) return 'other road';
        if (z.kind !== 'cross' || !z.yields || o.cleared || o.blocked || car.waited > PATIENCE) continue;
        // Gap acceptance: is a car with priority about to reach its own gate?
        const theirGate = this.gate.get(o.route)!;
        if (o.s > theirGate + 0.5 || this.heldAtLine(o, snap)) continue;
        if (theirGate - o.s < 25 + o.v * GAP_TIME) return 'other road';
      }
      clearUntil = Math.max(clearUntil, z.at[1]);
    }
    return this.queueRoom(car) >= clearUntil - car.s + car.length ? 'go' : 'no room';
  }

  /**
   * Backstop for merges: if the other road's car is unexpectedly still in the merge when
   * this one gets there (e.g. it slowed down in a jam), wait just before the merge.
   */
  private mergeSafety(car: Car): number {
    let limit = Infinity;
    for (const z of this.conflicts.get(car.route)!) {
      if (z.kind !== 'merge' || car.s >= z.at[0]) continue;
      const leaveAt = z.join[1] + JOIN_MARGIN;
      for (const o of this.cars) {
        if (o.route !== z.other) continue;
        // Already on the shared exit ahead of this car: exitRoom follows it instead.
        if (o.s >= z.join[1] && o.s - z.join[1] + z.join[0] > car.s) continue;
        if (o.s > z.otherAt[0] && o.s - o.length < leaveAt) limit = Math.min(limit, z.at[0] - 1 - car.s);
      }
    }
    return Math.max(0, limit);
  }

  private claimPassage(car: Car): void {
    car.cleared = true;
    for (const z of this.conflicts.get(car.route)!) {
      if (z.kind === 'merge') continue; // merges are judged on timing, see canEnter
      if (car.s - car.length > claimEnd(z)) continue;
      let holders = this.claims.get(z.key);
      if (!holders) this.claims.set(z.key, (holders = new Set()));
      holders.add(car);
    }
  }

  /**
   * Room on a shared exit road: cars from the other road that have already merged count
   * as being in front (measured from where the two roads join).
   */
  private exitRoom(car: Car): number {
    let room = Infinity;
    for (const z of this.conflicts.get(car.route)!) {
      if (z.kind !== 'merge') continue;
      const [j, oj] = z.join;
      for (const o of this.cars) {
        if (o.route !== z.other || o.s < oj) continue;
        const virtual = o.s - oj + j;
        if (virtual > car.s) room = Math.min(room, virtual - o.length - MIN_GAP - car.s);
      }
    }
    return room;
  }

  /**
   * Room ahead once the queue in front has closed up: follows the cars ahead in this lane
   * to the first one that is standing (or creeping in a jam beyond the junction) and
   * stacks the moving ones behind it. Infinity if traffic ahead is flowing freely.
   */
  private queueRoom(car: Car): number {
    const chain: Car[] = [];
    let current = car;
    for (;;) {
      this.roomAhead(current.route, current.s, current);
      const leader = this.leaderCar;
      if (!leader || chain.includes(leader) || chain.length > 30) return Infinity;
      chain.push(leader);
      const beyondJunction = leader.s - leader.length > car.route.stopAt + CLEAR_JUNCTION;
      if (leader.v < 1 || (leader.v < 20 && beyondJunction)) break;
      current = leader;
    }
    let rear = chain[chain.length - 1].s - chain[chain.length - 1].length;
    for (let i = chain.length - 2; i >= 0; i--) rear -= MIN_GAP + chain[i].length;
    return rear - MIN_GAP - car.s;
  }

  /**
   * Free distance from a front bumper at `s` on `route` to the rear bumper of the nearest
   * car ahead, minus the safety gap, counting cars on other routes of the same lane while
   * both are still on the shared stretch.
   */
  private roomAhead(route: Route, s: number, self: Car | null): number {
    let room = Infinity;
    this.leaderCar = null;
    const shared = this.shared.get(route)!;
    for (const other of this.cars) {
      if (other === self) continue;
      const prefix = shared.get(other.route);
      if (prefix === undefined) continue; // different lane
      const sameRoute = other.route === route;
      // A new car (self === null) counts anything at the entry as ahead of it.
      const ahead = other.s > s || (other.s === s && (self === null || other.id < self.id));
      if (!ahead) continue;
      const rear = other.s - other.length;
      if (!sameRoute && (rear > prefix || s > prefix)) continue;
      if (rear - MIN_GAP - s < room) [room, this.leaderCar] = [rear - MIN_GAP - s, other];
    }
    return room;
  }
}

/** Where a car's claim on a zone ends: the end of a crossing, or just past a merge's join. */
function claimEnd(z: Conflict): number {
  return z.kind === 'cross' ? z.at[1] : z.join[0] + JOIN_MARGIN;
}
