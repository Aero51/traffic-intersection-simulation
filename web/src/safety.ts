// Is a set of signal timings safe? The main road (signals 1-4) and the side road (signal 5)
// must never be open at the same time, and there must be at least ALL_RED seconds between
// one road closing and the other opening. "Open" means any lamp state a car may enter on:
// green, yellow, or red+yellow (about to turn green). Pure TypeScript, no DOM.

import { ALL_RED, Simulation, type Plan, type SignalTiming, type Timeline, type TimelineSegment } from './sim';

export interface SafetyIssue {
  /** overlap: both roads open at once. tight: less than ALL_RED between them. */
  kind: 'overlap' | 'tight';
  /** Seconds into the cycle. */
  from: number;
  to: number;
}

const STEP = 0.05;
const isOpen = (lamps: string) => lamps === 'G' || lamps === 'Y' || lamps === 'RY';

function openAt(row: TimelineSegment[], t: number): boolean {
  const seg = row.find((s) => t >= s.from && t < s.to);
  return seg ? isOpen(seg.lamps) : false;
}

/** Runs of consecutive flagged samples as [from, to) in seconds. */
function runs(flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  flags.forEach((on, i) => {
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start * STEP, i * STEP]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start * STEP, flags.length * STEP]);
  return out;
}

export function analyzeTimeline(timeline: Timeline): SafetyIssue[] {
  const n = Math.round(timeline.cycle / STEP);
  const side = timeline.rows[4];
  const main = timeline.rows.slice(0, 4);
  const mainOpen: boolean[] = [];
  const sideOpen: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * STEP;
    mainOpen.push(main.some((row) => openAt(row, t)));
    sideOpen.push(openAt(side, t));
  }
  // The other road was open within the last ALL_RED seconds (the cycle wraps around).
  const k = Math.round(ALL_RED / STEP);
  const recently = (open: boolean[], i: number) => {
    for (let j = 1; j <= k; j++) if (open[(i - j + n * 2) % n]) return true;
    return false;
  };
  const overlap = mainOpen.map((m, i) => m && sideOpen[i]);
  const tight = mainOpen.map((m, i) => !overlap[i] && ((sideOpen[i] && recently(mainOpen, i)) || (m && recently(sideOpen, i))));
  const round = (s: number) => Math.round(s * 100) / 100;
  const overlaps = runs(overlap).map(([from, to]) => ({ kind: 'overlap' as const, from: round(from), to: round(to) }));
  const issues: SafetyIssue[] = [...overlaps];
  for (const [from, to] of runs(tight)) {
    // Tight stretches right before or after an overlap are part of the same conflict.
    const touching = overlaps.find((o) => from <= o.to + STEP / 2 && to >= o.from - STEP / 2);
    if (touching) {
      touching.from = Math.min(touching.from, round(from));
      touching.to = Math.max(touching.to, round(to));
    } else {
      issues.push({ kind: 'tight', from: round(from), to: round(to) });
    }
  }
  return issues.sort((a, b) => a.from - b.from);
}

/** Issues in a set of timings for one plan (all signals), as the simulation would run them. */
export function checkTimings(plan: Plan, timings: SignalTiming[]): SafetyIssue[] {
  const sim = new Simulation();
  sim.setPlanTimings(plan, timings);
  if (plan !== 'normal') sim.setMode(plan);
  const timeline = sim.planTimeline();
  return timeline ? analyzeTimeline(timeline) : [];
}

/**
 * Green times for one signal that keep the junction safe, given how its cycle is split:
 * `total` is open + closed, `timelineFor` draws the cycle for a candidate green time.
 */
export function safeOpenRange(
  total: number,
  timelineFor: (open: number) => Timeline | null,
  maxOpen = 99,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (let open = 1; open <= Math.min(maxOpen, total - 1); open++) {
    const timeline = timelineFor(open);
    if (!timeline || analyzeTimeline(timeline).length > 0) continue;
    min = Math.min(min, open);
    max = Math.max(max, open);
  }
  return max >= min ? { min, max } : null;
}
