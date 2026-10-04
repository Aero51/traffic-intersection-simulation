import { describe, expect, it } from 'vitest';
import { MAX_CYCLE, MIN_CYCLE, websterSplit } from './webster';

const LOST = 4;
const MIN = 4;

describe('websterSplit', () => {
  it('matches the textbook formula for a worked example', () => {
    // main 32/min over 2 lanes -> y=0.4, side 8/min -> y=0.2, Y=0.6; L=8: C0=(12+5)/0.4=42.5
    const s = websterSplit({ main: 32, side: 8 }, LOST, MIN);
    expect(s.cycle).toBe(43);
    expect(s.main + s.side).toBe(43 - 8);
    expect(s.main).toBe(Math.round(35 * (0.4 / 0.6))); // greens in proportion to flow ratios
  });

  it('a busier road gets the longer green, and heavier traffic needs a longer cycle', () => {
    const mainHeavy = websterSplit({ main: 40, side: 4 }, LOST, MIN);
    const sideHeavy = websterSplit({ main: 8, side: 20 }, LOST, MIN);
    expect(mainHeavy.main).toBeGreaterThan(mainHeavy.side);
    expect(sideHeavy.side).toBeGreaterThan(sideHeavy.main);
    expect(websterSplit({ main: 50, side: 15 }, LOST, MIN).cycle).toBeGreaterThan(websterSplit({ main: 10, side: 3 }, LOST, MIN).cycle);
  });

  it('stays within sane limits when there is no traffic or far too much', () => {
    const none = websterSplit({ main: 0, side: 0 }, LOST, MIN);
    expect(none.cycle).toBe(MIN_CYCLE);
    expect(Math.abs(none.main - none.side)).toBeLessThanOrEqual(1); // no preference
    const flood = websterSplit({ main: 500, side: 500 }, LOST, MIN);
    expect(flood.cycle).toBeLessThanOrEqual(MAX_CYCLE);
    for (const s of [none, flood]) {
      expect(s.main).toBeGreaterThanOrEqual(MIN);
      expect(s.side).toBeGreaterThanOrEqual(MIN);
      expect(s.main + s.side).toBe(s.cycle - 2 * LOST);
    }
  });
});

describe('websterSplit as timings', () => {
  it('always gives timings the safety check accepts, over a grid of flows', async () => {
    const { timingsFor } = await import('./optimizer');
    const { checkTimings } = await import('./safety');
    for (const main of [0, 5, 20, 40, 80, 300]) {
      for (const side of [0, 3, 12, 40, 300]) {
        const s = websterSplit({ main, side }, LOST, MIN);
        expect(checkTimings('normal', timingsFor(s)), JSON.stringify({ main, side, s })).toEqual([]);
      }
    }
  });
});
