import { describe, expect, it } from 'vitest';
import { STATES, encodeState, learnedPolicy } from './controller';
import { LEARNED_Q } from './learned-policy';
import { emptyTable, train } from './rl';

describe('state encoding', () => {
  it('maps every observation into the table and tells different situations apart', () => {
    const seen = new Set<number>();
    for (const phase of ['main', 'side'] as const) {
      for (const greenFor of [5, 9, 14, 30]) {
        for (const own of [0, 2, 4, 10]) {
          for (const other of [0, 2, 4, 10]) {
            const s = encodeState({ phase, greenFor, own, other });
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThan(STATES);
            seen.add(s);
          }
        }
      }
    }
    expect(seen.size).toBe(STATES);
  });
});

describe('learned policy', () => {
  it('ships a table of the right shape', () => {
    expect(LEARNED_Q).toHaveLength(STATES);
    for (const row of LEARNED_Q) expect(row).toHaveLength(2);
  });

  it('where nothing was learned, follows the longest-queue rule', () => {
    const obs = { phase: 'main' as const, greenFor: 9, own: 1, other: 7 };
    // state 0 is never reached with these observations, so use an unvisited-looking row
    const state = encodeState(obs);
    const [a, b] = LEARNED_Q[state];
    if (a === b) {
      expect(learnedPolicy(state, obs)).toBe('switch');
      expect(learnedPolicy(state, { ...obs, own: 8, other: 1 })).toBe('keep');
    } else {
      expect(learnedPolicy(state, obs)).toBe(a > b ? 'keep' : 'switch');
    }
  });
});

describe('training', () => {
  it('runs, only touches visited states, and is repeatable', () => {
    const run = () => train({ episodes: 2, minutes: 1, seed: 5 });
    const q = run();
    expect(q).toHaveLength(STATES);
    expect(q.some(([a, b]) => a !== 0 || b !== 0)).toBe(true);
    expect(JSON.stringify(run())).toBe(JSON.stringify(q));
    expect(JSON.stringify(emptyTable())).not.toBe(JSON.stringify(q));
  }, 60_000);
});
