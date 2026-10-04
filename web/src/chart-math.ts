// Axis maths for the charts (pure, so it can be tested without a page).

/** A rounded-up maximum and step so the y axis ends on clean numbers (0 / 10 / 20 ...). */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Tick positions (seconds) on clean intervals, at most `maxTicks` of them. */
export function timeTicks(maxSeconds: number, maxTicks = 6): number[] {
  const steps = [15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  const step = steps.find((s) => Math.floor(maxSeconds / s) + 1 <= maxTicks) ?? steps[steps.length - 1];
  const out: number[] = [];
  for (let at = 0; at <= maxSeconds + 1e-9; at += step) out.push(at);
  return out;
}
