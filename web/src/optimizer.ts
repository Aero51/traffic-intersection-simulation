// "Pronađi najbolja vremena": a search for the green split (and cycle length) that gives the
// shortest average delay for the current traffic. Each candidate is run as a headless
// simulation (see bench.ts); the search itself only decides which candidates to try.
//
// Candidates keep the junction safe by construction: the main road (signals 1-4) is open
// for `main` seconds, the side road (signal 5) for `side`, with exactly ALL_RED between the
// two roads on both changes and nothing wasted - so only one number is free once the cycle
// length is chosen. Pure TypeScript, no DOM.

import { ALL_RED, RED_YELLOW, YELLOW, type SignalTiming } from './sim';
import type { BenchConfig, BenchResult } from './bench';
import type { ControlStrategy } from './controller';

export interface Candidate {
  /** Cycle length (s). */
  cycle: number;
  /** Green of signals 1-4 and of signal 5 (s). */
  main: number;
  side: number;
}

/** Shortest green of either road; also leaves pedestrians time to cross. */
export const MIN_GREEN = 4;
/** Cycle lengths the first pass tries (s). */
export const CYCLES = [17, 20, 23, 27, 32];

/** Seconds each road is lost to yellow, red+yellow and the all-red before the other opens. */
const LOST = YELLOW + RED_YELLOW + ALL_RED;

export function timingsFor({ cycle, main, side }: Candidate): SignalTiming[] {
  const mainRow = { open: main, closed: cycle - RED_YELLOW - YELLOW - main };
  // The side road's red lasts until its red+yellow, ALL_RED after the main road turned red,
  // and it is red again ALL_RED before the main road's red+yellow.
  const sideRow = { open: side, closed: cycle - 2 * (YELLOW + ALL_RED) - side };
  return [mainRow, mainRow, mainRow, mainRow, sideRow].map((t) => ({ ...t }));
}

/** Greens that fill the cycle exactly: main + side = cycle - 8. */
export function candidatesFor(cycle: number, step = 1): Candidate[] {
  const total = cycle - 2 * LOST;
  const out: Candidate[] = [];
  for (let main = MIN_GREEN; main <= total - MIN_GREEN; main += step) out.push({ cycle, main, side: total - main });
  return out;
}

export const sameCandidate = (a: Candidate, b: Candidate) => a.cycle === b.cycle && a.main === b.main;

export interface Scored {
  candidate: Candidate;
  result: BenchResult;
  /** Average delay per road user over the runs (s), lower is better. */
  delay: number;
}

// ------------------------------------------------------------------ search

export type Evaluate = (config: BenchConfig, strategy: ControlStrategy) => Promise<BenchResult>;

export interface OptimizeOptions {
  cycles?: number[];
  /** Seeds (and simulated minutes) per candidate: a quick first pass, then a careful one. */
  coarse?: { seeds: number[]; minutes: number };
  fine?: { seeds: number[]; minutes: number };
  /** The winner and the current timings are run again on seeds the search never saw. */
  verify?: { seeds: number[]; minutes: number };
  /** How many of the best first-pass candidates the second pass looks around. */
  finalists?: number;
  onProgress?(progress: { stage: 'coarse' | 'fine' | 'verify'; done: number; total: number }): void;
  signal?: AbortSignal;
}

export interface OptimizeOutcome {
  /** The timings in use now and the best found, both from the verification runs. */
  baseline: Scored;
  best: Scored;
  /** The finalists as the search saw them, best first (a little optimistic: it picked the best). */
  ranking: Scored[];
  /** Fraction of average delay saved by `best` in verification (negative: current is better). */
  improvement: number;
  /** True if the verified saving is big enough to be more than noise. */
  worthIt: boolean;
}

/** Savings smaller than this are within the run-to-run noise. */
export const WORTH_IT = 0.05;

const DEFAULTS = {
  cycles: CYCLES,
  coarse: { seeds: [101, 102], minutes: 3 },
  fine: { seeds: [201, 202, 203, 204], minutes: 4 },
  verify: { seeds: [301, 302, 303, 304], minutes: 5 },
  finalists: 3,
};

function mean(results: BenchResult[]): BenchResult {
  const avg = (pick: (r: BenchResult) => number) => results.reduce((n, r) => n + pick(r), 0) / results.length;
  const peak = (pick: (r: BenchResult) => number) => Math.max(...results.map(pick));
  return {
    strategy: results[0].strategy,
    throughput: avg((r) => r.throughput),
    avgWait: avg((r) => r.avgWait),
    maxWait: peak((r) => r.maxWait),
    maxQueue: peak((r) => r.maxQueue),
    pedAvgWait: avg((r) => r.pedAvgWait),
    pedMaxWait: peak((r) => r.pedMaxWait),
    passed: avg((r) => r.passed),
    delay: avg((r) => r.delay),
    users: avg((r) => r.users),
  };
}

function abortIf(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
}

export async function optimize(
  config: BenchConfig,
  strategy: ControlStrategy,
  evaluate: Evaluate,
  options: OptimizeOptions = {},
): Promise<OptimizeOutcome> {
  const { cycles, coarse, fine, verify, finalists } = { ...DEFAULTS, ...options };
  const { onProgress, signal } = options;

  /** Run `candidate` (or the current timings, if null) on every seed; resolves to their mean. */
  const run = (candidate: Candidate | null, pass: { seeds: number[]; minutes: number }, tick: () => void): Promise<Scored> => {
    const timings = candidate ? { ...config.timings, [config.plan]: timingsFor(candidate) } : config.timings;
    return Promise.all(
      pass.seeds.map(async (seed) => {
        abortIf(signal);
        const result = await evaluate({ ...config, timings, minutes: pass.minutes, seed }, strategy);
        tick();
        return result;
      }),
    ).then((results) => {
      const result = mean(results);
      return { candidate: candidate ?? { cycle: 0, main: 0, side: 0 }, result, delay: result.delay };
    });
  };

  const stage = async (
    name: 'coarse' | 'fine' | 'verify',
    candidates: (Candidate | null)[],
    pass: { seeds: number[]; minutes: number },
  ): Promise<Scored[]> => {
    const total = candidates.length * pass.seeds.length;
    let done = 0;
    onProgress?.({ stage: name, done, total });
    return Promise.all(candidates.map((c) => run(c, pass, () => onProgress?.({ stage: name, done: ++done, total }))));
  };

  // Pass 1: every cycle length with a few spread-out splits (every second split, plus the last).
  const first: Candidate[] = cycles.flatMap((cycle) => {
    const all = candidatesFor(cycle);
    return all.filter((_, i) => i % 2 === 0 || i === all.length - 1);
  });
  const scored = (await stage('coarse', first, coarse)).sort((a, b) => a.delay - b.delay);
  abortIf(signal);

  // Pass 2: look around the best few (one second either way, and a neighbouring cycle length),
  // and compare them with the current timings on the same, longer runs.
  const around: Candidate[] = [];
  const add = (c: Candidate) => {
    const total = c.cycle - 2 * LOST;
    if (c.main < MIN_GREEN || total - c.main < MIN_GREEN) return;
    if (!around.some((x) => sameCandidate(x, c))) around.push({ cycle: c.cycle, main: c.main, side: total - c.main });
  };
  for (const { candidate: c } of scored.slice(0, finalists)) {
    add(c);
    add({ ...c, main: c.main - 1 });
    add({ ...c, main: c.main + 1 });
    for (const cycle of [c.cycle - 2, c.cycle + 2]) {
      if (cycle >= CYCLES[0] && cycle <= CYCLES[CYCLES.length - 1] + 4) add({ cycle, main: c.main, side: 0 });
    }
  }
  const ranking = (await stage('fine', around, fine)).sort((a, b) => a.delay - b.delay);
  abortIf(signal);

  // Pass 3: the best of many noisy runs looks better than it is, so measure it (and the
  // current timings) again on fresh seeds and report those numbers.
  const [baseline, best] = await stage('verify', [null, ranking[0].candidate], verify);
  const improvement = baseline.delay > 0 ? (baseline.delay - best.delay) / baseline.delay : 0;
  return { baseline, best, ranking, improvement, worthIt: improvement >= WORTH_IT };
}
