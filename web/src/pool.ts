// A small pool of bench workers, one simulation per worker at a time, so a search with
// a hundred runs uses every core without freezing the page.

import type { BenchConfig, BenchResult } from './bench';
import type { ControlStrategy } from './controller';
import type { BenchRequest } from './bench.worker';

interface Job {
  id: number;
  config: BenchConfig;
  strategy: ControlStrategy;
  resolve(result: BenchResult): void;
  reject(error: unknown): void;
}

export const cancelled = () => new DOMException('Search cancelled', 'AbortError');

export class BenchPool {
  private idle: Worker[] = [];
  private busy = new Map<Worker, Job>();
  private queue: Job[] = [];
  private created = 0;
  private nextId = 1;
  private closed = false;

  /** Leave one core for the page itself. */
  constructor(private size = Math.min(8, Math.max(2, (navigator.hardwareConcurrency ?? 4) - 1))) {}

  run(config: BenchConfig, strategy: ControlStrategy): Promise<BenchResult> {
    if (this.closed) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, config, strategy, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.queue.length) {
      let worker = this.idle.pop();
      if (!worker && this.created < this.size) worker = this.spawn();
      if (!worker) return;
      const job = this.queue.shift()!;
      this.busy.set(worker, job);
      worker.postMessage({ id: job.id, config: job.config, strategy: job.strategy, quiet: true } satisfies BenchRequest);
    }
  }

  private spawn(): Worker {
    this.created++;
    const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ type: 'progress' } | { type: 'done'; id: number; result: BenchResult }>) => {
      if (e.data.type !== 'done') return;
      const job = this.busy.get(worker);
      this.busy.delete(worker);
      if (!this.closed) this.idle.push(worker);
      job?.resolve(e.data.result);
      this.pump();
    };
    worker.onerror = (e) => {
      const job = this.busy.get(worker);
      this.busy.delete(worker);
      job?.reject(new Error(e.message || 'Worker failed'));
      this.close(new Error(e.message || 'Worker failed'));
    };
    return worker;
  }

  /** Stop everything; jobs still waiting or running are rejected. */
  close(reason: unknown = cancelled()): void {
    if (this.closed) return;
    this.closed = true;
    for (const job of this.queue) job.reject(reason);
    for (const job of this.busy.values()) job.reject(reason);
    this.queue = [];
    for (const worker of [...this.idle, ...this.busy.keys()]) worker.terminate();
    this.idle = [];
    this.busy.clear();
  }
}
