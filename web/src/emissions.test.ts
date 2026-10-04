import { describe, expect, it } from 'vitest';
import { co2Kg, fuelUsed } from './emissions';

describe('fuel model', () => {
  it('standing still burns only the idle rate', () => {
    expect(fuelUsed('sedan', 0, 0, 60)).toBeCloseTo(0.00022 * 60, 6);
  });

  it('accelerating costs more than cruising, and braking is no cheaper than cruising', () => {
    const cruise = fuelUsed('sedan', 10, 0, 1);
    expect(fuelUsed('sedan', 10, 2, 1)).toBeGreaterThan(cruise * 2);
    expect(fuelUsed('sedan', 10, -3, 1)).toBeCloseTo(cruise, 10);
  });

  it('standing 25 s and pulling away costs more than driving the same 35 s at a steady speed', () => {
    const stop = fuelUsed('sedan', 0, 0, 25) + fuelUsed('sedan', 5, 1, 10);
    expect(stop).toBeGreaterThan(fuelUsed('sedan', 10, 0, 35));
  });

  it('buses burn more than cars, diesel emits more CO2 per litre, bicycles nothing', () => {
    expect(fuelUsed('bus', 10, 0, 1)).toBeGreaterThan(5 * fuelUsed('sedan', 10, 0, 1));
    expect(co2Kg('bus', 1)).toBeGreaterThan(co2Kg('sedan', 1));
    expect(fuelUsed('bike', 5, 1, 10)).toBe(0);
    expect(co2Kg('bike', 5)).toBe(0);
  });

  it('a sedan at 50 km/h uses a plausible 4-9 litres per 100 km', () => {
    const v = 50 / 3.6;
    const perKm = fuelUsed('sedan', v, 0, 1000 / v); // 1 km takes 72 s
    const per100km = perKm * 100;
    expect(per100km).toBeGreaterThan(3);
    expect(per100km).toBeLessThan(9);
  });
});
