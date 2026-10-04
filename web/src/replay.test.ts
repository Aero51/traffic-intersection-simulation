import { describe, expect, it } from 'vitest';
import { FRAME_EVERY, MAX_FRAMES, Recorder } from './replay';
import { World } from './world';
import { seeded } from './random';
import { TRAFFIC_GROUPS } from './routes';

function drive(seconds: number, recorder: Recorder): World {
  const world = new World(seeded(4), seeded(5));
  for (const g of TRAFFIC_GROUPS) world.traffic.setTarget(g.id, g.initial);
  const dt = 1 / 20;
  for (let i = 0; i < seconds / dt; i++) {
    world.step(dt);
    recorder.advance(dt, () => ({ snap: world.sim.snapshot(), cars: world.traffic.cars, walkers: world.pedestrians.walkers }));
  }
  return world;
}

describe('Recorder', () => {
  it('records about ten frames a second', () => {
    const r = new Recorder();
    drive(5, r);
    expect(r.frames.length).toBeGreaterThanOrEqual(5 / FRAME_EVERY - 2);
    expect(r.frames.length).toBeLessThanOrEqual(5 / FRAME_EVERY + 2);
  });

  it('keeps only the last minute', () => {
    const r = new Recorder();
    drive(75, r);
    expect(r.frames.length).toBe(MAX_FRAMES);
    expect(r.ago(0)).toBeGreaterThan(55);
    expect(r.ago(MAX_FRAMES - 1)).toBe(0);
  });

  it('frames are copies: they do not change as the simulation moves on', () => {
    const r = new Recorder();
    const world = drive(20, r);
    const early = r.frames[50];
    const carsThen = JSON.stringify(early.cars.map((c) => [c.id, c.s]));
    for (let i = 0; i < 100; i++) world.step(1 / 20);
    expect(JSON.stringify(early.cars.map((c) => [c.id, c.s]))).toBe(carsThen);
    expect(early.cars.every((c) => c.blocker === null)).toBe(true);
  });
});
