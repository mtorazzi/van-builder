import { describe, expect, it } from 'vitest';
import { formatLength, parseLength, mmToUnit, unitToMm } from './lib/units';

describe('formatLength', () => {
  it('mm shows whole millimeters', () => {
    expect(formatLength(1920, 'mm')).toBe('1920');
    expect(formatLength(254.6, 'mm')).toBe('255');
  });
  it('cm shows one decimal', () => {
    expect(formatLength(1920, 'cm')).toBe('192.0');
    expect(formatLength(406.4, 'cm')).toBe('40.6');
  });
  it('inch shows one decimal', () => {
    expect(formatLength(25.4, 'inch')).toBe('1.0');
    expect(formatLength(1602, 'inch')).toBe('63.1');
  });
});

describe('parseLength', () => {
  it('parses in the active unit back to mm', () => {
    expect(parseLength('192', 'cm')).toBe(1920);
    expect(parseLength('10', 'inch')).toBeCloseTo(254);
    expect(parseLength('500', 'mm')).toBe(500);
  });
  it('returns 0 for garbage, like the previous parseFloat || 0 behavior', () => {
    expect(parseLength('', 'cm')).toBe(0);
    expect(parseLength('abc', 'mm')).toBe(0);
  });
  it('tolerates a trailing unit suffix', () => {
    expect(parseLength('38 mm', 'cm')).toBe(380);
    expect(parseLength('1.5"', 'inch')).toBeCloseTo(38.1);
  });
});

describe('round trip', () => {
  it('mmToUnit/unitToMm are mutual inverses', () => {
    for (const unit of ['mm', 'cm', 'inch'] as const) {
      expect(unitToMm(mmToUnit(3600, unit), unit)).toBeCloseTo(3600);
    }
  });
});
