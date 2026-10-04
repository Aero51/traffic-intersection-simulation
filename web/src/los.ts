// Level of service for a signalised junction (HCM 6th ed., table 19-1): letter grades A-F
// from the average control delay per road user in seconds. Pure TypeScript, no DOM.

export type Los = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Upper delay limit (s) of each grade; anything above the last is F. */
const LIMITS: [Los, number][] = [
  ['A', 10],
  ['B', 20],
  ['C', 35],
  ['D', 55],
  ['E', 80],
];

export function levelOfService(delay: number): Los {
  for (const [grade, limit] of LIMITS) if (delay <= limit) return grade;
  return 'F';
}
