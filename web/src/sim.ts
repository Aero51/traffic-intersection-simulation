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

export type Mode = 'normal' | 'flashing';

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

const YELLOW = 2; // green -> red transition
const RED_YELLOW = 1; // red -> green transition

interface Keyframe {
  at: number; // seconds into the cycle
  fire: () => void;
}

interface Track {
  offset: number; // absolute time (s) at which cycle 0 of this track started
  cycle: number; // seconds
  keyframes: Keyframe[];
}

const dark = (): Lights => ({ red: false, yellow: false, green: false, yellowBlinking: false });

export class Simulation {
  private timings: SignalTiming[];
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
  private _time = 0;
  private _mode: Mode = 'normal';

  constructor(timings: SignalTiming[] = DEFAULT_TIMINGS) {
    this.timings = timings.map((t) => ({ ...t }));
    this.startNormal();
  }

  get time(): number {
    return this._time;
  }

  get mode(): Mode {
    return this._mode;
  }

  timing(index: number): SignalTiming {
    return { ...this.timings[index] };
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

  /**
   * "Tipkalo": pedestrians 6 and 7 get green at the main road's next red, and 8 and 9 at
   * signal 5's next red (as in the MVC version). Ignored in "Policajac" mode.
   */
  requestPedestrians(): void {
    if (this._mode !== 'normal') return;
    this.mainRequest = true;
    this.sideRequest = true;
  }

  /** Advance the clock by `dt` seconds, firing every keyframe in (time, time + dt]. */
  advance(dt: number): void {
    if (dt <= 0) return;
    const from = this._time;
    const to = from + dt;
    this.fireBetween(from, to, false);
    this._time = to;
  }

  /** Mode switch from the "Mod rada" choice box. */
  setMode(mode: Mode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this.stopAll();
    if (mode === 'flashing') {
      for (const v of this.vehicles) v.yellowBlinking = true;
    } else {
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
    if (this._mode !== 'normal') return;

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

  private cyclePosition(index: number): number {
    const track = this.tracks[index];
    if (!track) return 0;
    const p = (this._time - track.offset) % track.cycle;
    return p < 0 ? p + track.cycle : p;
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
        at: open + YELLOW + 1,
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
}
