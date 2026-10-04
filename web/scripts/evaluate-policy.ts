// Compares the control strategies on demand and seeds the learned policy never trained on.
//   npx vite-node scripts/evaluate-policy.ts
import { runBench, type BenchConfig } from '../src/bench';
import { PLAN_TIMINGS } from '../src/sim';
import type { ControlStrategy } from '../src/controller';

const SCENARIOS: [string, [number, number, number]][] = [
  ['light   ', [4, 2, 4]],
  ['medium  ', [8, 4, 8]],
  ['heavy   ', [12, 8, 12]],
  ['side-heavy', [4, 14, 4]],
  ['main-heavy', [14, 3, 14]],
];
const STRATEGIES: ControlStrategy[] = ['fixed', 'actuated', 'queue', 'learned'];
const SEEDS = [9001, 9002, 9003];

const totals = new Map<ControlStrategy, number>();
console.log(
  `avg delay per road user (s), ${SEEDS.length} seeds x 6 min\n${''.padEnd(12)}${STRATEGIES.map((s) => s.padStart(10)).join('')}`,
);
for (const [name, [istok, sjever, zapad]] of SCENARIOS) {
  const row: number[] = [];
  for (const strategy of STRATEGIES) {
    let sum = 0;
    for (const seed of SEEDS) {
      const config: BenchConfig = {
        plan: 'normal',
        timings: PLAN_TIMINGS,
        cars: { istok, sjever, zapad },
        pedestrianRate: 6,
        options: { variety: true, drivers: true, grip: 1 },
        minutes: 6,
        seed,
      };
      sum += runBench(config, strategy).delay;
    }
    row.push(sum / SEEDS.length);
    totals.set(strategy, (totals.get(strategy) ?? 0) + sum / SEEDS.length);
  }
  console.log(`${name.padEnd(12)}${row.map((v) => v.toFixed(1).padStart(10)).join('')}`);
}
console.log(`${'mean'.padEnd(12)}${STRATEGIES.map((s) => (totals.get(s)! / SCENARIOS.length).toFixed(1).padStart(10)).join('')}`);
