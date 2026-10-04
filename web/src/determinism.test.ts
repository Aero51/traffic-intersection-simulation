import { describe, expect, it } from 'vitest';
import { World } from './world';
import { seeded } from './random';
import { TRAFFIC_GROUPS } from './routes';
import { CONTROL_STRATEGIES, type ControlStrategy } from './controller';

const DT = 1 / 20;

function run(seed: number, strategy: ControlStrategy, seconds: number, check?: (world: World) => void): World {
  const world = new World(seeded(seed), seeded(seed + 1));
  world.controller.strategy = strategy;
  world.pedestrians.rate = 10;
  for (const g of TRAFFIC_GROUPS) world.traffic.setTarget(g.id, g.initial);
  for (let i = 0; i < seconds / DT; i++) {
    world.step(DT);
    check?.(world);
  }
  return world;
}

const fingerprint = (w: World) =>
  JSON.stringify([w.stats.summary(), w.traffic.cars.map((c) => [c.id, c.kind, +c.s.toFixed(3), +c.v.toFixed(3)])]);

describe('determinism', () => {
  it('the same seed gives exactly the same run', () => {
    expect(fingerprint(run(7, 'actuated', 90))).toBe(fingerprint(run(7, 'actuated', 90)));
  });

  it('a different seed gives a different run', () => {
    expect(fingerprint(run(7, 'fixed', 90))).not.toBe(fingerprint(run(8, 'fixed', 90)));
  });
});

describe('invariants over seeds and strategies', () => {
  const isGreen = (l: { green: boolean; red: boolean }) => l.green && !l.red;

  for (const strategy of CONTROL_STRATEGIES) {
    it(`${strategy}: main and side roads never have green together, and traffic keeps flowing`, () => {
      for (const seed of [1, 2, 3]) {
        let before = 0;
        const world = run(seed, strategy, 150, (w) => {
          const { vehicles } = w.sim.snapshot();
          const main = vehicles.slice(0, 4).some(isGreen);
          const side = isGreen(vehicles[4]);
          if (main && side) before++;
        });
        expect(before).toBe(0);
        expect(world.stats.summary().passed).toBeGreaterThan(10);
      }
    });
  }

  it('no car ever has a negative or absurd speed, and ids stay unique', () => {
    run(5, 'queue', 120, (w) => {
      const ids = new Set<number>();
      for (const c of w.traffic.cars) {
        expect(c.v).toBeGreaterThanOrEqual(0);
        expect(c.v).toBeLessThan(200);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
      }
    });
  });
});
