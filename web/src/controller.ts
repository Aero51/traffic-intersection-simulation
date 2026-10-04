// "Upravljanje": how the signal clock is driven. The keyframe cycle in sim.ts stays the same;
// a strategy only decides, each frame, whether the clock runs, holds (keeping the current
// lights), or skips ahead to end a green early. Pure TypeScript, no DOM.

import type { Phase, Simulation } from './sim';
import type { Traffic } from './traffic';

/**
 * fixed     - the cycle always runs (the original behaviour)
 * demand    - "Automatski režim": the cycle holds while nobody waits at a red light
 * actuated  - green is extended while cars keep arriving, and cut short when the road is empty
 * queue     - the road with the longer queue keeps (or gets) the green
 */
export type ControlStrategy = 'fixed' | 'demand' | 'actuated' | 'queue';
export const CONTROL_STRATEGIES: ControlStrategy[] = ['fixed', 'demand', 'actuated', 'queue'];

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

export class Controller {
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
    }
    if (phase) this.greenFor += dt;
    const decision = this.decide(sim, traffic, phase);
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

  private decide(sim: Simulation, traffic: Traffic, phase: Phase | null): 'run' | 'hold' | 'end' {
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

    // Nobody needs the other road: rest in green.
    if (otherQueue === 0) return 'hold';
    if (this.greenFor < MIN_GREEN || pedsWalking) return 'run';
    if (this.greenFor >= (pedsFor(other) ? MAX_GREEN_WITH_PEDESTRIANS : MAX_GREEN)) return 'end';

    if (this.strategy === 'actuated') {
      const arriving = traffic.approaching(PHASE_LANES[phase], DETECTION) > 0;
      return arriving ? 'hold' : 'end';
    }
    // 'queue': compare what's waiting on each road.
    const ownQueue = traffic.queued(PHASE_LANES[phase]) + traffic.approaching(PHASE_LANES[phase], 60);
    return ownQueue >= otherQueue ? 'hold' : 'end';
  }
}
