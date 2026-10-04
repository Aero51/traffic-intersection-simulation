// Cars driving along routes and obeying the signals. Replaces the original
// PathTransition + checkForCollision(), which paused one square at signal 1's stop line.
// Pure TypeScript: positions are distances along routes sampled every pixel.

import type { SimSnapshot } from './sim';
import { CROSSINGS, type Crossing, type Walker } from './pedestrians';
import {
  BRAKE, JOIN_MARGIN, MAX_SPEED, buildRoute, claimEnd, findConflicts, findCrosswalks, priority, sharedPrefix, walkerInPath,
  type Conflict, type Control, type CrosswalkZone, type Route, type RouteDef,
} from './geometry';

export { MAX_SPEED, buildRoute, pose } from './geometry';
export type { Conflict, Control, CrosswalkZone, Point, Route, RouteDef, Segment } from './geometry';

/** Cars entering from one side of the map, shared between that side's lanes. */
export interface TrafficGroup {
  id: string;
  /** Share of the group's cars that use each lane. */
  lanes: Record<string, number>;
}

export type VehicleKind = 'sedan' | 'hatch' | 'van' | 'bus' | 'truck' | 'moto' | 'bike' | 'ambulance';

export interface VehicleType {
  kind: VehicleKind;
  length: number;
  width: number;
  weight: number;
  /** Acceleration and top speed relative to a car. */
  accel?: number;
  speed?: number;
}

/** Sized after the cars parked in the background photo (about 40-46 x 18-19 px). */
export const VEHICLE_TYPES: VehicleType[] = [
  { kind: 'sedan', length: 42, width: 18, weight: 5 },
  { kind: 'hatch', length: 36, width: 17, weight: 3 },
  { kind: 'van', length: 48, width: 20, weight: 1.2 },
];

/** Added with `variety`: slow, long buses and lorries, nimble motorbikes, and slow bicycles. */
export const EXTRA_VEHICLE_TYPES: VehicleType[] = [
  { kind: 'bus', length: 68, width: 20, weight: 0.5, accel: 0.5, speed: 0.85 },
  { kind: 'truck', length: 58, width: 20, weight: 0.6, accel: 0.55, speed: 0.85 },
  { kind: 'moto', length: 20, width: 8, weight: 0.9, accel: 1.5 },
  { kind: 'bike', length: 17, width: 7, weight: 0.7, accel: 0.45, speed: 0.32 },
];

export const AMBULANCE: VehicleType = { kind: 'ambulance', length: 48, width: 20, weight: 0 };

/** Why a car is going slower than it could (for the "follow a car" label). */
export type CarStatus =
  | 'free' | 'curve' | 'start' | 'red' | 'yellow' | 'queue' | 'yield' | 'blocked' | 'crosswalk' | 'merge' | 'stalled';

/** A car crossing its stop line, for the statistics. */
export interface PassEvent {
  group: string;
  lane: string;
  /** Seconds it stood (or crawled) before the line. */
  wait: number;
  emergency: boolean;
  kind: VehicleKind;
}

/** Optional realism, off by default so the model stays simple to test. */
export interface TrafficOptions {
  /** Buses, lorries, motorbikes and bicycles among the cars. */
  variety: boolean;
  /** Each driver gets their own top speed, acceleration, gap, reaction time and yellow-light habit. */
  drivers: boolean;
  /** Road grip: 1 dry, lower in the rain (slower corners, longer braking). */
  grip: number;
}

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
  /** Driver/vehicle: top speed (px/s), acceleration (px/s^2), gap to the car in front (px). */
  maxV: number;
  accel: number;
  gap: number;
  /** Seconds before moving off once the way is clear. */
  reaction: number;
  /** Time spent so far reacting. */
  starting: number;
  /** Drives through a yellow it could still stop for, if close to the line. */
  bold: boolean;
  emergency: boolean;
  /** What held the car back in the last step (see CarStatus). */
  status: CarStatus;
  /** Seconds spent standing before the stop line so far. */
  wait: number;
  passedLine: boolean;
  /** Broken down: seconds left before the driver gets going again (0 = fine). Hazard lights on. */
  stalled: number;
  /** While yielding: the other road's car it waits for, and why (for the debug view). */
  blocker: { car: Car; why: 'merge' | 'claim' | 'in the way' | 'patience' | 'gap' } | null;
}

/** How long a broken-down car blocks its lane. */
export const INCIDENT_SECONDS = 25;
export const MIN_GAP = 7;
const ACCEL = 50;

/**
 * Beyond the stop line a car needs this much room past its own length (the crosswalk)
 * before it may enter, so it never ends up standing on the crosswalk.
 */
const CLEAR_JUNCTION = 45;
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

/** Cars stop this far before the stripes when people are crossing. */
const CROSSWALK_STOP = 6;

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
  options: TrafficOptions = { variety: false, drivers: false, grip: 1 };
  /** Cars that crossed their stop line since the last drainEvents(). */
  private events: PassEvent[] = [];
  readonly conflicts = new Map<Route, Conflict[]>();
  readonly crosswalks = new Map<Route, CrosswalkZone[]>();
  /** People crossing the road, passed in each step. */
  private walkers: readonly Walker[] = [];
  private nextId = 1;
  private shared = new Map<Route, Map<Route, number>>();
  private spawnTimers = new Map<string, number>();
  private targets = new Map<string, number>();
  /** Where each route's cars decide whether they may enter the junction. */
  readonly gate = new Map<Route, number>();
  /** Cars holding each conflict zone (keyed like Conflict.key). */
  readonly claims = new Map<string, Set<Car>>();
  /** The car that limited the last roomAhead result. */
  private leaderCar: Car | null = null;

  constructor(
    defs: RouteDef[],
    private groups: TrafficGroup[],
    private random: () => number = Math.random,
    crossings: Crossing[] = CROSSINGS,
  ) {
    this.routes = defs.map(buildRoute);
    for (const r of this.routes) this.crosswalks.set(r, crossings.flatMap((c) => findCrosswalks(r, c)));
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

  private get brake(): number {
    return BRAKE * this.options.grip;
  }

  /** Stopping distance at speed v. */
  private stopping(v: number): number {
    return (v * v) / (2 * this.brake);
  }

  /** Stop-line crossings since the last call. */
  drainEvents(): PassEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Cars standing (or crawling) before their stop line in these lanes. */
  queued(lanes: readonly string[]): number {
    return this.cars.filter((c) => lanes.includes(c.route.def.lane) && !c.passedLine && c.v < 3 && c.route.stopAt - c.s < 400).length;
  }

  /** Cars within `distance` px before their stop line in these lanes (moving or not). */
  approaching(lanes: readonly string[], distance: number): number {
    return this.cars.filter((c) => lanes.includes(c.route.def.lane) && !c.passedLine && c.route.stopAt - c.s <= distance).length;
  }

  /** Buses within `distance` px before their stop line in these lanes (moving or not). */
  busesApproaching(lanes: readonly string[], distance: number): number {
    return this.cars.filter((c) => c.kind === 'bus' && lanes.includes(c.route.def.lane) && !c.passedLine && c.route.stopAt - c.s <= distance).length;
  }

  /** An ambulance that has not yet got through the junction, if any. */
  emergencyApproaching(): Car | null {
    return this.cars.find((c) => c.emergency && c.s - c.length < c.route.stopAt + CLEAR_JUNCTION) ?? null;
  }

  /** Send an ambulance down a route. Null if the entry is blocked. */
  spawnEmergency(route: Route): Car | null {
    return this.spawn(route, 'emergency', AMBULANCE);
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

  /**
   * A car on its way to the stop line breaks down where it stands, blocking its lane for
   * `seconds`. Picks the one closest to the line that is still clear of the junction.
   */
  breakDown(seconds = INCIDENT_SECONDS): Car | null {
    let pick: Car | null = null;
    for (const car of this.cars) {
      if (car.emergency || car.passedLine || car.stalled > 0 || car.cleared) continue;
      if (car.s < 40 || car.route.stopAt - car.s < 30) continue;
      if (!pick || car.s > pick.s) pick = car;
    }
    if (pick) pick.stalled = seconds;
    return pick;
  }

  /** Add a car at the start of a route if there's room. Returns it, or null. */
  spawn(route: Route, group = route.def.lane, forced?: VehicleType): Car | null {
    const room = this.roomAhead(route, 0, null);
    if (room < 0) return null;
    const types = this.options.variety ? [...VEHICLE_TYPES, ...EXTRA_VEHICLE_TYPES] : VEHICLE_TYPES;
    const type = forced ?? this.pick(types.map((t) => [t, t.weight] as const));
    const emergency = type.kind === 'ambulance';
    // Per-driver differences (only drawn when enabled, so seeded runs stay comparable).
    const d = this.options.drivers && !emergency
      ? { speed: 0.86 + this.random() * 0.2, accel: 0.75 + this.random() * 0.5, gap: 1 + this.random() * 0.7, reaction: 0.25 + this.random() * 0.65, bold: this.random() < 0.25 }
      : { speed: 1, accel: 1, gap: 1, reaction: 0, bold: false };
    const maxV = Math.min(MAX_SPEED * 1.05, MAX_SPEED * (type.speed ?? 1) * d.speed);
    const car: Car = {
      id: this.nextId++,
      group,
      route,
      kind: type.kind,
      length: type.length,
      width: type.width,
      s: 0,
      v: Math.min(route.speed[0], maxV, Math.sqrt(2 * this.brake * room)),
      color: emergency ? '#f4f4f4' : CAR_COLORS[Math.floor(this.random() * CAR_COLORS.length)],
      braking: false,
      blocked: false,
      cleared: false,
      waited: 0,
      yielding: false,
      indicator: null,
      maxV,
      accel: ACCEL * (type.accel ?? 1) * d.accel,
      gap: MIN_GAP * d.gap,
      reaction: d.reaction,
      starting: 0,
      bold: d.bold,
      emergency,
      status: 'free',
      wait: 0,
      passedLine: false,
      stalled: 0,
      blocker: null,
    };
    this.cars.push(car);
    return car;
  }

  /**
   * Is it unsafe to step onto this crossing? True while a car is on the stripes, or is
   * about to reach them too fast to stop comfortably.
   */
  crosswalkBusy(crossing: Crossing): boolean {
    return this.cars.some((car) =>
      this.crosswalks.get(car.route)!.some(
        (z) =>
          z.crossing === crossing &&
          car.s - car.length < z.at[1] &&
          car.s + this.stopping(car.v) > z.at[0] - CROSSWALK_STOP / 2,
      ),
    );
  }

  step(dt: number, snap: SimSnapshot, walkers: readonly Walker[] = []): void {
    this.walkers = walkers;
    if (dt <= 0) return;
    const steps = Math.ceil(dt / MAX_STEP - 1e-9);
    for (let i = 0; i < steps; i++) this.substep(dt / steps, snap);
  }

  private substep(dt: number, snap: SimSnapshot): void {
    this.spawnDue(dt);

    // Free distance for each car, from positions at the start of the step. (Claims made
    // here are seen by the cars evaluated after, so two cars can't both claim a zone.)
    const limits = this.cars.map((car) => this.limitFor(car, snap));
    const grip = Math.sqrt(this.options.grip);
    this.cars.forEach((car, i) => {
      let limit = limits[i];
      const { route } = car;
      if (car.stalled > 0) {
        car.stalled = Math.max(0, car.stalled - dt);
        car.v = 0;
        car.braking = true;
        car.status = 'stalled';
        car.indicator = null;
        return;
      }
      // A driver standing still takes a moment to react before moving off.
      let reacting = false;
      if (car.v < 1 && limit > 1 && car.starting < car.reaction) {
        car.starting += dt;
        limit = 0;
        reacting = true;
      } else if (limit <= 1) {
        car.starting = 0;
      }
      const bend = route.speed[Math.min(route.length, Math.max(0, Math.floor(car.s)))];
      const curve = bend * grip;
      const free = Math.min(curve, car.maxV);
      const brakeCap = Math.sqrt(2 * this.brake * Math.max(0, limit));
      const target = Math.min(free, brakeCap);
      if (reacting) car.status = 'start';
      else if (brakeCap >= free) car.status = bend < MAX_SPEED - 1 && curve < car.maxV - 1 ? 'curve' : 'free';
      car.braking = target < car.v - 0.5 || car.v < 1;
      car.v = car.v < target ? Math.min(target, car.v + car.accel * dt) : Math.max(target, car.v - 3 * this.brake * dt);
      car.s += Math.min(car.v * dt, Math.max(0, limit));
      car.blocked = limit < 0.5 && car.v < 1;
      car.waited = car.yielding && car.blocked ? car.waited + dt : 0;
      if (!car.passedLine) {
        if (car.v < 3) car.wait += dt;
        // Cars stop exactly on the line, so only count it once they're properly over it.
        if (car.s > route.stopAt + 1) {
          car.passedLine = true;
          this.events.push({ group: car.group, lane: route.def.lane, wait: car.wait, emergency: car.emergency, kind: car.kind });
        }
      }

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

  /** Distance this car may still travel before it has to be stopped (and why, in car.status). */
  private limitFor(car: Car, snap: SimSnapshot): number {
    let limit = Infinity;
    const bind = (value: number, status: CarStatus) => {
      if (value < limit) [limit, car.status] = [value, status];
    };
    car.status = 'free';
    bind(this.roomAhead(car.route, car.s, car), 'queue');
    bind(this.exitRoom(car), 'queue');
    bind(this.crosswalkRoom(car), 'crosswalk');
    car.yielding = false;
    if (car.cleared) {
      bind(this.mergeSafety(car), 'merge'); // committed: only the car in front matters now
      return limit;
    }

    const gate = this.gate.get(car.route)!;
    const light = this.heldAtLine(car, snap);
    if (light) {
      // Wait at the gate if it comes before the stop line, or the car's nose would already
      // stick into the oncoming lane it has to cross (and block those cars on green).
      bind(Math.max(0, Math.min(car.route.stopAt, gate) - car.s), light === 'stop' ? 'red' : 'yellow');
      return limit;
    }
    // Decide when the gate is about a stopping distance away (or already reached).
    const toGate = gate - car.s;
    if (toGate > this.stopping(car.v) + 15) return limit;
    const verdict = this.canEnter(car, snap);
    if (verdict === 'go') {
      this.claimPassage(car);
      return limit;
    }
    car.yielding = verdict === 'other road';
    bind(Math.max(0, toGate), car.yielding ? 'yield' : 'blocked');
    return limit;
  }

  /**
   * Stopping for the signal: red, or yellow when it can still stop comfortably (a bold
   * driver close to the line carries on). Returns the light it stops for, or null.
   */
  private heldAtLine(car: Car, snap: SimSnapshot): 'stop' | 'caution' | null {
    const toLine = car.route.stopAt - car.s;
    if (toLine < -0.5) return null;
    const light = lightFor(car.route.def.control, snap);
    if (light === 'stop') return 'stop';
    if (light !== 'caution') return null;
    if (car.bold && toLine < car.v * 1.6) return null;
    return this.stopping(car.v) <= toLine + 2 ? 'caution' : null;
  }

  /**
   * May this car enter the junction now? Every conflict on its way must be free of the
   * other road's cars (claimed or physically there); at a crossing where it gives way, no
   * car with priority may be about to arrive; and there must be room to get all the way
   * through the crossings (and off the crosswalk) without stopping.
   */
  private canEnter(car: Car, snap: SimSnapshot): 'go' | 'other road' | 'no room' {
    const block = (o: Car, why: NonNullable<Car['blocker']>['why']) => {
      car.blocker = { car: o, why };
      return 'other road' as const;
    };
    car.blocker = null;
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
          if ((leaveAt + o.length - o.s) / Math.max(o.v, 20) + MERGE_HEADWAY > arrival) return block(o, 'merge');
        }
        continue;
      }
      for (const holder of this.claims.get(z.key) ?? []) if (holder.route === z.other) return block(holder, 'claim');
      const [o0, o1] = z.otherAt;
      for (const o of this.cars) {
        if (o.route !== z.other) continue;
        if (o.s > o0 && o.s - o.length < o1) return block(o, 'in the way');
        // Someone on the other road has run out of patience waiting: let them go first.
        if (!o.cleared && o.waited > PATIENCE && o.waited > car.waited) return block(o, 'patience');
        if (z.kind !== 'cross' || !z.yields || o.cleared || o.blocked || car.waited > PATIENCE || car.emergency) continue;
        // Gap acceptance: is a car with priority about to reach its own gate?
        const theirGate = this.gate.get(o.route)!;
        if (o.s > theirGate + 0.5 || this.heldAtLine(o, snap)) continue;
        if (theirGate - o.s < 25 + (o.v * GAP_TIME) / this.options.grip) return block(o, 'gap');
      }
      clearUntil = Math.max(clearUntil, z.at[1]);
    }
    return this.queueRoom(car) >= clearUntil - car.s + car.length ? 'go' : 'no room';
  }

  /**
   * Room before the next crosswalk while someone on it still has to cross this car's path.
   * Once the car's front is on the stripes it carries on (walkers wait for it instead).
   */
  private crosswalkRoom(car: Car): number {
    let room = Infinity;
    for (const z of this.crosswalks.get(car.route)!) {
      if (car.s > z.at[0] - CROSSWALK_STOP + 0.5) continue;
      if (this.walkers.some((w) => walkerInPath(w, z))) room = Math.min(room, z.at[0] - CROSSWALK_STOP - car.s);
    }
    return Math.max(0, room);
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
        if (virtual > car.s) room = Math.min(room, virtual - o.length - car.gap - car.s);
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
      const gap = self?.gap ?? MIN_GAP;
      if (rear - gap - s < room) [room, this.leaderCar] = [rear - gap - s, other];
    }
    return room;
  }
}
