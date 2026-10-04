import { describe, expect, it } from 'vitest';
import { runBench, type BenchConfig } from './bench';
import { PLAN_TIMINGS } from './sim';
import { TRAFFIC_GROUPS } from './routes';

const config = (seed: number): BenchConfig => ({
  plan: 'normal',
  timings: PLAN_TIMINGS,
  cars: Object.fromEntries(TRAFFIC_GROUPS.map((g) => [g.id, 9])),
  pedestrianRate: 0,
  options: { variety: true, drivers: true, grip: 1 },
  minutes: 6,
  seed,
});

describe('bus priority', () => {
  it('buses wait less than under plain queue control, with traffic still flowing', () => {
    const seeds = [11, 12, 13];
    const mean = (strategy: 'queue' | 'transit') => {
      const runs = seeds.map((seed) => runBench(config(seed), strategy));
      const avg = (pick: (r: (typeof runs)[number]) => number) => runs.reduce((n, r) => n + pick(r), 0) / runs.length;
      return { bus: avg((r) => r.busAvgWait), flow: avg((r) => r.throughput) };
    };
    const queue = mean('queue');
    const transit = mean('transit');
    console.log({ queue, transit });
    expect(transit.bus).toBeLessThan(queue.bus);
    expect(transit.flow).toBeGreaterThan(0.8 * queue.flow);
  }, 120_000);
});
