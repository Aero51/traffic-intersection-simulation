// Cars driving along routes and obeying the signals. Replaces the original
// PathTransition + checkForCollision(), which paused one square at signal 1's stop line.
// Pure TypeScript: positions are distances along routes sampled every pixel.

import type { SimSnapshot } from './sim';

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
  path: [Point, ...Segment[]];
}

export interface Route {
  def: RouteDef;
  /** x, y pairs, one per pixel of length. */
  points: Float64Array;
  length: number;
  stopAt: number;
}

/** Cars entering from one side of the map, shared between that side's lanes. */
export interface TrafficGroup {
  id: string;
  /** Share of the group's cars that use each lane. */
  lanes: Record<string, number>;
}

export interface Car {
  id: number;
  group: string;
  route: Route;
  /** Distance of the car's front along its route. */
  s: number;
  v: number;
  color: string;
}

export const CAR_LENGTH = 22;
export const MIN_GAP = 5;
export const MAX_SPEED = 60; // px/s
const ACCEL = 35;
const BRAKE = 70; // comfortable deceleration, px/s^2

/** How far before its stop line a waiting car is picked up by the induction loop. */
export const LOOP_LENGTH = 40;
const SPAWN_SPACING: [number, number] = [0.6, 1.4]; // seconds between cars from one side

export const CAR_COLORS = ['#c62828', '#1565c0', '#eeeeee', '#212121', '#9e9e9e', '#f9a825', '#2e7d32', '#6d4c41'];

// ------------------------------------------------------------------ geometry

function flatten(path: RouteDef['path']): Point[] {
  const [start, ...segments] = path;
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

export function buildRoute(def: RouteDef): Route {
  const points = resample(flatten(def.path));
  const length = points.length / 2 - 1;
  let stopAt = 0;
  let best = Infinity;
  for (let i = 0; i <= length; i++) {
    const d = Math.hypot(points[2 * i] - def.stopNear[0], points[2 * i + 1] - def.stopNear[1]);
    if (d < best) [best, stopAt] = [d, i];
  }
  return { def, points, length, stopAt };
}

/** Position and heading (radians) at distance `s` along a route. */
export function pose(route: Route, s: number): { x: number; y: number; angle: number } {
  const clamp = (i: number) => Math.min(route.length, Math.max(0, Math.round(i)));
  const i = clamp(s);
  const a = clamp(s - 4);
  const b = clamp(s + 4);
  const p = route.points;
  return {
    x: p[2 * i],
    y: p[2 * i + 1],
    angle: Math.atan2(p[2 * b + 1] - p[2 * a + 1], p[2 * b] - p[2 * a]),
  };
}

/** How far two routes run along the same pixels from their start. */
function sharedPrefix(a: Route, b: Route): number {
  if (a === b) return Infinity;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i <= n && Math.hypot(a.points[2 * i] - b.points[2 * i], a.points[2 * i + 1] - b.points[2 * i + 1]) < 1.5) i++;
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

export class Traffic {
  readonly routes: Route[];
  cars: Car[] = [];
  private nextId = 1;
  private shared = new Map<Route, Map<Route, number>>();
  private spawnTimers = new Map<string, number>();
  private targets = new Map<string, number>();

  constructor(
    defs: RouteDef[],
    private groups: TrafficGroup[],
    private random: () => number = Math.random,
  ) {
    this.routes = defs.map(buildRoute);
    for (const a of this.routes) {
      const m = new Map<Route, number>();
      for (const b of this.routes) if (a.def.lane === b.def.lane) m.set(b, sharedPrefix(a, b));
      this.shared.set(a, m);
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
    return this.cars.some((car) => {
      const toLine = car.route.stopAt - car.s;
      return toLine >= -0.5 && toLine <= LOOP_LENGTH && car.v < 1 && lightFor(car.route.def.control, snap) !== 'go';
    });
  }

  /** Add a car at the start of a route if there's room. Returns it, or null. */
  spawn(route: Route, group = route.def.lane): Car | null {
    const room = this.roomAhead(route, 0, null);
    if (room < 0) return null;
    const car: Car = {
      id: this.nextId++,
      group,
      route,
      s: 0,
      v: Math.min(MAX_SPEED, Math.sqrt(2 * BRAKE * room)),
      color: CAR_COLORS[Math.floor(this.random() * CAR_COLORS.length)],
    };
    this.cars.push(car);
    return car;
  }

  step(dt: number, snap: SimSnapshot): void {
    if (dt <= 0) return;
    this.spawnDue(dt);

    // Free distance for each car, from positions at the start of the step.
    const limits = this.cars.map((car) => this.limitFor(car, snap));
    this.cars.forEach((car, i) => {
      const limit = limits[i];
      const target = Math.min(MAX_SPEED, Math.sqrt(2 * BRAKE * Math.max(0, limit)));
      car.v = car.v < target ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - 3 * BRAKE * dt);
      car.s += Math.min(car.v * dt, Math.max(0, limit));
    });
    this.cars = this.cars.filter((c) => c.s - CAR_LENGTH < c.route.length);
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
    let limit = this.roomAhead(car.route, car.s, car);

    const { stopAt, def } = car.route;
    const toLine = stopAt - car.s;
    if (toLine >= -0.5) {
      const light = lightFor(def.control, snap);
      const stoppingDistance = (car.v * car.v) / (2 * BRAKE);
      // On yellow, only stop if it can be done comfortably; otherwise drive through.
      if (light === 'stop' || (light === 'caution' && stoppingDistance <= toLine + 2)) {
        limit = Math.min(limit, Math.max(0, toLine));
      }
    }
    return limit;
  }

  /**
   * Free distance from a front bumper at `s` on `route` to the rear bumper of the nearest
   * car ahead, minus the safety gap, counting cars on other routes of the same lane while both are still on
   * the shared stretch.
   */
  private roomAhead(route: Route, s: number, self: Car | null): number {
    let room = Infinity;
    const shared = this.shared.get(route)!;
    for (const other of this.cars) {
      if (other === self) continue;
      const prefix = shared.get(other.route);
      if (prefix === undefined) continue; // different lane
      const sameRoute = other.route === route;
      // A new car (self === null) counts anything at the entry as ahead of it.
      const ahead = other.s > s || (other.s === s && (self === null || other.id < self.id));
      if (!ahead) continue;
      if (!sameRoute && (other.s - CAR_LENGTH > prefix || s > prefix)) continue;
      room = Math.min(room, other.s - CAR_LENGTH - MIN_GAP - s);
    }
    return room;
  }
}
