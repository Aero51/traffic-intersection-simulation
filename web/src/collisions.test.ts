import { describe, expect, it } from 'vitest';
import { Traffic, pose, type Car } from './traffic';
import { Simulation } from './sim';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';
import { SCENE_HEIGHT, SCENE_WIDTH } from './layout';

/** Centre of a car's body on the map. */
function centre(car: Car) {
  return pose(car.route, car.s - car.length / 2);
}

/** Corners of a car's body, for an exact rectangle overlap test (separating axes). */
function corners(car: Car): [number, number][] {
  const { x, y, angle } = pose(car.route, car.s - car.length / 2, car.length * 0.6);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const [hl, hw] = [car.length / 2, car.width / 2];
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}

function overlap(a: Car, b: Car): boolean {
  const pa = corners(a);
  const pb = corners(b);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % 4];
      const [nx, ny] = [y2 - y1, x1 - x2];
      const project = (p: [number, number][]) => p.map(([x, y]) => x * nx + y * ny);
      const [a1, b1] = [project(pa), project(pb)];
      if (Math.max(...a1) < Math.min(...b1) || Math.max(...b1) < Math.min(...a1)) return false;
    }
  }
  return true;
}

const onScreen = (car: Car) => {
  const { x, y } = centre(car);
  return x > 0 && y > 0 && x < SCENE_WIDTH && y < SCENE_HEIGHT;
};

describe('junction conflicts', () => {
  it('finds the merge reported by the user: left turn from the west vs right turn from the east', () => {
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS);
    const leftTurn = traffic.routes.find((r) => r.def.id === 'se-left-turn')!;
    const merges = traffic.conflicts.get(leftTurn)!.filter((c) => c.kind === 'merge').map((c) => c.other.def.id);
    expect(merges).toContain('nw-right-turn');
    const crossings = traffic.conflicts.get(leftTurn)!.filter((c) => c.kind === 'cross');
    // The left turn crosses oncoming traffic and gives way to it.
    expect(crossings.filter((c) => c.other.def.id.startsWith('nw-')).every((c) => c.yields)).toBe(true);
  });

  it('sees every conflict the same way from both routes', () => {
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS);
    for (const [route, list] of traffic.conflicts) {
      for (const c of list) {
        const twin = traffic.conflicts.get(c.other)!.find((d) => d.other === route && d.key === c.key);
        expect(twin, `${route.def.id} ${c.kind} ${c.other.def.id}`).toBeDefined();
        expect(twin!.kind).toBe(c.kind);
        if (c.kind === 'cross') expect(c.yields && twin!.yields).toBe(false); // exactly one gives way
      }
    }
  });

  // Normal, "Policajac" (all flashing) and "Automatski režim"; small frames and the
  // browser's largest (0.1 s, e.g. after a hiccup or in a background tab).
  it.each([
    { mode: 'normal', dt: 1 / 30, seed: 1, minutes: 10 },
    { mode: 'normal', dt: 0.1, seed: 4, minutes: 6 },
    { mode: 'flashing', dt: 1 / 60, seed: 2, minutes: 4 },
    { mode: 'auto', dt: 0.1, seed: 3, minutes: 6 },
  ] as const)('heavy traffic, $mode mode, dt $dt: no cars overlap and nobody is stuck', ({ mode, dt, seed: seedStart, minutes }) => {
    let seed = seedStart * 7919;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sim = new Simulation();
    if (mode === 'flashing') sim.setMode('flashing');
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, random);
    for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, 15);

    const seen = new Set<number>();
    const stoppedFor = new Map<number, number>();
    let longestStop = 0;
    let example = '';
    for (let i = 0; i < (minutes * 60) / dt; i++) {
      const before = sim.snapshot();
      // Automatic mode: the signal cycle only runs while someone waits (see main.ts).
      if (mode !== 'auto' || before.vehicles.some((v) => v.yellow) || traffic.waitingAtRed(before)) sim.advance(dt);
      traffic.step(dt, sim.snapshot());
      for (const c of traffic.cars) {
        seen.add(c.id);
        const stopped = c.v < 1 ? (stoppedFor.get(c.id) ?? 0) + dt : 0;
        stoppedFor.set(c.id, stopped);
        longestStop = Math.max(longestStop, stopped);
      }
      const visible = traffic.cars.filter(onScreen);
      for (let a = 0; a < visible.length && !example; a++) {
        for (let b = a + 1; b < visible.length; b++) {
          const [p, q] = [visible[a], visible[b]];
          if (overlap(p, q)) {
            example = `t=${sim.time.toFixed(1)} ${p.route.def.id}@${p.s.toFixed(0)} vs ${q.route.def.id}@${q.s.toFixed(0)}`;
            break;
          }
        }
      }
    }
    expect(example).toBe('');
    expect(longestStop).toBeLessThan(120); // no gridlock: everyone gets going again
    expect((seen.size - traffic.cars.length) / minutes).toBeGreaterThan(30); // cars per minute through
  }, 120_000);
});
