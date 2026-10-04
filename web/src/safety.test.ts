import { describe, expect, it } from 'vitest';
import { Simulation, PLAN_TIMINGS, type SignalTiming } from './sim';
import { analyzeTimeline, checkTimings, safeOpenRange } from './safety';

/** The cycle diagram with one signal's timing changed, like the menu's live preview. */
function timelineWith(index: number, timing: SignalTiming, plan: 'normal' | 'secondary' = 'normal') {
  const sim = new Simulation();
  if (plan !== 'normal') sim.setMode(plan);
  sim.applyTiming(index, timing);
  return sim.planTimeline()!;
}

describe('timing safety', () => {
  it('finds nothing wrong with either built-in plan', () => {
    expect(checkTimings('normal', PLAN_TIMINGS.normal)).toEqual([]);
    expect(checkTimings('secondary', PLAN_TIMINGS.secondary)).toEqual([]);
  });

  it("flags a main-road green that runs into the side road's green", () => {
    const issues = analyzeTimeline(timelineWith(0, { open: 13, closed: 7 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('overlap');
    expect(issues[0].from).toBeCloseTo(14, 1);
    expect(issues[0].to).toBeCloseTo(16, 1); // ...plus the second the side road stays open after
  });

  it('flags a side-road green that runs into the main road', () => {
    const issues = analyzeTimeline(timelineWith(4, { open: 8, closed: 9 }));
    expect(issues.some((i) => i.kind === 'overlap' && i.from < 11 && i.to > 11)).toBe(true);
  });

  it('flags less than one second of all-red between the roads', () => {
    // Side road opens (red+yellow) the instant the main road turns red.
    const issues = analyzeTimeline(timelineWith(4, { open: 6, closed: 11 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('tight');
    expect(issues[0].from).toBeCloseTo(12, 1);
    expect(issues[0].to).toBeCloseTo(13, 1);
  });

  it('accepts exactly one second of all-red', () => {
    expect(analyzeTimeline(timelineWith(0, { open: 11, closed: 9 }))).toEqual([]);
    expect(analyzeTimeline(timelineWith(4, { open: 5, closed: 12 }))).toEqual([]);
  });

  it('tells which green times are safe for a signal', () => {
    const total = (index: number) => {
      const t = new Simulation().timing(index);
      return t.open + t.closed;
    };
    expect(safeOpenRange(total(0), (open) => timelineWith(0, { open, closed: total(0) - open }))).toEqual({ min: 1, max: 11 });
    expect(safeOpenRange(total(4), (open) => timelineWith(4, { open, closed: total(4) - open }))).toEqual({ min: 1, max: 5 });
  });

  it('works for the side-priority plan too', () => {
    const issues = analyzeTimeline(timelineWith(4, { open: 14, closed: 3 }, 'secondary'));
    expect(issues.length).toBeGreaterThan(0);
  });
});
