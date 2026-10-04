// Fuel and CO2 estimate from how the cars drive: an idle burn while the engine runs, plus
// the energy to speed up and to overcome drag and rolling resistance. A rough physical model
// (not a certified emission factor) good enough to compare ways of running the signals:
// every stop-and-go costs fuel. Pure TypeScript, no DOM.

import type { Car, VehicleKind } from './traffic';

/** Metres per pixel on the photo: a 4.5 m car is about 42 px long. */
export const METRES_PER_PX = 4.5 / 42;

interface Profile {
  /** Kerb mass, kg. */
  mass: number;
  /** Drag area (drag coefficient x frontal area), m^2. */
  cdA: number;
  /** Fuel burnt standing with the engine running, litres per second. */
  idle: number;
  diesel: boolean;
}

const PROFILES: Record<Exclude<VehicleKind, 'bike'>, Profile> = {
  sedan: { mass: 1300, cdA: 0.7, idle: 0.00022, diesel: false },
  hatch: { mass: 1100, cdA: 0.65, idle: 0.0002, diesel: false },
  van: { mass: 2000, cdA: 1.2, idle: 0.0003, diesel: true },
  bus: { mass: 12000, cdA: 6, idle: 0.0007, diesel: true },
  truck: { mass: 15000, cdA: 7, idle: 0.0006, diesel: true },
  moto: { mass: 220, cdA: 0.5, idle: 0.00008, diesel: false },
  ambulance: { mass: 3000, cdA: 1.5, idle: 0.0003, diesel: true },
};

/** Share of the fuel's energy that reaches the wheels. */
const EFFICIENCY = 0.25;
const ROLLING = 0.012 * 9.81; // rolling resistance coefficient x g
const AIR = 1.2; // kg/m^3
const FUEL = { petrol: { mj: 34.2, co2: 2.31 }, diesel: { mj: 38.6, co2: 2.68 } }; // MJ and kg CO2 per litre

/** Litres burnt by one vehicle in `dt` seconds at speed `v` (m/s) and acceleration `a` (m/s^2). */
export function fuelUsed(kind: VehicleKind, v: number, a: number, dt: number): number {
  if (kind === 'bike') return 0;
  const p = PROFILES[kind];
  const fuel = p.diesel ? FUEL.diesel : FUEL.petrol;
  // Power at the wheels: speeding up (braking recovers nothing), drag and rolling.
  const power = Math.max(0, p.mass * a * v) + 0.5 * AIR * p.cdA * v ** 3 + p.mass * ROLLING * v;
  return p.idle * dt + (power * dt) / (EFFICIENCY * fuel.mj * 1e6);
}

export const co2Kg = (kind: VehicleKind, litres: number): number =>
  kind === 'bike' ? 0 : litres * (PROFILES[kind].diesel ? FUEL.diesel.co2 : FUEL.petrol.co2);

export class EmissionsMeter {
  litres = 0;
  co2 = 0;
  /** Litres burnt while standing (below walking pace): the part signal timing can save. */
  idleLitres = 0;
  private lastSpeed = new Map<number, number>();

  update(dt: number, cars: readonly Car[]): void {
    if (dt <= 0) return;
    const seen = new Map<number, number>();
    for (const car of cars) {
      const v = car.v * METRES_PER_PX;
      const before = this.lastSpeed.get(car.id) ?? v;
      const used = fuelUsed(car.kind, v, (v - before) / dt, dt);
      this.litres += used;
      this.co2 += co2Kg(car.kind, used);
      if (v < 0.5 && car.kind !== 'bike') this.idleLitres += used;
      seen.set(car.id, v);
    }
    this.lastSpeed = seen;
  }

  reset(): void {
    this.litres = this.co2 = this.idleLitres = 0;
    this.lastSpeed.clear();
  }
}
