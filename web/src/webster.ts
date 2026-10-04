// Webster's formula, the textbook starting point for fixed-time signals: the cycle that
// minimises delay is C0 = (1.5 L + 5) / (1 - Y), where L is the lost time per cycle and Y the
// sum of the critical flow ratios (flow / saturation flow) of the phases. The greens are
// shared in proportion to those ratios. Used as a reference row next to the simulated search.
// Pure TypeScript, no DOM.

/** Cars per minute one lane can discharge from a standing queue (about 1.5 s per car). */
export const SATURATION = 40;
/** Lanes that move together on the main road in one direction; the side road has one. */
const MAIN_LANES = 2;
/** Beyond this flow ratio the formula blows up; the junction is over capacity anyway. */
const MAX_Y = 0.9;
export const MIN_CYCLE = 17;
export const MAX_CYCLE = 60;

export interface Split {
  cycle: number;
  main: number;
  side: number;
}

/**
 * @param critical cars/min on the busiest main-road direction and on the side road
 * @param lostPerRoad seconds each road loses per cycle to yellow, red+yellow and all-red
 * @param minGreen shortest green of either road
 */
export function websterSplit(critical: { main: number; side: number }, lostPerRoad: number, minGreen: number): Split {
  const yMain = critical.main / (MAIN_LANES * SATURATION);
  const ySide = critical.side / SATURATION;
  const Y = Math.min(yMain + ySide, MAX_Y);
  const lost = 2 * lostPerRoad;
  const cycle = Math.round(Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, (1.5 * lost + 5) / (1 - Y))));
  const total = cycle - lost;
  const share = yMain + ySide > 0 ? yMain / (yMain + ySide) : 0.5;
  const main = Math.round(Math.min(total - minGreen, Math.max(minGreen, total * share)));
  return { cycle, main, side: total - main };
}
