// CSV export of the statistics (for a report or a spreadsheet). Plain comma-separated values
// with a dot as the decimal mark; a byte-order mark at the start makes Excel read the
// Croatian letters correctly.

import { levelOfService } from './los';
import type { Stats } from './stats';
import type { BenchResult } from './bench';

export type Cell = string | number | null;

function quote(cell: Cell): string {
  if (cell === null) return '';
  const text = typeof cell === 'number' ? String(Math.round(cell * 1000) / 1000) : cell;
  // A leading = + - @ would be run as a formula by a spreadsheet; labels never start that way.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

/** The whole-run chart data: one row per sample. */
export function seriesCsv(stats: Stats): string {
  return toCsv([
    ['time_s', 'cars_per_min', 'queue_cars', 'avg_car_wait_s', 'avg_pedestrian_wait_s'],
    ...stats.series.map((s) => [s.t, s.flow, s.queue, s.wait, s.pedWait]),
  ]);
}

/** Per-approach totals for the run so far. */
export function summaryCsv(stats: Stats): string {
  const rows: Cell[][] = [['approach', 'cars_passed', 'cars_per_min', 'avg_wait_s', 'longest_wait_s', 'queue_now', 'longest_queue']];
  for (const a of stats.approaches) {
    rows.push([a.id, a.passed, stats.throughput(a), stats.avgWait(a), a.maxWait, a.queue, a.maxQueue]);
  }
  const total = stats.summary();
  rows.push(['total', total.passed, total.throughput, total.avgWait, total.maxWait, '', stats.maxTotalQueue]);
  rows.push(['pedestrians', stats.pedCount, '', stats.pedCount ? stats.pedTotalWait / stats.pedCount : '', stats.pedMaxWait, '', '']);
  rows.push(['duration_s', Math.round(stats.time), '', '', '', '', '']);
  return toCsv(rows);
}

/** Results of the control comparison or the timing search. */
export function benchCsv(results: BenchResult[]): string {
  return toCsv([
    ['strategy', 'avg_wait_s', 'longest_wait_s', 'cars_per_min', 'longest_queue', 'avg_pedestrian_wait_s', 'avg_delay_per_user_s', 'level_of_service'],
    ...results.map((r) => [r.strategy, r.avgWait, r.maxWait, r.throughput, r.maxQueue, r.pedAvgWait, r.delay, levelOfService(r.delay)]),
  ]);
}

/** Offer text as a file download (call from a click handler). */
export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob(['﻿', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
