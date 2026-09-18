// User-facing display units. INTERNAL storage/geometry is always millimeters
// (see src/types.ts); this module is the display layer — formatting and
// parsing only, it never touches project state semantics. Currency stays USD.

export type DisplayUnit = 'mm' | 'cm' | 'inch';

export const DISPLAY_UNITS: DisplayUnit[] = ['mm', 'cm', 'inch'];

/** Millimeters per display unit. */
const PER_MM: Record<DisplayUnit, number> = { mm: 1, cm: 10, inch: 25.4 };

/** Display suffix, e.g. "mm". */
export const UNIT_LABEL: Record<DisplayUnit, string> = { mm: 'mm', cm: 'cm', inch: '"' };

/** Decimal places shown per unit: mm → whole mm; cm and inch → one decimal. */
const DECIMALS: Record<DisplayUnit, number> = { mm: 0, cm: 1, inch: 1 };

/** Convert internal millimeters to a user-facing number (unformatted). */
export function mmToUnit(mm: number, unit: DisplayUnit): number {
  return mm / PER_MM[unit];
}

/** Convert a user-facing number (active unit) back to internal millimeters. */
export function unitToMm(value: number, unit: DisplayUnit): number {
  return value * PER_MM[unit];
}

/** Format an internal mm value for display in `unit`, with the unit's
 * precision (whole mm / one decimal cm / one decimal inch). */
export function formatLength(mm: number, unit: DisplayUnit): string {
  return (mm / PER_MM[unit]).toFixed(DECIMALS[unit]);
}

/** Parse a user-typed length in `unit` into internal millimeters. Returns 0
 * for non-numeric input (matches previous `parseFloat || 0` behavior in the
 * panels). Accepts an optional trailing unit suffix ('"' / 'mm' / 'cm') and
 * ignores it. */
export function parseLength(input: string, unit: DisplayUnit): number {
  const cleaned = input.trim().replace(/["'a-z ]+$/i, '').trim();
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return 0;
  return n * PER_MM[unit];
}
