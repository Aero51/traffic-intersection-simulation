import { describe, expect, it } from 'vitest';
import { Simulation, lampKey, type Lights } from './sim';
import { Controller } from './controller';
import { Traffic, type RouteDef } from './traffic';
import { Pedestrians, CROSSINGS } from './pedestrians';
import { Stats } from './stats';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';
import { DEFAULT_SETTINGS, readUrl } from './settings';
import { darkness, demandFactor, formatClock } from './day';
import { seeded } from './random';
import { World } from './world';

const lamps = (sim: Simulation) => sim.snapshot().vehicles.map(lampKey);
const green = (l: Lights) => l.green || l.yellow; // anything but red counts as "open" for safety checks

/** Main road (1-4) and side road (5) must never be open at the same time. */
function assertSafe(sim: Simulation, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds; t += step) {
    sim.advance(step);
    const v = sim.snapshot().vehicles;
    const mainOpen = v.slice(0, 4).some(green);
    expect(mainOpen && green(v[4]), `t=${sim.time.toFixed(1)} ${v.map(lampKey)}`).toBe(false);
  }
}

describe('side road priority ("Sporedni prednost")', () => {
  it('gives signal 5 the long green within the same 23 s cycle', () => {
    const sim = new Simulation();
    sim.setMode('secondary');
    expect(sim.plan).toBe('secondary');
    expect(sim.cycleLength(0)).toBe(23);
    expect(sim.cycleLength(4)).toBe(23);
    const t = sim.planTimeline()!;
    const greenTime = (row: number) => t.rows[row].filter((s) => s.lamps === 'G').reduce((n, s) => n + s.to - s.from, 0);
    expect(greenTime(4)).toBe(10);
    expect(greenTime(0)).toBe(4);
  });

  it('never opens the main and side road together', () => {
    const sim = new Simulation();
    sim.setMode('secondary');
    assertSafe(sim, 100);
    sim.setMode('normal');
    assertSafe(sim, 100);
  });

  it('keeps separate timings per plan', () => {
    const sim = new Simulation();
    sim.applyTiming(0, { open: 12, closed: 8 });
    sim.setMode('secondary');
    expect(sim.timing(0)).toEqual({ open: 4, closed: 16 });
    sim.setMode('normal');
    expect(sim.timing(0)).toEqual({ open: 12, closed: 8 });
  });
});

describe('ambulance preemption', () => {
  it('clears the main road and holds the side road green until released', () => {
    const sim = new Simulation();
    sim.advance(3); // main road green
    sim.preempt('side');
    expect(lamps(sim).slice(0, 4)).toEqual(['Y', 'Y', 'Y', 'Y']);
    sim.advance(2.05);
    expect(lamps(sim)).toEqual(['R', 'R', 'R', 'R', 'R']);
    sim.advance(1);
    expect(lamps(sim)[4]).toBe('RY');
    sim.advance(1);
    expect(lamps(sim)[4]).toBe('G');
    sim.advance(60); // held while the ambulance comes
    expect(lamps(sim)).toEqual(['R', 'R', 'R', 'R', 'G']);
    expect(sim.snapshot().pedestrians.every((p) => p.red)).toBe(true);

    sim.release();
    expect(lamps(sim)[4]).toBe('Y');
    sim.advance(4.05);
    expect(sim.preempted).toBeNull();
    expect(lamps(sim)).toEqual(['G', 'G', 'G', 'G', 'R']); // normal cycle restarted
  });

  it('is safe whenever it starts, and waits for green before releasing', () => {
    for (let start = 0; start < 23; start += 0.5) {
      const sim = new Simulation();
      sim.advance(start + 0.01);
      sim.preempt(start % 2 ? 'main' : 'side');
      sim.release(); // ambulance gone immediately: must still finish changing first
      assertSafe(sim, 40, 0.05);
      expect(sim.preempted).toBeNull();
    }
  });

  it('keeps a pending Tipkalo request through the preemption', () => {
    const sim = new Simulation();
    sim.requestPedestrians();
    sim.preempt('main');
    sim.release();
    expect(sim.pedestrianRequestPending).toBe(true);
  });

  it('is ignored when flashing', () => {
    const sim = new Simulation();
    sim.setMode('flashing');
    sim.preempt('side');
    expect(sim.preempted).toBeNull();
  });
});

describe('look-ahead', () => {
  it('predicts when a signal changes without touching the simulation', () => {
    const sim = new Simulation();
    sim.advance(4);
    expect(sim.nextChange('vehicles', 0)).toBeCloseTo(6, 3); // green until 10 s
    expect(sim.time).toBe(4);
    expect(lamps(sim)[0]).toBe('G');
    expect(sim.nextChange('vehicles', 4)).toBeCloseTo(10, 3); // red until red+yellow at 14 s
  });

  it('counts down the pedestrian green', () => {
    const sim = new Simulation();
    sim.requestPedestrians('main');
    sim.advance(14); // 6/7 green from 13 s to 20 s
    expect(sim.snapshot().pedestrians[0].green).toBe(true);
    expect(sim.nextChange('pedestrians', 0)).toBeCloseTo(6, 3);
  });

  it('clones independently', () => {
    const sim = new Simulation();
    sim.advance(5);
    const c = sim.clone();
    c.advance(10);
    expect(sim.time).toBe(5);
    expect(lamps(sim)).toEqual(['G', 'G', 'G', 'G', 'R']);
    expect(lamps(c)).not.toEqual(lamps(sim));
  });

  it('requests per crossing', () => {
    const sim = new Simulation();
    sim.requestPedestrians('side');
    expect(sim.pedestrianRequests).toEqual({ main: false, side: true });
  });
});

describe('controller', () => {
  const world = (strategy: Controller['strategy']) => {
    const sim = new Simulation();
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, seeded(3));
    const controller = new Controller();
    controller.strategy = strategy;
    return { sim, traffic, controller };
  };

  it('fixed always runs the clock', () => {
    const { sim, traffic, controller } = world('fixed');
    for (let i = 0; i < 100; i++) controller.step(0.1, sim, traffic);
    expect(sim.time).toBeCloseTo(10, 6);
  });

  it('on demand holds a green while nobody waits', () => {
    const { sim, traffic, controller } = world('demand');
    for (let i = 0; i < 200; i++) controller.step(0.1, sim, traffic);
    expect(sim.time).toBe(0);
    expect(controller.held).toBe(true);
    sim.requestPedestrians();
    controller.step(0.1, sim, traffic);
    expect(sim.time).toBeGreaterThan(0);
  });

  it('actuated rests in green with no traffic, and ends it early once someone waits on red', () => {
    const { sim, traffic, controller } = world('actuated');
    for (let i = 0; i < 100; i++) controller.step(0.1, sim, traffic);
    expect(lamps(sim)[0]).toBe('G');
    expect(sim.time).toBe(0);
    // A car waits on the side road and nothing comes on the main road: green ends now.
    const side = traffic.routes.find((r) => r.def.lane === 'side')!;
    const car = traffic.spawn(side)!;
    for (let i = 0; i < 300 && lamps(sim)[0] === 'G'; i++) {
      traffic.step(0.1, sim.snapshot());
      controller.step(0.1, sim, traffic);
    }
    expect(lamps(sim)[0]).not.toBe('G');
    expect(car.v).toBeLessThan(3);
  });
});

describe('statistics', () => {
  it('counts cars through the stop line and their waits', () => {
    const def: RouteDef = {
      id: 'r',
      lane: 'a',
      weight: 1,
      control: { signal: 0 },
      stopNear: [200, 0],
      path: [
        [0, 0],
        ['L', 400, 0],
      ],
    };
    const traffic = new Traffic([def], [{ id: 'g', lanes: { a: 1 } }]);
    const peds = new Pedestrians(() => 0.5);
    const stats = new Stats([{ id: 'g', lanes: { a: 1 } }]);
    const red = new Simulation().snapshot();
    red.vehicles[0] = { red: true, yellow: false, green: false, yellowBlinking: false };
    const go = new Simulation().snapshot();
    traffic.spawn(traffic.routes[0], 'g');
    for (let t = 0; t < 10; t += 0.05) {
      traffic.step(0.05, red);
      stats.update(0.05, traffic, peds);
    }
    expect(stats.approaches[0].queue).toBe(1);
    for (let t = 0; t < 5; t += 0.05) {
      traffic.step(0.05, go);
      stats.update(0.05, traffic, peds);
    }
    const a = stats.approaches[0];
    expect(a.passed).toBe(1);
    expect(a.maxWait).toBeGreaterThan(5);
    expect(stats.summary().passed).toBe(1);
    stats.reset();
    expect(stats.approaches[0].passed).toBe(0);
  });
});

describe('traffic options', () => {
  it('sends an ambulance that is not counted against the sliders', () => {
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, seeded(1));
    const amb = traffic.spawnEmergency(traffic.routes[0])!;
    expect(amb.emergency).toBe(true);
    expect(amb.kind).toBe('ambulance');
    expect(traffic.count('istok')).toBe(0);
    expect(traffic.emergencyApproaching()).toBe(amb);
  });

  it('adds buses, lorries and motorbikes, and per-driver differences, when enabled', () => {
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, seeded(9));
    traffic.options = { variety: true, drivers: true, grip: 1 };
    const kinds = new Set<string>();
    const speeds = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const car = traffic.spawn(traffic.routes[i % traffic.routes.length]);
      if (car) {
        kinds.add(car.kind);
        speeds.add(Math.round(car.maxV));
      }
      traffic.cars = [];
    }
    expect(kinds).toContain('bus');
    expect(kinds).toContain('moto');
    expect(kinds).toContain('bike');
    expect(speeds.size).toBeGreaterThan(5);
  });

  it('bicycles are slow and narrow, and still obey the signals', () => {
    const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, seeded(3));
    traffic.options = { variety: true, drivers: false, grip: 1 };
    let bike: ReturnType<Traffic['spawn']> = null;
    for (let i = 0; i < 400 && !bike; i++) {
      const car = traffic.spawn(traffic.routes[i % traffic.routes.length]);
      if (car?.kind === 'bike') bike = car;
      else traffic.cars = [];
    }
    expect(bike).not.toBeNull();
    expect(bike!.maxV).toBeLessThan(40);
    expect(bike!.width).toBeLessThan(10);
  });

  it('a broken-down car blocks its lane, then the queue behind it clears', () => {
    const def: RouteDef = {
      id: 'r',
      lane: 'a',
      weight: 1,
      control: { signal: 0 },
      stopNear: [500, 0],
      path: [
        [0, 0],
        ['L', 700, 0],
      ],
    };
    const traffic = new Traffic([def], [], seeded(1));
    const green = new Simulation().snapshot();
    green.vehicles[0] = { red: false, yellow: false, green: true, yellowBlinking: false };
    const first = traffic.spawn(traffic.routes[0])!;
    for (let i = 0; i < 80; i++) traffic.step(1 / 20, green); // drive up the road
    const victim = traffic.breakDown(10)!;
    expect(victim).toBe(first);
    const behind = traffic.spawn(traffic.routes[0])!;
    for (let i = 0; i < 20 * 8; i++) traffic.step(1 / 20, green);
    expect(victim.status).toBe('stalled');
    expect(victim.v).toBe(0);
    expect(behind.s).toBeLessThan(victim.s - victim.length); // stuck behind it
    for (let i = 0; i < 20 * 20; i++) traffic.step(1 / 20, green);
    expect(victim.stalled).toBe(0);
    expect(victim.s).toBeGreaterThan(0);
    expect(behind.s).toBeGreaterThan(victim.s - 200);
  });

  it('reports why a car is stopped', () => {
    const def: RouteDef = {
      id: 'r',
      lane: 'a',
      weight: 1,
      control: { signal: 0 },
      stopNear: [200, 0],
      path: [
        [0, 0],
        ['L', 400, 0],
      ],
    };
    const traffic = new Traffic([def], []);
    const red = new Simulation().snapshot();
    red.vehicles[0] = { red: true, yellow: false, green: false, yellowBlinking: false };
    const a = traffic.spawn(traffic.routes[0])!;
    for (let t = 0; t < 8; t += 1 / 60) traffic.step(1 / 60, red);
    const b = traffic.spawn(traffic.routes[0])!;
    for (let t = 0; t < 8; t += 1 / 60) traffic.step(1 / 60, red);
    expect(a.status).toBe('red');
    expect(b.status).toBe('queue');
  });

  it('brakes earlier in the rain', () => {
    const def: RouteDef = {
      id: 'r',
      lane: 'a',
      weight: 1,
      control: { signal: 0 },
      stopNear: [300, 0],
      path: [
        [0, 0],
        ['L', 500, 0],
      ],
    };
    const red = new Simulation().snapshot();
    red.vehicles[0] = { red: true, yellow: false, green: false, yellowBlinking: false };
    const firstBrake = (grip: number) => {
      const traffic = new Traffic([def], []);
      traffic.options = { variety: false, drivers: false, grip };
      const car = traffic.spawn(traffic.routes[0])!;
      for (let t = 0; t < 10; t += 1 / 60) {
        traffic.step(1 / 60, red);
        if (car.v > 10 && car.braking) return car.s;
      }
      return Infinity;
    };
    expect(firstBrake(0.65)).toBeLessThan(firstBrake(1));
  });
});

describe('pedestrian arrivals', () => {
  it('people turn up on their own and press the button', () => {
    const peds = new Pedestrians(seeded(4));
    peds.rate = 60;
    const snap = new Simulation().snapshot();
    const arrived = [];
    for (let t = 0; t < 30; t += 0.1) arrived.push(...peds.step(0.1, snap));
    expect(arrived.length).toBeGreaterThan(5);
    expect(peds.walkers.length).toBeLessThanOrEqual(CROSSINGS.length * 2 * 3); // at most 3 per kerb
  });
});

describe('settings URL', () => {
  it('reads a shared link and ignores bad values', () => {
    const { settings, timings } = readUrl('?mode=secondary&ctl=queue&cars=1,2,3&ped=5&t=5-15,5-15,5-15,5-15,9-8&rain=1&var=0');
    expect(settings.mode).toBe('secondary');
    expect(settings.control).toBe('queue');
    expect(settings.cars).toEqual({ istok: 1, sjever: 2, zapad: 3 });
    expect(settings.pedestrians).toBe(5);
    expect(settings.weather).toBe('rain');
    expect(settings.variety).toBe(false);
    expect(timings).toEqual({ plan: 'secondary', timings: [...Array(4).fill({ open: 5, closed: 15 }), { open: 9, closed: 8 }] });

    const bad = readUrl('?mode=x&ctl=y&cars=99,1&ped=-3&t=1-2');
    expect(bad.settings).toEqual(DEFAULT_SETTINGS);
    expect(bad.timings).toBeNull();
  });
});

describe('day cycle', () => {
  it('is busiest in the rush hours and dark at night', () => {
    expect(demandFactor(8)).toBeGreaterThan(demandFactor(11));
    expect(demandFactor(17)).toBeGreaterThan(1.2);
    expect(demandFactor(3)).toBeLessThan(0.3);
    expect(darkness(2)).toBe(1);
    expect(darkness(12)).toBe(0);
    expect(darkness(6.25)).toBeGreaterThan(0);
    expect(darkness(6.25)).toBeLessThan(1);
    expect(formatClock(7.5)).toBe('07:30');
    expect(formatClock(24.25)).toBe('00:15');
  });
});

describe('waiting at red', () => {
  it('a left-turner from the west waits clear of the oncoming lane, so it does not hold that lane up on green', () => {
    const traffic = new Traffic(ROUTE_DEFS, []);
    const sim = new Simulation();
    sim.advance(13); // main road red
    const leftTurn = traffic.routes.find((r) => r.def.id === 'se-left-turn')!;
    const oncoming = traffic.routes.find((r) => r.def.id === 'nw-left-lane')!;
    const turner = traffic.spawn(leftTurn)!;
    for (let t = 0; t < 8; t += 1 / 60) traffic.step(1 / 60, sim.snapshot());
    expect(turner.s).toBeLessThanOrEqual(traffic.gate.get(leftTurn)! + 0.01);

    sim.advance(10); // main road green again
    const car = traffic.spawn(oncoming)!;
    let stood = 0;
    for (let t = 0; t < 12 && !car.passedLine; t += 1 / 60) {
      traffic.step(1 / 60, sim.snapshot());
      if (car.v < 1) stood += 1 / 60;
    }
    expect(car.passedLine).toBe(true);
    expect(stood).toBeLessThan(0.5);
  });
});

describe('chart helpers and export', () => {
  it('rounds the y axis to clean numbers', async () => {
    const { niceScale, timeTicks, clockLabel } = await import('./chart-math');
    expect(niceScale(47)).toEqual({ max: 60, step: 20 });
    expect(niceScale(9)).toEqual({ max: 10, step: 5 });
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
    expect(niceScale(1.3).max).toBeCloseTo(1.5, 6);
    expect(timeTicks(60)).toEqual([0, 15, 30, 45, 60]);
    expect(timeTicks(600).length).toBeLessThanOrEqual(6);
    expect(clockLabel(75)).toBe('1:15');
  });

  it('quotes CSV cells and writes the whole-run series', async () => {
    const { toCsv, seriesCsv, summaryCsv } = await import('./export');
    expect(toCsv([['a', 'b,c', 'say "hi"', null, 1.23456]])).toBe('a,"b,c","say ""hi""",,1.235\r\n');
    const world = new World(seeded(2));
    for (const g of ['istok', 'sjever', 'zapad']) world.traffic.setTarget(g, 6);
    world.pedestrians.rate = 20;
    for (let t = 0; t < 130; t += 1 / 20) world.step(1 / 20);
    expect(world.stats.series.length).toBe(26); // one every 5 s
    expect(world.stats.series[25].flow).toBeGreaterThan(0);
    const lines = seriesCsv(world.stats).trim().split('\r\n');
    expect(lines[0]).toBe('time_s,cars_per_min,queue_cars,avg_car_wait_s,avg_pedestrian_wait_s');
    expect(lines).toHaveLength(27);
    const summary = summaryCsv(world.stats);
    expect(summary).toContain('istok,');
    expect(summary).toContain('total,');
    world.stats.reset();
    expect(world.stats.series).toEqual([]);
  });
});
