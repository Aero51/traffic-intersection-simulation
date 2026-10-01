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

  it.each([1, 2, 3])('heavy traffic for 10 minutes: no cars overlap and traffic keeps moving (seed %i)', (seedStart) => {
    let seed = seedStart;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sim = new Simulation();
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, random);
    for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, 15);

    const seen = new Set<number>();
    let collisions = 0;
    let example = '';
    let movingAtEnd = 0;
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 600; i++) {
      sim.advance(dt);
      traffic.step(dt, sim.snapshot());
      for (const c of traffic.cars) seen.add(c.id);
      if (i % 3) continue;
      const visible = traffic.cars.filter(onScreen);
      for (let a = 0; a < visible.length; a++) {
        for (let b = a + 1; b < visible.length; b++) {
          const [p, q] = [visible[a], visible[b]];
          if (p.route.def.lane === q.route.def.lane && p.route === q.route) continue; // covered by following tests
          if (overlap(p, q)) {
            collisions++;
            example ||= `t=${sim.time.toFixed(1)} ${p.route.def.id}@${p.s.toFixed(0)} vs ${q.route.def.id}@${q.s.toFixed(0)}`;
          }
        }
      }
      if (i > 30 * 590) movingAtEnd = Math.max(movingAtEnd, traffic.cars.filter((c) => c.v > 5).length);
    }
    expect(example).toBe('');
    expect(collisions).toBe(0);
    expect(seen.size - traffic.cars.length).toBeGreaterThan(300); // cars got through
    expect(movingAtEnd).toBeGreaterThan(0); // no gridlock
  });
});
