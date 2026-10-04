// Signal timing logic, ported from GlavnaKlasa.podesavanjeSemaforaZadnje().
//
// The original ran one JavaFX Timeline per vehicle signal and kept them in step with
// playFrom(otherTimeline.getCurrentTime()). Here a single clock drives everything:
// each vehicle signal is a list of keyframes on its own cycle, with a phase offset, and
// advance() fires every keyframe that falls inside the elapsed interval in time order.
// Pure TypeScript, no DOM, so it can be unit-tested.

export const VEHICLE_COUNT = 5;
export const PEDESTRIAN_COUNT = 4;
export const TURN_COUNT = 3;

/** Seconds of green ("otvorenost") and red ("zatvorenost") for one vehicle signal. */
export interface SignalTiming {
  open: number;
  closed: number;
}

export interface Lights {
  red: boolean;
  yellow: boolean;
  green: boolean;
  /** Only vehicle signals blink (yellow, in "Policajac" mode). */
  yellowBlinking: boolean;
}

/** "Mod rada": main road priority, side road priority, or flashing yellow ("Policajac"). */
export type Mode = 'normal' | 'secondary' | 'flashing';
/** The two timing plans; each keeps its own timings. */
export type Plan = Exclude<Mode, 'flashing'>;
/** Signals 1-4 (main road) move together, signal 5 (side road) is the other phase. */
export type Phase = 'main' | 'side';

export interface SimSnapshot {
  vehicles: Lights[];
  pedestrians: Lights[];
  turns: Lights[];
}

/** Defaults from start(): signals 1-4 open 10 / closed 10, signal 5 open 4 / closed 13. */
export const DEFAULT_TIMINGS: SignalTiming[] = [
  { open: 10, closed: 10 },
  { open: 10, closed: 10 },
  { open: 10, closed: 10 },
  { open: 10, closed: 10 },
  { open: 4, closed: 13 },
];

/**
 * "Sporedni prednost": the same 23 s cycle, but the side road gets the long green
 * (signal 5 green from 9 s to 19 s, while signals 1-4 are red from 6 s to 22 s).
 */
export const SECONDARY_TIMINGS: SignalTiming[] = [
  { open: 4, closed: 16 },
  { open: 4, closed: 16 },
  { open: 4, closed: 16 },
  { open: 4, closed: 16 },
  { open: 10, closed: 7 },
];

export const PLAN_TIMINGS: Record<Plan, SignalTiming[]> = { normal: DEFAULT_TIMINGS, secondary: SECONDARY_TIMINGS };

export const YELLOW = 2; // green -> red transition
export const RED_YELLOW = 1; // red -> green transition
/** All-red clearance before the conflicting road gets red+yellow. */
export const ALL_RED = 1;

const MAIN_SIGNALS = [0, 1, 2, 3];
const SIDE_SIGNALS = [4];

interface Keyframe {
  at: number; // seconds into the cycle
  fire: () => void;
}

interface Track {
  offset: number; // absolute time (s) at which cycle 0 of this track started
  cycle: number; // seconds
  keyframes: Keyframe[];
}

/**
 * Emergency vehicle priority: the normal cycle is suspended, the other road is cleared
 * (yellow, all-red) and the ambulance's road gets green until release().
 */
interface Preemption {
  phase: Phase;
  releasing: boolean;
  /** release() was called before the road had turned green; release once it has. */
  pendingRelease: boolean;
  /** Seconds into the current script. */
  t: number;
  keyframes: Keyframe[];
}

/** Lamp notation used by the timeline and the look-ahead: 'R', 'Y', 'G', 'RY', '' or '*'. */
export function lampKey(l: Lights): string {
  if (l.yellowBlinking) return '*';
  return (l.red ? 'R' : '') + (l.yellow ? 'Y' : '') + (l.green ? 'G' : '');
}

export interface TimelineSegment {
  from: number;
  to: number;
  lamps: string;
}

/** One cycle of the current plan, for each vehicle signal. */
export interface Timeline {
  cycle: number;
  rows: TimelineSegment[][];
}

const dark = (): Lights => ({ red: false, yellow: false, green: false, yellowBlinking: false });
const isGreen = (l: Lights) => l.green && !l.yellow && !l.red;
const copyTimings = (t: SignalTiming[]) => t.map((x) => ({ ...x }));

export class Simulation {
  private plans: Record<Plan, SignalTiming[]>;
  private _plan: Plan = 'normal';
  private tracks: (Track | null)[] = [];
  private vehicles: Lights[] = Array.from({ length: VEHICLE_COUNT }, dark);
  private pedestrians: Lights[] = Array.from({ length: PEDESTRIAN_COUNT }, dark);
  private turns: Lights[] = Array.from({ length: TURN_COUNT }, dark);
  /**
   * Tipkalo requests (`iskljuciPjesake` in the original), one per crossing: pedestrians 6/7
   * cross the main road at its next red, 8/9 cross the side road when signal 5 next turns red.
   */
  private mainRequest = false;
  private sideRequest = false;
  private mainCrossing = false;
  private sideCrossing = false;
  private preemption: Preemption | null = null;
  private _time = 0;
  private _mode: Mode = 'normal';

  constructor(timings: SignalTiming[] = DEFAULT_TIMINGS) {
    this.plans = { normal: copyTimings(timings), secondary: copyTimings(SECONDARY_TIMINGS) };
    this.startNormal();
  }

  get time(): number {
    return this._time;
  }

  get mode(): Mode {
    return this._mode;
  }

  /** The timing plan in use (or the one flashing mode will return to). */
  get plan(): Plan {
    return this._plan;
  }

  private get timings(): SignalTiming[] {
    return this.plans[this._plan];
  }

  timing(index: number): SignalTiming {
    return { ...this.timings[index] };
  }

  /** All timings of a plan (copies). */
  planTimings(plan: Plan = this._plan): SignalTiming[] {
    return copyTimings(this.plans[plan]);
  }

  /** Cycle length (s) of a vehicle signal's track. */
  cycleLength(index: number): number {
    return this.tracks[index]?.cycle ?? 0;
  }

  snapshot(): SimSnapshot {
    const copy = (l: Lights) => ({ ...l });
    return {
      vehicles: this.vehicles.map(copy),
      pedestrians: this.pedestrians.map(copy),
      turns: this.turns.map(copy),
    };
  }

  /** True from a Tipkalo press until the pedestrians get green. */
  get pedestrianRequestPending(): boolean {
    return this.mainRequest || this.sideRequest;
  }

  /** Pending Tipkalo requests per crossing (main: 6/7 across the main road, side: 8/9). */
  get pedestrianRequests(): { main: boolean; side: boolean } {
    return { main: this.mainRequest, side: this.sideRequest };
  }

  /** Which road has a steady green right now (null during changes, or when flashing). */
  get greenPhase(): Phase | null {
    if (MAIN_SIGNALS.some((i) => isGreen(this.vehicles[i]))) return 'main';
    if (SIDE_SIGNALS.some((i) => isGreen(this.vehicles[i]))) return 'side';
    return null;
  }

  /** A signal is between green and red (yellow or red+yellow, not blinking). */
  get changing(): boolean {
    return this.vehicles.some((v) => v.yellow && !v.yellowBlinking);
  }

  /** The road an emergency vehicle has been given priority on, if any. */
  get preempted(): Phase | null {
    return this.preemption?.phase ?? null;
  }

  /**
   * "Tipkalo": pedestrians 6 and 7 get green at the main road's next red, and 8 and 9 at
   * signal 5's next red (as in the MVC version). Ignored in "Policajac" mode.
   * `crossing` limits the request to one crossing (a person arriving at that kerb).
   */
  requestPedestrians(crossing?: 'main' | 'side'): void {
    if (this._mode === 'flashing') return;
    if (crossing !== 'side') this.mainRequest = true;
    if (crossing !== 'main') this.sideRequest = true;
  }

  /** Advance the clock by `dt` seconds, firing every keyframe in (time, time + dt]. */
  advance(dt: number): void {
    if (dt <= 0) return;
    const from = this._time;
    const to = from + dt;
    if (this.preemption) this.runScript(dt);
    else this.fireBetween(from, to, false);
    this._time = to;
  }

  /** Mode switch from the "Mod rada" choice box. */
  setMode(mode: Mode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode !== 'flashing') this._plan = mode;
    this.stopAll();
    if (mode === 'flashing') {
      for (const v of this.vehicles) v.yellowBlinking = true;
    } else {
      this.startNormal();
    }
  }

  /** Replace a plan's timings (reset, shared link). Restarts the cycle if that plan is running. */
  setPlanTimings(plan: Plan, timings: SignalTiming[]): void {
    this.plans[plan] = copyTimings(timings);
    if (plan === this._plan && this._mode !== 'flashing') {
      this.stopAll();
      this.startNormal();
    }
  }

  /**
   * "Prihvati": change one vehicle signal's timing. Like the original, the rebuilt
   * signal continues at the same cycle position as a reference signal (2, or 3 when
   * signal 2 itself is edited) so it stays roughly in step with the others.
   * Unlike the original it shows the correct lights right away instead of going dark
   * until its next keyframe.
   */
  applyTiming(index: number, timing: SignalTiming): void {
    this.timings[index] = { ...timing };
    // While flashing (or giving way to an ambulance) the new timing waits for the next start.
    if (this._mode === 'flashing' || this.preemption) return;

    const reference = index === 1 ? 2 : 1;
    const refPosition = this.cyclePosition(reference);

    this.vehicles[index] = dark();
    this.tracks[index] = this.buildTrack(index, this._time);
    // Signal 5's cycle is padded to signal 2's, so rebuild it when signal 2 changes.
    if (index === 1 && this.tracks[4]) {
      this.tracks[4] = this.buildTrack(4, this.tracks[4].offset);
    }

    const track = this.tracks[index]!;
    const position = refPosition % track.cycle;
    track.offset = this._time - position;
    this.replayTo(index, position);
  }

  /**
   * Emergency vehicle approaching on `phase`'s road: clear the other road and hold green
   * for it until release(). Ignored when flashing or while another preemption runs.
   */
  preempt(phase: Phase): void {
    if (this._mode === 'flashing') return;
    const p = this.preemption;
    if (p) {
      if (p.phase === phase && !p.releasing) p.pendingRelease = false;
      return;
    }
    this.preemption = { phase, releasing: false, pendingRelease: false, t: 0, keyframes: this.enterScript(phase) };
    this.fireScriptAt(0);
  }

  /** The emergency vehicle has passed: change back and restart the normal cycle. */
  release(): void {
    const p = this.preemption;
    if (!p || p.releasing) return;
    if (p.keyframes.some((k) => k.at > p.t)) {
      p.pendingRelease = true;
      return;
    }
    this.startRelease();
  }

  /** Seconds into the cycle of a vehicle signal's track. */
  cyclePosition(index: number): number {
    const track = this.tracks[index];
    if (!track) return 0;
    const p = (this._time - track.offset) % track.cycle;
    return p < 0 ? p + track.cycle : p;
  }

  /** Absolute time of the next keyframe (anything that can change a lamp), or Infinity. */
  nextKeyframeTime(): number {
    const p = this.preemption;
    if (p) {
      const next = p.keyframes.find((k) => k.at > p.t + 1e-9);
      return next ? this._time + next.at - p.t : Infinity;
    }
    let best = Infinity;
    for (const track of this.tracks) {
      if (!track) continue;
      const c = Math.floor((this._time - track.offset) / track.cycle);
      for (const cycle of [c, c + 1]) {
        for (const kf of track.keyframes) {
          const t = track.offset + cycle * track.cycle + kf.at;
          if (t > this._time + 1e-9 && t < best) best = t;
        }
      }
    }
    return best;
  }

  /** An independent copy, for looking ahead without touching this simulation. */
  clone(): Simulation {
    const c = new Simulation(this.plans.normal);
    c.plans = { normal: copyTimings(this.plans.normal), secondary: copyTimings(this.plans.secondary) };
    c._plan = this._plan;
    c._mode = this._mode;
    c._time = this._time;
    // Copy the lamps first: keyframes capture the pedestrian lamp objects when built.
    c.vehicles = this.vehicles.map((l) => ({ ...l }));
    c.pedestrians = this.pedestrians.map((l) => ({ ...l }));
    c.turns = this.turns.map((l) => ({ ...l }));
    c.mainRequest = this.mainRequest;
    c.sideRequest = this.sideRequest;
    c.mainCrossing = this.mainCrossing;
    c.sideCrossing = this.sideCrossing;
    c.tracks = this.tracks.map((t, i) => (t ? { ...c.buildTrack(i, t.offset), cycle: t.cycle } : null));
    const p = this.preemption;
    c.preemption = p && { ...p, keyframes: p.releasing ? c.releaseScript(p.phase) : c.enterScript(p.phase) };
    return c;
  }

  /**
   * Seconds until a lamp group next changes (e.g. green -> yellow), looking at most
   * `horizon` seconds ahead, or null if it doesn't (flashing, or held by an ambulance).
   */
  nextChange(kind: keyof SimSnapshot, index: number, horizon = 180): number | null {
    const c = this.clone();
    const start = lampKey(c[kind][index]);
    while (c._time - this._time < horizon) {
      const t = c.nextKeyframeTime();
      if (!Number.isFinite(t)) return null;
      c.advance(t - c._time + 1e-6);
      if (lampKey(c[kind][index]) !== start) return c._time - this._time;
    }
    return null;
  }

  /** One cycle of the current plan from its start, for the timing diagram. Null when flashing. */
  planTimeline(): Timeline | null {
    if (this._mode === 'flashing') return null;
    const s = new Simulation(this.plans.normal);
    s.plans = { normal: copyTimings(this.plans.normal), secondary: copyTimings(this.plans.secondary) };
    if (this._plan !== 'normal') s.setMode(this._plan);
    const cycle = Math.max(...s.tracks.map((t) => t?.cycle ?? 0));
    const rows: TimelineSegment[][] = s.vehicles.map((v) => [{ from: 0, to: cycle, lamps: lampKey(v) }]);
    for (;;) {
      const t = s.nextKeyframeTime();
      if (!(t < cycle - 1e-9)) break;
      s.advance(t - s._time + 1e-9);
      s.vehicles.forEach((v, i) => {
        const row = rows[i];
        const last = row[row.length - 1];
        const lamps = lampKey(v);
        if (lamps === last.lamps) return;
        last.to = t;
        row.push({ from: t, to: cycle, lamps });
      });
    }
    return { cycle, rows };
  }

  // ---------------------------------------------------------------- internals

  private startNormal(): void {
    for (let i = 0; i < VEHICLE_COUNT; i++) this.tracks[i] = null;
    for (let i = 0; i < VEHICLE_COUNT; i++) this.tracks[i] = this.buildTrack(i, this._time);
    // Fire the keyframes at t = 0 (the original used playFrom(-1s) for the same reason).
    this.fireBetween(this._time, this._time, true);
  }

  /** sviStop(): stop all tracks and turn every lamp off. */
  private stopAll(): void {
    this.tracks = [];
    this.preemption = null;
    this.mainRequest = this.sideRequest = false;
    this.mainCrossing = this.sideCrossing = false;
    for (const group of [this.vehicles, this.pedestrians, this.turns]) {
      for (let i = 0; i < group.length; i++) group[i] = dark();
    }
  }

  private setCrossing(peds: Lights[], green: boolean): void {
    for (const ped of peds) {
      ped.green = green;
      ped.red = !green;
    }
  }

  /** Re-run one track's keyframes from cycle start up to `position` to restore its lamps. */
  private replayTo(index: number, position: number): void {
    for (const kf of this.tracks[index]!.keyframes) {
      if (kf.at <= position) kf.fire();
    }
  }

  private fireBetween(from: number, to: number, inclusiveFrom: boolean): void {
    const due: { time: number; track: number; cycle: number; order: number; kf: Keyframe }[] = [];

    this.tracks.forEach((track, t) => {
      if (!track) return;
      const firstCycle = Math.max(0, Math.floor((from - track.offset) / track.cycle) - 1);
      const lastCycle = Math.floor((to - track.offset) / track.cycle);
      for (let c = firstCycle; c <= lastCycle; c++) {
        track.keyframes.forEach((kf, order) => {
          const time = track.offset + c * track.cycle + kf.at;
          const after = inclusiveFrom ? time >= from : time > from;
          if (after && time <= to) due.push({ time, track: t, cycle: c, order, kf });
        });
      }
    });

    due.sort((a, b) => a.time - b.time || a.track - b.track || a.cycle - b.cycle || a.order - b.order);
    for (const d of due) d.kf.fire();
  }

  private buildTrack(index: number, offset: number): Track {
    const { open, closed } = this.timings[index];
    const keyframes = index < 4 ? this.mainKeyframes(index, open, closed) : this.sideKeyframes(open, closed);
    let cycle = Math.max(...keyframes.map((k) => k.at));
    if (index === 4) {
      // Signal 5 had an empty keyframe at signal 2's cycle duration to share its period.
      cycle = Math.max(cycle, this.tracks[1]?.cycle ?? 0);
    }
    return { offset, cycle, keyframes };
  }

  /** Signals 1-4: green -> yellow -> red -> red+yellow. Signal 4 also drives the turn arrows. */
  private mainKeyframes(index: number, open: number, closed: number): Keyframe[] {
    const v = () => this.vehicles[index];
    const drivesTurns = index === 3;
    const crossing = [this.pedestrians[0], this.pedestrians[1]];
    return [
      {
        at: 0,
        fire: () => {
          v().yellowBlinking = false;
          v().green = true;
          if (drivesTurns && !this.mainCrossing) this.setCrossing(crossing, false);
        },
      },
      { at: open, fire: () => { v().yellow = true; v().green = false; } },
      {
        at: open + YELLOW,
        fire: () => {
          v().red = true;
          v().yellow = false;
          // Right turners on arrow 10 cross both crosswalks, so it stays dark for pedestrians.
          if (drivesTurns && !this.mainRequest && !this.sideCrossing) this.turns[0].green = true;
        },
      },
      {
        // One second of all-red clearance, then pedestrians 6 and 7 cross the main road.
        at: open + YELLOW + ALL_RED,
        fire: () => {
          if (!drivesTurns || !this.mainRequest) return;
          this.mainRequest = false;
          this.mainCrossing = true;
          this.setCrossing(crossing, true);
        },
      },
      {
        at: open + closed,
        fire: () => {
          if (!drivesTurns) return;
          this.turns[0].green = false;
          if (this.mainCrossing) {
            this.mainCrossing = false;
            this.setCrossing(crossing, false);
          }
        },
      },
      {
        at: open + closed,
        fire: () => {
          if (drivesTurns && !this.sideCrossing) {
            this.turns[1].green = true;
            this.turns[2].green = true;
          }
        },
      },
      { at: open + YELLOW + closed, fire: () => { v().yellow = true; } },
      {
        at: open + YELLOW + closed + RED_YELLOW,
        fire: () => {
          v().yellow = false;
          v().red = false;
          if (drivesTurns) {
            this.turns[1].green = false;
            this.turns[2].green = false;
          }
        },
      },
    ];
  }

  /** Signal 5 (side road) starts red, and owns the pedestrian lights. */
  private sideKeyframes(open: number, closed: number): Keyframe[] {
    const v = () => this.vehicles[4];
    const crossing = [this.pedestrians[2], this.pedestrians[3]];
    return [
      {
        at: 0,
        fire: () => {
          v().red = true;
          v().yellowBlinking = false;
          this.sideCrossing = this.sideRequest;
          this.sideRequest = false;
          this.setCrossing(crossing, this.sideCrossing);
        },
      },
      {
        at: closed + 1,
        fire: () => {
          v().yellow = true;
          this.sideCrossing = false;
          this.setCrossing(crossing, false);
        },
      },
      { at: closed + 2, fire: () => { v().yellow = false; v().red = false; v().green = true; } },
      { at: closed + open + 2, fire: () => { v().green = false; v().yellow = true; } },
      { at: closed + open + 4, fire: () => { v().yellow = false; v().red = true; } },
    ];
  }

  // ------------------------------------------------------------ preemption

  private runScript(dt: number): void {
    const p = this.preemption!;
    const from = p.t;
    p.t += dt;
    for (const kf of p.keyframes) {
      if (kf.at > from && kf.at <= p.t) kf.fire();
      if (this.preemption !== p) return; // the release script restarted the cycle
    }
    if (!p.releasing && p.pendingRelease && !p.keyframes.some((k) => k.at > p.t)) this.startRelease();
  }

  private fireScriptAt(t: number): void {
    for (const kf of this.preemption!.keyframes) if (kf.at === t) kf.fire();
  }

  private startRelease(): void {
    const p = this.preemption!;
    p.releasing = true;
    p.pendingRelease = false;
    p.t = 0;
    p.keyframes = this.releaseScript(p.phase);
    this.fireScriptAt(0);
  }

  private signals(ids: number[]): Lights[] {
    return ids.map((i) => this.vehicles[i]);
  }

  /** Clear the other road (yellow, then red), all-red, then red+yellow and green for `phase`. */
  private enterScript(phase: Phase): Keyframe[] {
    const [target, other] = phase === 'main' ? [MAIN_SIGNALS, SIDE_SIGNALS] : [SIDE_SIGNALS, MAIN_SIGNALS];
    const set = (l: Lights, red: boolean, yellow: boolean, green: boolean) => Object.assign(l, { red, yellow, green });
    return [
      {
        at: 0,
        fire: () => {
          for (const t of this.turns) t.green = false;
          this.mainCrossing = this.sideCrossing = false;
          this.setCrossing(this.pedestrians, false);
          for (const v of this.signals(other)) {
            if (v.green) set(v, false, true, false); // green -> yellow
            else if (v.red && v.yellow) v.yellow = false; // was about to go green: stay red
          }
        },
      },
      {
        at: YELLOW,
        fire: () => {
          for (const v of this.signals(other)) set(v, true, false, false);
          for (const v of this.signals(target)) if (!isGreen(v) && !(v.red && v.yellow)) set(v, true, false, false);
        },
      },
      {
        at: YELLOW + ALL_RED,
        fire: () => {
          for (const v of this.signals(target)) if (!isGreen(v)) set(v, true, true, false);
        },
      },
      {
        at: YELLOW + ALL_RED + RED_YELLOW,
        fire: () => {
          for (const v of this.signals(target)) set(v, false, false, true);
        },
      },
    ];
  }

  /** Back to the normal cycle, which starts with the main road green. */
  private releaseScript(phase: Phase): Keyframe[] {
    if (phase === 'main') return [{ at: 0, fire: () => this.restart() }];
    const side = this.vehicles[4];
    return [
      { at: 0, fire: () => Object.assign(side, { red: false, yellow: true, green: false }) },
      { at: YELLOW, fire: () => Object.assign(side, { red: true, yellow: false, green: false }) },
      {
        at: YELLOW + ALL_RED,
        fire: () => {
          for (const v of this.signals(MAIN_SIGNALS)) Object.assign(v, { red: true, yellow: true, green: false });
        },
      },
      { at: YELLOW + ALL_RED + RED_YELLOW, fire: () => this.restart() },
    ];
  }

  /** Start the normal cycle afresh, keeping pending Tipkalo requests. */
  private restart(): void {
    this.preemption = null;
    for (let i = 0; i < VEHICLE_COUNT; i++) this.vehicles[i] = dark();
    for (const t of this.turns) t.green = false;
    this.setCrossing(this.pedestrians, false);
    this.mainCrossing = this.sideCrossing = false;
    this.startNormal();
  }
}
