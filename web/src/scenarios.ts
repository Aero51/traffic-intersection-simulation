// Ready-made traffic scenarios and a JSON file format for saving and loading a set-up.
// Pure TypeScript, no DOM; main.ts applies the result to the store and the simulation.

import { DEFAULT_SETTINGS, MAX_PEDESTRIAN_RATE, type Settings } from './settings';
import { CONTROL_STRATEGIES } from './controller';
import { MAX_CARS, TRAFFIC_GROUPS } from './routes';
import { checkTimings } from './safety';
import type { Mode, Plan, SignalTiming } from './sim';

export type ScenarioSettings = Pick<
  Settings,
  'mode' | 'control' | 'cars' | 'pedestrians' | 'variety' | 'drivers' | 'dayCycle' | 'night' | 'weather'
>;

export interface Preset {
  id: string;
  /** Traffic only: signal timings are left as they are, so presets can be compared on one plan. */
  settings: Partial<ScenarioSettings>;
}

const cars = (istok: number, sjever: number, zapad: number) => ({ istok, sjever, zapad });

export const PRESETS: Preset[] = [
  { id: 'quiet', settings: { cars: cars(3, 1, 3), pedestrians: 2, night: true, dayCycle: false, weather: 'dry' } },
  { id: 'rush', settings: { cars: cars(14, 6, 14), pedestrians: 10, night: false, weather: 'dry', control: 'queue' } },
  { id: 'event', settings: { cars: cars(4, 15, 4), pedestrians: 25, night: false, weather: 'dry', control: 'queue' } },
  { id: 'rain', settings: { cars: cars(11, 5, 11), pedestrians: 6, night: false, weather: 'rain' } },
  { id: 'school', settings: { cars: cars(6, 4, 6), pedestrians: 30, variety: false, night: false, weather: 'dry' } },
];

export const presetSettings = (preset: Preset): ScenarioSettings => ({
  ...scenarioSettings(DEFAULT_SETTINGS),
  ...preset.settings,
  cars: { ...DEFAULT_SETTINGS.cars, ...preset.settings.cars },
});

export function scenarioSettings(s: Settings): ScenarioSettings {
  const { mode, control, cars, pedestrians, variety, drivers, dayCycle, night, weather } = s;
  return { mode, control, cars: { ...cars }, pedestrians, variety, drivers, dayCycle, night, weather };
}

// ---------------------------------------------------------------- file format

export const FILE_KIND = 'raskrsce-scenario';
export const FILE_VERSION = 1;

export interface Scenario {
  settings: ScenarioSettings;
  /** Timings per plan, only those present (and safe) in the file. */
  timings: Partial<Record<Plan, SignalTiming[]>>;
}

export function scenarioToJson(settings: Settings, timings: Record<Plan, SignalTiming[]>): string {
  return JSON.stringify({ kind: FILE_KIND, version: FILE_VERSION, settings: scenarioSettings(settings), timings }, null, 2);
}

const MODES: Mode[] = ['normal', 'secondary', 'flashing'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/** Read a scenario file; anything missing or out of range falls back to the default. Throws on a file that is not a scenario. */
export function parseScenario(text: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('not JSON');
  }
  if (!isObject(data) || data.kind !== FILE_KIND) throw new Error('not a scenario file');

  const base = scenarioSettings(DEFAULT_SETTINGS);
  const src = isObject(data.settings) ? data.settings : {};
  if (MODES.includes(src.mode as Mode)) base.mode = src.mode as Mode;
  if (CONTROL_STRATEGIES.includes(src.control as never)) base.control = src.control as Settings['control'];
  if (isObject(src.cars)) {
    for (const g of TRAFFIC_GROUPS) if (isCount(src.cars[g.id], MAX_CARS)) base.cars[g.id] = src.cars[g.id] as number;
  }
  if (isCount(src.pedestrians, MAX_PEDESTRIAN_RATE)) base.pedestrians = src.pedestrians;
  for (const key of ['variety', 'drivers', 'dayCycle', 'night'] as const)
    if (typeof src[key] === 'boolean') base[key] = src[key] as boolean;
  if (src.weather === 'dry' || src.weather === 'rain') base.weather = src.weather;

  const timings: Scenario['timings'] = {};
  if (isObject(data.timings)) {
    for (const plan of ['normal', 'secondary'] as const) {
      const list = data.timings[plan];
      if (!Array.isArray(list) || list.length !== 5) continue;
      const ok = list.every(
        (x) =>
          isObject(x) &&
          Number.isInteger(x.open) &&
          Number.isInteger(x.closed) &&
          (x.open as number) >= 1 &&
          (x.closed as number) >= 1 &&
          (x.open as number) <= 99 &&
          (x.closed as number) <= 99,
      );
      if (!ok) continue;
      const parsed = list.map((x) => ({ open: x.open as number, closed: x.closed as number }));
      if (checkTimings(plan, parsed).length === 0) timings[plan] = parsed;
    }
  }
  return { settings: base, timings };
}
