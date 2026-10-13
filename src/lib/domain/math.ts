/** Aggregate of a metric across matches, ignoring missing (null) values. */
export interface MetricAggregate {
  total: number;
  average: number | null;
  /** Number of matches that actually reported the value. */
  samples: number;
}

export function aggregate(values: ReadonlyArray<number | null | undefined>): MetricAggregate {
  let total = 0;
  let samples = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    total += v;
    samples += 1;
  }
  return { total, average: samples > 0 ? total / samples : null, samples };
}

/** Percentage with safe division: null when the denominator is zero. */
export function percent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

/**
 * Ratio of two summed metrics, using only matches where both values exist so
 * a missing value never counts as zero.
 */
export function pairedPercent(
  rows: ReadonlyArray<{ part: number | null; whole: number | null }>,
): number | null {
  let part = 0;
  let whole = 0;
  for (const row of rows) {
    if (row.part === null || row.whole === null) continue;
    part += row.part;
    whole += row.whole;
  }
  return percent(part, whole);
}

export function round(value: number | null, digits = 1): number | null {
  if (value === null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}
