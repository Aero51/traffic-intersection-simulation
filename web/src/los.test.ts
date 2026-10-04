import { describe, expect, it } from 'vitest';
import { levelOfService } from './los';

describe('levelOfService', () => {
  it('grades by HCM delay limits, upper bound inclusive', () => {
    expect(levelOfService(0)).toBe('A');
    expect(levelOfService(10)).toBe('A');
    expect(levelOfService(10.1)).toBe('B');
    expect(levelOfService(35)).toBe('C');
    expect(levelOfService(55)).toBe('D');
    expect(levelOfService(80)).toBe('E');
    expect(levelOfService(80.1)).toBe('F');
    expect(levelOfService(500)).toBe('F');
  });
});
