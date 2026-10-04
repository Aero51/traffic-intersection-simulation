// "Dnevni ciklus": a simulated time of day that sets how busy the roads are (morning and
// afternoon rush hours, quiet nights) and how dark it is.

/** Simulated minutes of the day per simulation second: a whole day takes 24 minutes. */
export const DAY_MINUTES_PER_SECOND = 1;
/** Rush hour button: demand multiplier and duration (simulation seconds). */
export const RUSH_FACTOR = 2;
export const RUSH_SECONDS = 60;
/** Car counts may go above the slider maximum in a rush, up to this. */
export const MAX_BOOSTED_CARS = 20;

const bump = (hour: number, centre: number, width: number) => {
  let d = Math.abs(hour - centre);
  d = Math.min(d, 24 - d); // the day wraps around
  return Math.exp(-0.5 * (d / width) ** 2);
};

/** How busy the roads are at this hour, relative to the sliders (about 0.15 at night, up to ~1.6). */
export function demandFactor(hour: number): number {
  return 0.15 + 0.6 * bump(hour, 13, 3.5) + 0.95 * bump(hour, 7.75, 1.2) + 1.05 * bump(hour, 16.75, 1.5);
}

/** 0 in daylight, 1 at night, with an hour and a half of dusk and dawn. */
export function darkness(hour: number): number {
  const dawn = [5.5, 7];
  const dusk = [19, 20.5];
  if (hour >= dawn[1] && hour <= dusk[0]) return 0;
  if (hour < dawn[0] || hour > dusk[1]) return 1;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return hour < 12 ? 1 - smooth((hour - dawn[0]) / (dawn[1] - dawn[0])) : smooth((hour - dusk[0]) / (dusk[1] - dusk[0]));
}

export function formatClock(hour: number): string {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
