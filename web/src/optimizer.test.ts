import { describe, expect, it } from 'vitest';
import { optimize, candidatesFor, timingsFor, CYCLES, MIN_GREEN, WORTH_IT, type Evaluate } from './optimizer';
import { runBench, type BenchConfig, type BenchResult } from './bench';
import { PLAN_TIMINGS, Simulation } from './sim';
import { checkTimings } from './safety';

const config: BenchConfig = {
  plan: 'normal',
  timings: PLAN_TIMINGS,
  cars: { istok: 8, sjever: 4, zapad: 8 },
  pedestrianRate: 4,
  options: { variety: true, drivers: true, grip: 1 },
  minutes: 4,
  seed: 1,
};

const result = (delay: number): BenchResult => ({
  strategy: 'fixed', throughput: 50, avgWait: delay, maxWait: delay * 3, maxQueue: 6, pedAvgWait: delay, pedMaxWait: delay * 3, passed: 100, busAvgWait: delay, co2PerCar: 100, delay, users: 100,
});

describe('candidate timings', () => {
  it('are always safe, fill the cycle exactly, and keep every signal on one cycle length', () => {
    for (const cycle of [...CYCLES, 18, 21, 44]) {
      const all = candidatesFor(cycle);
      expect(all.length).toBeGreaterThan(0);
      for (const c of all) {
        expect(c.main).toBeGreaterThanOrEqual(MIN_GREEN);
        expect(c.side).toBeGreaterThanOrEqual(MIN_GREEN);
        expect(c.main + c.side).toBe(cycle - 8); // nothing wasted
        const timings = timingsFor(c);
        expect(checkTimings('normal', timings), JSON.stringify(c)).toEqual([]);
        expect(checkTimings('secondary', timings), JSON.stringify(c)).toEqual([]);
        const sim = new Simulation();
        sim.setPlanTimings('normal', timings);
        for (let i = 0; i < 5; i++) expect(sim.cycleLength(i), `${JSON.stringify(c)} signal ${i + 1}`).toBe(cycle);
      }
    }
  });

  it('describe the existing plans\' shape: signal 1-4 identical, signal 5 the side road', () => {
    const t = timingsFor({ cycle: 23, main: 10, side: 5 });
    expect(t.slice(0, 4)).toEqual(Array(4).fill({ open: 10, closed: 10 }));
    expect(t[4]).toEqual({ open: 5, closed: 12 });
  });
});

describe('search', () => {
  /** Cost with a known optimum: a 20 s cycle with 7 s on the main road. */
  const synthetic: Evaluate = async (cfg) => {
    const t = cfg.timings[cfg.plan];
    const cycle = t[0].open + t[0].closed + 3;
    return result(2 + 0.02 * (cycle - 20) ** 2 + 0.1 * (t[0].open - 7) ** 2);
  };

  it('finds the optimum and says how much it saves', async () => {
    const calls: string[] = [];
    const out = await optimize(config, 'fixed', synthetic, { onProgress: (p) => calls.push(p.stage) });
    expect(out.best.candidate).toEqual({ cycle: 20, main: 7, side: 5 });
    expect(out.best.delay).toBeCloseTo(2, 6);
    expect(out.baseline.delay).toBeCloseTo(2 + 0.18 + 0.9, 6); // 23 s, 10 s main
    expect(out.improvement).toBeCloseTo(1 - 2 / 3.08, 4);
    expect(out.worthIt).toBe(true);
    expect(out.ranking[0].candidate).toEqual(out.best.candidate);
    expect(out.ranking.map((r) => r.delay)).toEqual([...out.ranking.map((r) => r.delay)].sort((a, b) => a - b));
    expect(calls).toContain('coarse');
    expect(calls).toContain('fine');
    expect(calls).toContain('verify');
  });

  it('keeps the work bounded', async () => {
    let jobs = 0;
    await optimize(config, 'fixed', async (c, s) => {
      jobs++;
      return synthetic(c, s);
    });
    expect(jobs).toBeLessThan(130);
  });

  it('says so when the current timings are already about as good', async () => {
    const flat: Evaluate = async () => result(5);
    const out = await optimize(config, 'fixed', flat);
    expect(Math.abs(out.improvement)).toBeLessThan(WORTH_IT);
    expect(out.worthIt).toBe(false);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    let n = 0;
    const evaluate: Evaluate = async (c, s) => {
      if (++n === 5) controller.abort();
      return synthetic(c, s);
    };
    await expect(optimize(config, 'fixed', evaluate, { signal: controller.signal })).rejects.toThrow('cancelled');
  });

  it('works on the real simulation (short runs)', async () => {
    const out = await optimize(
      { ...config, pedestrianRate: 0 },
      'fixed',
      async (c, s) => runBench(c, s),
      { cycles: [17, 20], coarse: { seeds: [1], minutes: 1 }, fine: { seeds: [2, 3], minutes: 1 }, finalists: 1 },
    );
    expect(out.baseline.delay).toBeGreaterThan(0);
    expect(out.best.delay).toBeGreaterThan(0);
    expect(checkTimings('normal', timingsFor(out.best.candidate))).toEqual([]);
  }, 60000);
});
