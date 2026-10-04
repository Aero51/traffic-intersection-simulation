import { describe, expect, it } from 'vitest';
import { PRESETS, parseScenario, presetSettings, scenarioToJson } from './scenarios';
import { DEFAULT_SETTINGS } from './settings';
import { MAX_CARS, TRAFFIC_GROUPS } from './routes';
import { PLAN_TIMINGS } from './sim';

describe('presets', () => {
  it('only use known sliders and values in range', () => {
    for (const p of PRESETS) {
      const s = presetSettings(p);
      expect(Object.keys(s.cars).sort()).toEqual(TRAFFIC_GROUPS.map((g) => g.id).sort());
      for (const n of Object.values(s.cars)) expect(n).toBeLessThanOrEqual(MAX_CARS);
    }
  });
});

describe('scenario files', () => {
  it('round-trips settings and timings', () => {
    const settings = { ...DEFAULT_SETTINGS, control: 'queue' as const, night: true, cars: { ...DEFAULT_SETTINGS.cars, istok: 3 } };
    const timings = {
      normal: [
        { open: 12, closed: 9 },
        { open: 12, closed: 9 },
        { open: 12, closed: 9 },
        { open: 12, closed: 9 },
        { open: 4, closed: 17 },
      ],
      secondary: PLAN_TIMINGS.secondary,
    };
    const back = parseScenario(scenarioToJson(settings, timings));
    expect(back.settings.control).toBe('queue');
    expect(back.settings.night).toBe(true);
    expect(back.settings.cars.istok).toBe(3);
    expect(back.timings.secondary).toEqual(PLAN_TIMINGS.secondary);
  });

  it('rejects files that are not scenarios', () => {
    expect(() => parseScenario('nope')).toThrow();
    expect(() => parseScenario('{"kind":"other"}')).toThrow();
  });

  it('falls back to defaults for bad values and drops unsafe timings', () => {
    const file = JSON.stringify({
      kind: 'raskrsce-scenario',
      settings: { mode: 'bogus', control: 'x', cars: { istok: 999, sjever: 2 }, pedestrians: -1, night: 'yes' },
      // both roads open at once
      timings: {
        normal: [
          { open: 20, closed: 1 },
          { open: 20, closed: 1 },
          { open: 20, closed: 1 },
          { open: 20, closed: 1 },
          { open: 20, closed: 1 },
        ],
      },
    });
    const { settings, timings } = parseScenario(file);
    expect(settings.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(settings.control).toBe(DEFAULT_SETTINGS.control);
    expect(settings.cars.istok).toBe(DEFAULT_SETTINGS.cars.istok);
    expect(settings.cars.sjever).toBe(2);
    expect(settings.pedestrians).toBe(DEFAULT_SETTINGS.pedestrians);
    expect(settings.night).toBe(DEFAULT_SETTINGS.night);
    expect(timings.normal).toBeUndefined();
  });
});
