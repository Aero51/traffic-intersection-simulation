// Measurements for the statistics panel and the strategy comparison: cars through each
// approach per minute, how long they stood at the stop line, queue lengths, and how long
// pedestrians waited at the kerb. Pure TypeScript, no DOM.

import type { TrafficGroup, Traffic } from './traffic';
import type { Pedestrians } from './pedestrians';

/** Throughput is counted over this many recent seconds. */
const WINDOW = 60;
/** One queue-length sample per this many seconds, for the sparklines. */
const SAMPLE_EVERY = 1;
export const HISTORY = 120;
/** One point of the whole-run charts per this many seconds, and how many are kept. */
export const SERIES_EVERY = 5;
const SERIES_MAX = 2000;

export interface ApproachStats {
  id: string;
  lanes: string[];
  passed: number;
  totalWait: number;
  maxWait: number;
  queue: number;
  maxQueue: number;
  /** Queue length, one sample per second, oldest first. */
  history: number[];
  /** Times (stats clock) of recent stop-line crossings. */
  recent: number[];
}

/** One point of the whole-run charts: figures for the last minute, taken every SERIES_EVERY s. */
export interface Sample {
  /** Seconds since the statistics started. */
  t: number;
  /** Cars per minute through the junction. */
  flow: number;
  /** Cars standing before the stop line right now. */
  queue: number;
  /** Average wait of cars that crossed the stop line in the last minute (null if none did). */
  wait: number | null;
  /** Average kerb wait of pedestrians who set off in the last minute (null if none did). */
  pedWait: number | null;
}

export interface StatsSummary {
  /** Cars per minute through the junction (all approaches). */
  throughput: number;
  avgWait: number;
  maxWait: number;
  maxQueue: number;
  pedAvgWait: number;
  pedMaxWait: number;
  passed: number;
  /** Average wait of buses at the stop line (0 if none came through). */
  busAvgWait: number;
}

export class Stats {
  approaches: ApproachStats[];
  time = 0;
  pedCount = 0;
  pedTotalWait = 0;
  pedMaxWait = 0;
  busCount = 0;
  busTotalWait = 0;
  /** Most cars queueing on all approaches at once. */
  maxTotalQueue = 0;
  /** The whole run, for the charts and the CSV export. */
  series: Sample[] = [];
  private sampleTimer = 0;
  private seriesTimer = 0;
  private recentWaits: { t: number; w: number }[] = [];
  private recentPeds: { t: number; w: number }[] = [];

  constructor(groups: readonly TrafficGroup[]) {
    this.approaches = groups.map((g) => ({
      id: g.id,
      lanes: Object.keys(g.lanes),
      passed: 0,
      totalWait: 0,
      maxWait: 0,
      queue: 0,
      maxQueue: 0,
      history: [],
      recent: [],
    }));
  }

  reset(): void {
    this.time = 0;
    this.pedCount = this.pedTotalWait = this.pedMaxWait = this.maxTotalQueue = this.busCount = this.busTotalWait = 0;
    this.sampleTimer = this.seriesTimer = 0;
    this.series = [];
    this.recentWaits = [];
    this.recentPeds = [];
    for (const a of this.approaches) {
      a.passed = a.totalWait = a.maxWait = a.queue = a.maxQueue = 0;
      a.history = [];
      a.recent = [];
    }
  }

  update(dt: number, traffic: Traffic, pedestrians: Pedestrians): void {
    this.time += dt;
    for (const e of traffic.drainEvents()) {
      const a = this.approaches.find((x) => x.id === e.group);
      if (!a || e.emergency) continue;
      a.passed++;
      if (e.kind === 'bus') {
        this.busCount++;
        this.busTotalWait += e.wait;
      }
      a.totalWait += e.wait;
      a.maxWait = Math.max(a.maxWait, e.wait);
      a.recent.push(this.time);
      this.recentWaits.push({ t: this.time, w: e.wait });
    }
    for (const w of pedestrians.drainWaits()) {
      this.pedCount++;
      this.pedTotalWait += w;
      this.pedMaxWait = Math.max(this.pedMaxWait, w);
      this.recentPeds.push({ t: this.time, w });
    }
    for (const a of this.approaches) {
      a.queue = traffic.queued(a.lanes);
      a.maxQueue = Math.max(a.maxQueue, a.queue);
      while (a.recent.length && a.recent[0] < this.time - WINDOW) a.recent.shift();
    }
    this.maxTotalQueue = Math.max(this.maxTotalQueue, this.approaches.reduce((n, a) => n + a.queue, 0));
    this.seriesTimer += dt;
    if (this.seriesTimer >= SERIES_EVERY) {
      this.seriesTimer -= SERIES_EVERY;
      this.takeSample();
    }
    this.sampleTimer += dt;
    if (this.sampleTimer >= SAMPLE_EVERY) {
      this.sampleTimer -= SAMPLE_EVERY;
      for (const a of this.approaches) {
        a.history.push(a.queue);
        if (a.history.length > HISTORY) a.history.shift();
      }
    }
  }

  private takeSample(): void {
    const from = this.time - WINDOW;
    const recent = <T extends { t: number }>(list: T[]) => {
      while (list.length && list[0].t < from) list.shift();
      return list;
    };
    const mean = (list: { w: number }[]) => (list.length ? list.reduce((n, x) => n + x.w, 0) / list.length : null);
    const waits = recent(this.recentWaits);
    const peds = recent(this.recentPeds);
    this.series.push({
      t: Math.round(this.time * 100) / 100,
      flow: (waits.length * 60) / Math.max(1, Math.min(WINDOW, this.time)),
      queue: this.approaches.reduce((n, a) => n + a.queue, 0),
      wait: mean(waits),
      pedWait: mean(peds),
    });
    if (this.series.length > SERIES_MAX) this.series.shift();
  }

  /**
   * Average delay per road user over the whole run, counting cars and pedestrians that are
   * still waiting when it ends (otherwise a jammed road would look good: nobody got through).
   */
  delay(traffic: Traffic, pedestrians: Pedestrians): { delay: number; users: number } {
    let total = this.pedTotalWait;
    let users = this.pedCount;
    for (const a of this.approaches) {
      total += a.totalWait;
      users += a.passed;
    }
    for (const car of traffic.cars) {
      if (car.emergency || car.passedLine) continue;
      total += car.wait;
      users++;
    }
    for (const w of pedestrians.walkers) {
      if (w.walking) continue;
      total += w.waited;
      users++;
    }
    return { delay: users ? total / users : 0, users };
  }

  /** Cars per minute over the last minute (or since the start, if shorter). */
  throughput(a: ApproachStats): number {
    return (a.recent.length * 60) / Math.max(1, Math.min(WINDOW, this.time));
  }

  avgWait(a: ApproachStats): number {
    return a.passed ? a.totalWait / a.passed : 0;
  }

  /** Totals over the whole run, for the comparison table. */
  summary(): StatsSummary {
    const passed = this.approaches.reduce((n, a) => n + a.passed, 0);
    const totalWait = this.approaches.reduce((n, a) => n + a.totalWait, 0);
    return {
      throughput: (passed * 60) / Math.max(1, this.time),
      avgWait: passed ? totalWait / passed : 0,
      maxWait: Math.max(0, ...this.approaches.map((a) => a.maxWait)),
      maxQueue: Math.max(0, ...this.approaches.map((a) => a.maxQueue)),
      pedAvgWait: this.pedCount ? this.pedTotalWait / this.pedCount : 0,
      pedMaxWait: this.pedMaxWait,
      passed,
      busAvgWait: this.busCount ? this.busTotalWait / this.busCount : 0,
    };
  }
}
