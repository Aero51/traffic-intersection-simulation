// Page settings in one place: the menu, toolbar, keyboard shortcuts and the shareable URL
// all read and change them here, and main.ts applies them to the simulation.

import type { Mode, Plan, SignalTiming } from './sim';
import { PLAN_TIMINGS } from './sim';
import type { ControlStrategy } from './controller';
import { CONTROL_STRATEGIES } from './controller';
import { MAX_CARS, TRAFFIC_GROUPS } from './routes';

export type Weather = 'dry' | 'rain';
export const SPEEDS = [0.5, 1, 2, 4];
export const MAX_PEDESTRIAN_RATE = 30;

export interface Settings {
  mode: Mode;
  control: ControlStrategy;
  /** Slider value per traffic group. */
  cars: Record<string, number>;
  /** Pedestrians arriving per minute. */
  pedestrians: number;
  variety: boolean;
  drivers: boolean;
  dayCycle: boolean;
  night: boolean;
  weather: Weather;
  sound: boolean;
  debug: boolean;
  stats: boolean;
  speed: number;
  paused: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'normal',
  control: 'fixed',
  cars: Object.fromEntries(TRAFFIC_GROUPS.map((g) => [g.id, g.initial])),
  pedestrians: 0,
  variety: true,
  drivers: true,
  dayCycle: false,
  night: false,
  weather: 'dry',
  sound: false,
  debug: false,
  stats: false,
  speed: 1,
  paused: false,
};

type Listener = (s: Settings, changed: Set<keyof Settings>) => void;

export class Store {
  private state: Settings;
  private listeners = new Set<Listener>();

  constructor(initial: Settings) {
    this.state = { ...initial, cars: { ...initial.cars } };
  }

  get(): Settings {
    return this.state;
  }

  set(patch: Partial<Settings>): void {
    const changed = new Set<keyof Settings>();
    for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
      const old = this.state[k];
      const same = k === 'cars' ? JSON.stringify(old) === JSON.stringify(v) : old === v;
      if (!same) changed.add(k);
    }
    if (changed.size === 0) return;
    this.state = { ...this.state, ...patch, cars: { ...(patch.cars ?? this.state.cars) } };
    for (const l of this.listeners) l(this.state, changed);
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }
}

// ---------------------------------------------------------------- shareable URL
//
// ?mode=secondary&ctl=actuated&cars=8,4,8&ped=6&t=10-10,10-10,10-10,10-10,4-13
//  &day=1&night=1&rain=1&var=0&drv=0&lang=en   (lang is read by i18n.ts)
// Only values that differ from the defaults are written.

const MODES: Mode[] = ['normal', 'secondary', 'flashing'];

const encodeTimings = (t: SignalTiming[]) => t.map((x) => `${x.open}-${x.closed}`).join(',');

function decodeTimings(value: string | null): SignalTiming[] | null {
  if (!value) return null;
  const parts = value.split(',').map((p) => p.split('-').map(Number));
  if (parts.length !== 5 || parts.some((p) => p.length !== 2 || p.some((n) => !Number.isInteger(n) || n < 1 || n > 99))) return null;
  return parts.map(([open, closed]) => ({ open, closed }));
}

export interface UrlState {
  settings: Settings;
  /** Timings of the plan named by `mode` (or normal), if given. */
  timings: { plan: Plan; timings: SignalTiming[] } | null;
}

export function readUrl(search: string = location.search): UrlState {
  const q = new URLSearchParams(search);
  const s: Settings = { ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars } };
  const mode = q.get('mode') as Mode | null;
  if (mode && MODES.includes(mode)) s.mode = mode;
  const ctl = q.get('ctl') as ControlStrategy | null;
  if (ctl && CONTROL_STRATEGIES.includes(ctl)) s.control = ctl;
  const cars = q.get('cars')?.split(',').map(Number);
  if (cars && cars.length === TRAFFIC_GROUPS.length && cars.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_CARS)) {
    TRAFFIC_GROUPS.forEach((g, i) => (s.cars[g.id] = cars[i]));
  }
  const ped = Number(q.get('ped'));
  if (Number.isInteger(ped) && ped >= 0 && ped <= MAX_PEDESTRIAN_RATE) s.pedestrians = ped;
  const flag = (key: string, fallback: boolean) => (q.has(key) ? q.get(key) === '1' : fallback);
  s.dayCycle = flag('day', s.dayCycle);
  s.night = flag('night', s.night);
  s.variety = flag('var', s.variety);
  s.drivers = flag('drv', s.drivers);
  if (q.get('rain') === '1') s.weather = 'rain';
  const timings = decodeTimings(q.get('t'));
  const plan: Plan = s.mode === 'secondary' ? 'secondary' : 'normal';
  return { settings: s, timings: timings && { plan, timings } };
}

export function writeUrl(s: Settings, timings: SignalTiming[], plan: Plan, lang: string): string {
  const q = new URLSearchParams(location.search);
  const d = DEFAULT_SETTINGS;
  const put = (key: string, value: string | null) => (value === null ? q.delete(key) : q.set(key, value));
  put('mode', s.mode !== d.mode ? s.mode : null);
  put('ctl', s.control !== d.control ? s.control : null);
  const cars = TRAFFIC_GROUPS.map((g) => s.cars[g.id]);
  put('cars', TRAFFIC_GROUPS.some((g) => s.cars[g.id] !== d.cars[g.id]) ? cars.join(',') : null);
  put('ped', s.pedestrians !== d.pedestrians ? String(s.pedestrians) : null);
  put('t', encodeTimings(timings) !== encodeTimings(PLAN_TIMINGS[plan]) ? encodeTimings(timings) : null);
  put('day', s.dayCycle !== d.dayCycle ? (s.dayCycle ? '1' : '0') : null);
  put('night', s.night !== d.night ? (s.night ? '1' : '0') : null);
  put('rain', s.weather === 'rain' ? '1' : null);
  put('var', s.variety !== d.variety ? (s.variety ? '1' : '0') : null);
  put('drv', s.drivers !== d.drivers ? (s.drivers ? '1' : '0') : null);
  put('lang', lang !== 'hr' ? lang : null); // Croatian is the default
  const query = q.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}
