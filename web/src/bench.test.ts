import { describe, expect, it } from 'vitest';
import { runBench, type BenchConfig } from './bench';
import { PLAN_TIMINGS } from './sim';

const config: BenchConfig = {
  plan: 'normal',
  timings: PLAN_TIMINGS,
  cars: { istok: 8, sjever: 4, zapad: 8 },
  pedestrianRate: 4,
  options: { variety: true, drivers: true, grip: 1 },
  minutes: 3,
  seed: 7,
};

describe('strategy comparison', () => {
  it('is repeatable with the same seed', () => {
    const a = runBench({ ...config, minutes: 1 }, 'fixed');
    const b = runBench({ ...config, minutes: 1 }, 'fixed');
    expect(a).toEqual(b);
  });

  it.each(['fixed', 'demand', 'actuated', 'queue'] as const)('%s keeps traffic moving', (strategy) => {
    const t0 = performance.now();
    const r = runBench(config, strategy);
    console.log(strategy, `${Math.round(performance.now() - t0)} ms`, JSON.stringify(r));
    expect(r.passed).toBeGreaterThan(60); // 20 cars circulating for 3 minutes
    expect(r.maxWait).toBeLessThan(90);
  });
});
