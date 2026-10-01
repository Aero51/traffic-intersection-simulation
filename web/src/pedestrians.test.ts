import { describe, expect, it } from 'vitest';
import { CROSSINGS, Pedestrians, crossingLength, walkerPose } from './pedestrians';
import { Simulation } from './sim';

function lights(main: boolean, side: boolean) {
  const snap = new Simulation().snapshot();
  snap.pedestrians = [main, main, side, side].map((green) => ({ red: !green, yellow: false, green, yellowBlinking: false }));
  return snap;
}

function run(peds: Pedestrians, seconds: number, snap = lights(false, false)) {
  for (let t = 0; t < seconds; t += 1 / 60) peds.step(1 / 60, snap);
}

describe('Pedestrians', () => {
  it('Tipkalo brings people to both kerbs of both crossings, who wait on red', () => {
    const peds = new Pedestrians(() => 0.5);
    peds.call();
    for (const c of CROSSINGS) {
      for (const reverse of [false, true]) {
        expect(peds.walkers.filter((w) => w.crossing === c && w.reverse === reverse).length).toBeGreaterThan(0);
      }
    }
    const before = peds.walkers.map((w) => w.t);
    run(peds, 5);
    expect(peds.walkers.map((w) => w.t)).toEqual(before);
    expect(peds.walkers.every((w) => w.t < 0)).toBe(true); // still on the pavement
  });

  it('crosses on green only on their own crossing, then leaves', () => {
    const peds = new Pedestrians(() => 0.5);
    peds.call();
    run(peds, 2, lights(false, true));
    expect(peds.walkers.filter((w) => w.crossing.id === 'side').every((w) => w.walking)).toBe(true);
    expect(peds.walkers.filter((w) => w.crossing.id === 'main').some((w) => w.walking)).toBe(false);

    const side = CROSSINGS.find((c) => c.id === 'side')!;
    run(peds, crossingLength(side) / 20 + 1, lights(false, false)); // light turns red mid-way: they finish
    expect(peds.walkers.some((w) => w.crossing === side)).toBe(false);
  });

  it('does not pile up more than three people per kerb', () => {
    const peds = new Pedestrians(() => 0.99);
    for (let i = 0; i < 5; i++) peds.call();
    expect(peds.walkers.length).toBe(CROSSINGS.length * 2 * 3);
  });

  it('walks from kerb a to kerb b along the crossing', () => {
    const peds = new Pedestrians(() => 0.5);
    peds.call();
    const w = peds.walkers.find((x) => x.crossing.id === 'side' && !x.reverse)!;
    w.offset = 0;
    w.t = 0;
    expect(walkerPose(w)).toMatchObject({ x: 486, y: 48 });
    w.t = 1;
    expect(walkerPose(w).y).toBeCloseTo(158);
  });
});
