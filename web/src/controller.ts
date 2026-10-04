// "Upravljanje": how the signal clock is driven. The keyframe cycle in sim.ts stays the same;
// a strategy only decides, each frame, whether the clock runs, holds (keeping the current
// lights), or skips ahead to end a green early. Pure TypeScript, no DOM.

import type { Phase, Simulation } from './sim';
import type { Traffic } from './traffic';
import { LEARNED_Q } from './learned-policy';

/**
 * fixed     - the cycle always runs (the original behaviour)
 * demand    - "Automatski režim": the cycle holds while nobody waits at a red light
 * actuated  - green is extended while cars keep arriving, and cut short when the road is empty
 * queue     - the road with the longer queue keeps (or gets) the green
 * transit   - 'queue', plus buses: green is held for an approaching bus, and called early for one waiting
 * learned   - a Q-learning policy (see rl.ts) decides each second whether to keep the green or switch
 */
export type ControlStrategy = 'fixed' | 'demand' | 'actuated' | 'queue' | 'transit' | 'learned';
export const CONTROL_STRATEGIES: ControlStrategy[] = ['fixed', 'demand', 'actuated', 'queue', 'transit', 'learned'];

/** Lanes stopped by signals 1-4 (main road) and signal 5 (side road). */
export const PHASE_LANES: Record<Phase, string[]> = {
  main: ['nw-right', 'nw-left', 'se-left', 'se-right'],
  side: ['side'],
};

/** A green is never cut shorter than this. */
export const MIN_GREEN = 5;
/** ...nor held longer than this while the other road waits. */
export const MAX_GREEN = 25;
/** People waiting at the button shorten that. */
export const MAX_GREEN_WITH_PEDESTRIANS = 20;
/** Cars this close to a green stop line count as still arriving (actuated). */
const DETECTION = 110;
/** Buses are detected further out, so the signal can change in time for them. */
const BUS_DETECTION = 220;

/** What the learned policy sees, in a handful of buckets (see rl.ts for how it was trained). */
export type Action = 'keep' | 'switch';
export const ACTIONS: Action[] = ['keep', 'switch'];
/** Seconds between the learned policy's decisions. */
export const EPOCH = 1;
const GREEN_BUCKETS = [8, 12, 18]; // seconds of green so far: <8, <12, <18, more
const QUEUE_BUCKETS = [1, 3, 6]; // cars: 0, 1-2, 3-5, 6+
export const STATES = 2 * (GREEN_BUCKETS.length + 1) * (QUEUE_BUCKETS.length + 1) ** 2;

const bucket = (value: number, limits: number[]) => limits.filter((l) => value >= l).length;

export interface Observation {
  phase: Phase;
  greenFor: number;
  /** Cars waiting or about to arrive on the road that has green, and waiting on the other (people count as 2). */
  own: number;
  other: number;
}

export function encodeState({ phase, greenFor, own, other }: Observation): number {
  const q = QUEUE_BUCKETS.length + 1;
  const g = GREEN_BUCKETS.length + 1;
  return (
    ((phase === 'main' ? 0 : 1) * g + bucket(greenFor, GREEN_BUCKETS)) * q * q +
    bucket(own, QUEUE_BUCKETS) * q +
    bucket(other, QUEUE_BUCKETS)
  );
}

/** Decides keep or switch for an observation. */
export type Policy = (state: number, observation: Observation) => Action;

/** The shipped policy: greedy over the trained table, the 'queue' rule where it never learned anything. */
export const learnedPolicy: Policy = (state, { own, other }) => {
  const [keep, change] = LEARNED_Q[state] ?? [0, 0];
  if (keep === change) return own >= other ? 'keep' : 'switch';
  return keep > change ? 'keep' : 'switch';
};

export class Controller {
  /** Used by the 'learned' strategy; training swaps in an exploring one. */
  policy: Policy = learnedPolicy;
  private epochLeft = 0;
  private action: Action = 'keep';
  strategy: ControlStrategy = 'fixed';
  /** True if the last step held the clock. */
  held = false;
  private phase: Phase | null = null;
  private greenFor = 0;

  /** Advance the signal clock by `dt` seconds, or less (hold), or more (end a green early). */
  step(dt: number, sim: Simulation, traffic: Traffic): void {
    const phase = sim.greenPhase;
    if (phase !== this.phase) {
      this.phase = phase;
      this.greenFor = 0;
      this.epochLeft = 0;
    }
    if (phase) this.greenFor += dt;
    const decision = this.decide(dt, sim, traffic, phase);
    this.held = decision === 'hold';
    if (decision === 'hold') return;
    if (decision === 'end') {
      // Jump to the next keyframe (the end of this green) without waiting it out.
      const next = sim.nextKeyframeTime();
      if (Number.isFinite(next)) sim.advance(Math.max(dt, next - sim.time + 1e-6));
      else sim.advance(dt);
      return;
    }
    sim.advance(dt);
  }

  private decide(dt: number, sim: Simulation, traffic: Traffic, phase: Phase | null): 'run' | 'hold' | 'end' {
    if (this.strategy === 'fixed' || sim.mode === 'flashing' || sim.preempted) return 'run';
    // Never stop a signal halfway through yellow or red+yellow.
    if (sim.changing || phase === null) return 'run';

    const requests = sim.pedestrianRequests;
    if (this.strategy === 'demand') {
      const snap = sim.snapshot();
      return requests.main || requests.side || traffic.waitingAtRed(snap) ? 'run' : 'hold';
    }

    const other: Phase = phase === 'main' ? 'side' : 'main';
    // People waiting to cross the main road need the main road red (side phase), and
    // people crossing the side road need signal 5 red (main phase).
    const pedsFor = (p: Phase) => (p === 'side' ? requests.main : requests.side);
    const pedsWalking = sim.snapshot().pedestrians.some((p) => p.green);
    const otherQueue = traffic.queued(PHASE_LANES[other]) + (pedsFor(other) ? 2 : 0);

    if (this.strategy === 'transit' && !pedsWalking && this.greenFor >= MIN_GREEN) {
      // A bus on its way to this green gets it held; a bus on its way to the other road
      // gets the green called early (unless ours is busy with a bus of its own).
      const ownBus = traffic.busesApproaching(PHASE_LANES[phase], BUS_DETECTION) > 0;
      const otherBus = traffic.busesApproaching(PHASE_LANES[other], BUS_DETECTION) > 0;
      if (ownBus && this.greenFor < MAX_GREEN) return 'hold';
      if (otherBus) return 'end';
    }

    // Nobody needs the other road: rest in green.
    if (otherQueue === 0) return 'hold';
    if (this.greenFor < MIN_GREEN || pedsWalking) return 'run';
    if (this.greenFor >= (pedsFor(other) ? MAX_GREEN_WITH_PEDESTRIANS : MAX_GREEN)) return 'end';

    if (this.strategy === 'learned') {
      this.epochLeft -= dt;
      if (this.epochLeft <= 0) {
        this.epochLeft = EPOCH;
        const own = traffic.queued(PHASE_LANES[phase]) + traffic.approaching(PHASE_LANES[phase], 60);
        const observation: Observation = { phase, greenFor: this.greenFor, own, other: otherQueue };
        this.action = this.policy(encodeState(observation), observation);
      }
      return this.action === 'switch' ? 'end' : 'hold';
    }

    if (this.strategy === 'actuated') {
      const arriving = traffic.approaching(PHASE_LANES[phase], DETECTION) > 0;
      return arriving ? 'hold' : 'end';
    }
    // 'queue' and 'transit': compare what's waiting on each road.
    const ownQueue = traffic.queued(PHASE_LANES[phase]) + traffic.approaching(PHASE_LANES[phase], 60);
    return ownQueue >= otherQueue ? 'hold' : 'end';
  }
}
