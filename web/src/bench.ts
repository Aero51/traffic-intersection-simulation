// "Usporedi upravljanje": run the current set-up headless for a few simulated minutes with
// each control strategy, same seed, and compare the statistics. Pure TypeScript, no DOM.

import { World } from './world';
import { seeded } from './random';
import type { ControlStrategy } from './controller';
import type { Plan, SignalTiming } from './sim';
import type { TrafficOptions } from './traffic';
import type { StatsSummary } from './stats';

export interface BenchConfig {
  plan: Plan;
  timings: Record<Plan, SignalTiming[]>;
  /** Cars per traffic group (slider values). */
  cars: Record<string, number>;
  pedestrianRate: number;
  options: TrafficOptions;
  minutes: number;
  seed: number;
}

export interface BenchResult extends StatsSummary {
  strategy: ControlStrategy;
}

const DT = 1 / 20;

export function runBench(config: BenchConfig, strategy: ControlStrategy, onProgress?: (fraction: number) => void): BenchResult {
  const world = new World(seeded(config.seed), seeded(config.seed + 1));
  const { sim, traffic, pedestrians, controller } = world;
  sim.setPlanTimings('normal', config.timings.normal);
  sim.setPlanTimings('secondary', config.timings.secondary);
  if (config.plan !== 'normal') sim.setMode(config.plan);
  traffic.options = { ...config.options };
  for (const [group, cars] of Object.entries(config.cars)) traffic.setTarget(group, cars);
  pedestrians.rate = config.pedestrianRate;
  controller.strategy = strategy;

  const steps = Math.round((config.minutes * 60) / DT);
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    if (onProgress && i % 400 === 0) onProgress(i / steps);
  }
  return { strategy, ...world.stats.summary() };
}
