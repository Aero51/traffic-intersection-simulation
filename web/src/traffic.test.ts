import { describe, expect, it } from 'vitest';
import { MAX_SPEED, MIN_GAP, Traffic, buildRoute, lightFor, type RouteDef } from './traffic';
import { Simulation, type SimSnapshot } from './sim';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';

const straight: RouteDef = {
  id: 'straight',
  lane: 'a',
  weight: 1,
  control: { signal: 0 },
  stopNear: [200, 0],
  path: [
    [0, 0],
    ['L', 400, 0],
  ],
};
const branch: RouteDef = {
  id: 'branch',
  lane: 'a',
  weight: 1,
  control: { signal: 0, arrow: 0 },
  stopNear: [200, 0],
  path: [
    [0, 0],
    ['L', 250, 0],
    ['L', 250, 300],
  ],
};

function snapshot(signal0: 'red' | 'yellow' | 'green' | 'blink', arrow0 = false): SimSnapshot {
  const snap = new Simulation().snapshot();
  snap.vehicles[0] = {
    red: signal0 === 'red',
    yellow: signal0 === 'yellow',
    green: signal0 === 'green',
    yellowBlinking: signal0 === 'blink',
  };
  snap.turns[0].green = arrow0;
  return snap;
}

/** Traffic with no automatic spawning. */
const manual = (defs: RouteDef[]) => new Traffic(defs, []);

function run(traffic: Traffic, seconds: number, snap: SimSnapshot): void {
  for (let t = 0; t < seconds; t += 1 / 60) traffic.step(1 / 60, snap);
}

describe('route geometry', () => {
  it('samples every pixel and finds the stop line', () => {
    const r = buildRoute(branch);
    expect(r.length).toBe(550);
    expect(r.stopAt).toBe(200);
  });

  it('builds every real route with a stop line inside it', () => {
    for (const def of ROUTE_DEFS) {
      const r = buildRoute(def);
      expect(r.stopAt, def.id).toBeGreaterThan(20);
      expect(r.stopAt, def.id).toBeLessThan(r.length - 20);
    }
  });
});

describe('lightFor', () => {
  it.each([
    ['green', false, 'go'],
    ['blink', false, 'go'],
    ['red', true, 'go'],
    ['red', false, 'stop'],
    ['yellow', false, 'caution'],
  ] as const)('signal %s, arrow %s -> %s', (signal, arrow, expected) => {
    expect(lightFor({ signal: 0, arrow: 0 }, snapshot(signal, arrow))).toBe(expected);
  });

  it('ignores arrows the route does not use', () => {
    expect(lightFor({ signal: 0 }, snapshot('red', true))).toBe('stop');
  });
});

describe('Traffic', () => {
  it('stops at the line on red and leaves on green', () => {
    const traffic = manual([straight]);
    const car = traffic.spawn(traffic.routes[0])!;
    run(traffic, 10, snapshot('red'));
    expect(car.s).toBeGreaterThan(195);
    expect(car.s).toBeLessThanOrEqual(200);
    expect(car.v).toBeLessThan(1);

    run(traffic, 3, snapshot('green'));
    expect(car.s).toBeGreaterThan(220);
  });

  it('queues behind a stopped car without overlapping', () => {
    const traffic = manual([straight]);
    const route = traffic.routes[0];
    const first = traffic.spawn(route)!;
    run(traffic, 1.5, snapshot('red'));
    const second = traffic.spawn(route)!;
    run(traffic, 15, snapshot('red'));
    expect(first.s - second.s).toBeGreaterThanOrEqual(first.length + MIN_GAP - 0.01);
    expect(first.s - second.s).toBeLessThan(first.length + MIN_GAP + 2);
  });

  it('does not spawn into a full entry', () => {
    const traffic = manual([straight]);
    expect(traffic.spawn(traffic.routes[0])).not.toBeNull();
    expect(traffic.spawn(traffic.routes[0])).toBeNull();
  });

  it('drives through a late yellow but stops on an early one', () => {
    const traffic = manual([straight]);
    const near = traffic.spawn(traffic.routes[0])!;
    while (near.s < 180) traffic.step(1 / 60, snapshot('green')); // close to the line at full speed
    expect(near.s).toBeLessThan(200);
    run(traffic, 2, snapshot('yellow'));
    expect(near.s).toBeGreaterThan(200);

    const far = manual([straight]);
    const car = far.spawn(far.routes[0])!;
    run(far, 10, snapshot('yellow'));
    expect(car.s).toBeLessThanOrEqual(200);
  });

  it('lets a turn arrow release only the turning route', () => {
    const traffic = manual([straight, branch]);
    const [r1, r2] = traffic.routes;
    const a = traffic.spawn(r1)!;
    run(traffic, 2, snapshot('red', true));
    const b = traffic.spawn(r2)!;
    run(traffic, 15, snapshot('red', true));
    expect(a.s).toBeLessThanOrEqual(200); // straight car waits on red
    // The turning car is in the same lane and stuck behind it while their routes overlap.
    expect(b.s).toBeLessThan(a.s);
    expect(a.s - b.s).toBeGreaterThanOrEqual(a.length + MIN_GAP - 0.01);
  });

  it('keeps the number of cars from a side at its slider value', () => {
    const traffic = new Traffic([straight], [{ id: 'g', lanes: { a: 1 } }], () => 0.5);
    const green = snapshot('green');
    run(traffic, 5, green);
    expect(traffic.cars).toHaveLength(0); // slider starts at 0

    traffic.setTarget('g', 3);
    run(traffic, 5, green);
    expect(traffic.count('g')).toBe(3);
    run(traffic, 20, green); // cars leaving are replaced
    expect(traffic.count('g')).toBe(3);

    traffic.setTarget('g', 0);
    run(traffic, 10, green); // the rest drive off
    expect(traffic.cars).toHaveLength(0);
  });

  it('reports cars standing at a red light (induction loop)', () => {
    const traffic = manual([straight]);
    traffic.spawn(traffic.routes[0]);
    run(traffic, 1, snapshot('red'));
    expect(traffic.waitingAtRed(snapshot('red'))).toBe(false); // still driving up
    run(traffic, 10, snapshot('red'));
    expect(traffic.waitingAtRed(snapshot('red'))).toBe(true);
    expect(traffic.waitingAtRed(snapshot('green'))).toBe(false);
  });

  it('shows brake lights when stopping and indicators before a turn', () => {
    const traffic = manual([straight, { ...branch, turn: 'right' }]);
    const [r1, r2] = traffic.routes;
    expect(r2.divergeAt).toBeGreaterThan(245);
    expect(r2.divergeAt).toBeLessThan(255);

    const cruising = traffic.spawn(r1)!;
    run(traffic, 0.5, snapshot('green'));
    expect(cruising.braking).toBe(false);
    expect(cruising.indicator).toBeNull();
    run(traffic, 10, snapshot('red'));
    expect(cruising.braking).toBe(true);

    const turning = manual([straight, { ...branch, turn: 'right' }]);
    const car = turning.spawn(turning.routes[1])!;
    run(turning, 0.5, snapshot('green'));
    expect(car.indicator).toBe('right'); // within 220 px of the turn
  });

  it('slows down for a sharp corner', () => {
    const r = buildRoute(branch);
    expect(r.speed[100]).toBe(MAX_SPEED);
    expect(r.speed[250]).toBeLessThan(MAX_SPEED / 2);
    expect(r.speed[240]).toBeLessThan(MAX_SPEED);
  });

  it('removes cars after they leave the route', () => {
    const traffic = manual([straight]);
    traffic.spawn(traffic.routes[0]);
    run(traffic, 15, snapshot('green'));
    expect(traffic.cars).toHaveLength(0);
  });

  it('runs the real intersection for a long time without overlaps in any lane', () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sim = new Simulation();
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, random);
    for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, 15);
    let maxCars = 0;
    let minGap = Infinity;
    for (let i = 0; i < 60 * 300; i++) {
      sim.advance(1 / 60);
      traffic.step(1 / 60, sim.snapshot());
      maxCars = Math.max(maxCars, traffic.cars.length);
      for (const a of traffic.cars) {
        for (const b of traffic.cars) {
          if (a !== b && a.route === b.route && b.s > a.s) minGap = Math.min(minGap, b.s - b.length - a.s);
        }
      }
    }
    expect(maxCars).toBeGreaterThan(5);
    expect(minGap).toBeGreaterThanOrEqual(MIN_GAP - 0.01);
  });
});
