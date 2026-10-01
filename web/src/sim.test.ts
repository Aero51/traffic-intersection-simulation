import { describe, expect, it } from 'vitest';
import { Simulation, type Lights } from './sim';

/** Compact lamp notation: 'R', 'Y', 'G', 'RY', '' (dark), '*' suffix = yellow blinking. */
function lamps(l: Lights): string {
  return (l.red ? 'R' : '') + (l.yellow ? 'Y' : '') + (l.green ? 'G' : '') + (l.yellowBlinking ? '*' : '');
}

function at(sim: Simulation, t: number) {
  sim.advance(t - sim.time);
  const s = sim.snapshot();
  return {
    vehicles: s.vehicles.map(lamps),
    pedestrians: s.pedestrians.map(lamps),
    turns: s.turns.map(lamps),
  };
}

describe('default cycle (signals 1-4: 10/10, signal 5: 4/13)', () => {
  it('has a 23 s period on every signal', () => {
    const sim = new Simulation();
    for (let i = 0; i < 5; i++) expect(sim.cycleLength(i)).toBe(23);
  });

  it.each([
    // t, vehicles 1-5, turn arrows 10-12
    [0, ['G', 'G', 'G', 'G', 'R'], ['', '', '']],
    [10.5, ['Y', 'Y', 'Y', 'Y', 'R'], ['', '', '']],
    [12.5, ['R', 'R', 'R', 'R', 'R'], ['G', '', '']],
    [14.5, ['R', 'R', 'R', 'R', 'RY'], ['G', '', '']],
    [15.5, ['R', 'R', 'R', 'R', 'G'], ['G', '', '']],
    [19.5, ['R', 'R', 'R', 'R', 'Y'], ['G', '', '']],
    [20.5, ['R', 'R', 'R', 'R', 'Y'], ['', 'G', 'G']],
    [21.5, ['R', 'R', 'R', 'R', 'R'], ['', 'G', 'G']],
    [22.5, ['RY', 'RY', 'RY', 'RY', 'R'], ['', 'G', 'G']],
    [23.5, ['G', 'G', 'G', 'G', 'R'], ['', '', '']],
    [23 * 40 + 12.5, ['R', 'R', 'R', 'R', 'R'], ['G', '', '']],
  ])('t = %s s', (t, vehicles, turns) => {
    const sim = new Simulation();
    const s = at(sim, t);
    expect(s.vehicles).toEqual(vehicles);
    expect(s.turns).toEqual(turns);
    expect(s.pedestrians).toEqual(['R', 'R', 'R', 'R']);
  });

  it('gives the same result for many small steps as for one big step', () => {
    const stepped = new Simulation();
    for (let i = 0; i < 60 * 500; i++) stepped.advance(1 / 60);
    const jumped = new Simulation();
    jumped.advance(stepped.time);
    expect(stepped.snapshot()).toEqual(jumped.snapshot());
  });
});

describe('Tipkalo (pedestrian request)', () => {
  it('suppresses the turn arrows and gives pedestrians 8 and 9 green next cycle', () => {
    const sim = new Simulation();
    at(sim, 5);
    sim.requestPedestrians();

    expect(at(sim, 12.5).turns).toEqual(['', '', '']);
    expect(at(sim, 20.5).turns).toEqual(['', '', '']);

    const next = at(sim, 23.5);
    expect(next.pedestrians).toEqual(['R', 'R', 'G', 'G']);
    expect(next.vehicles[4]).toBe('R');

    // Request consumed: turn arrows come back, pedestrians go red when signal 5 turns red-yellow.
    expect(at(sim, 23 + 12.5).turns).toEqual(['G', '', '']);
    expect(at(sim, 23 + 14.5).pedestrians).toEqual(['R', 'R', 'R', 'R']);
    expect(at(sim, 46.5).pedestrians).toEqual(['R', 'R', 'R', 'R']);
  });
});

describe('modes', () => {
  it('"Policajac" blinks yellow on vehicle signals and turns everything else off', () => {
    const sim = new Simulation();
    at(sim, 13);
    sim.setMode('flashing');
    for (const t of [13, 20, 100]) {
      const s = at(sim, t);
      expect(s.vehicles).toEqual(['*', '*', '*', '*', '*']);
      expect(s.pedestrians).toEqual(['', '', '', '']);
      expect(s.turns).toEqual(['', '', '']);
    }
  });

  it('switching back to normal restarts the cycle from the beginning', () => {
    const sim = new Simulation();
    at(sim, 13);
    sim.setMode('flashing');
    at(sim, 50);
    sim.setMode('normal');
    expect(at(sim, 50).vehicles).toEqual(['G', 'G', 'G', 'G', 'R']);
    expect(at(sim, 50 + 12.5).vehicles).toEqual(['R', 'R', 'R', 'R', 'R']);
  });
});

describe('applyTiming ("Prihvati")', () => {
  it('keeps the edited signal at the reference signal\'s cycle position and lights it immediately', () => {
    const sim = new Simulation();
    at(sim, 5);
    sim.applyTiming(0, { open: 4, closed: 16 });
    expect(sim.cycleLength(0)).toBe(23);
    // 5 s into the cycle with 4 s green -> already yellow.
    expect(at(sim, 5).vehicles[0]).toBe('Y');
    expect(at(sim, 6.5).vehicles[0]).toBe('R');
    expect(at(sim, 23.5).vehicles[0]).toBe('G');
    // Other signals are untouched.
    expect(at(sim, 23.5).vehicles.slice(1)).toEqual(['G', 'G', 'G', 'R']);
  });

  it('only stores the timing while flashing, and uses it on the next normal start', () => {
    const sim = new Simulation();
    sim.setMode('flashing');
    sim.applyTiming(2, { open: 20, closed: 10 });
    expect(at(sim, 1).vehicles[2]).toBe('*');
    sim.setMode('normal');
    expect(sim.cycleLength(2)).toBe(33);
    expect(sim.timing(2)).toEqual({ open: 20, closed: 10 });
  });

  it('stretches signal 5 to match a longer signal 2 cycle', () => {
    const sim = new Simulation();
    sim.applyTiming(1, { open: 15, closed: 15 });
    expect(sim.cycleLength(1)).toBe(33);
    expect(sim.cycleLength(4)).toBe(33);
  });
});
