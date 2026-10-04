// Runs headless simulations off the main thread: one per message, answered with its result.

import { runBench, type BenchConfig } from './bench';
import type { ControlStrategy } from './controller';

export interface BenchRequest {
  /** Echoed in the answer, so a pool can tell jobs apart. */
  id?: number;
  config: BenchConfig;
  strategy: ControlStrategy;
  /** Skip progress messages (the pool only wants results). */
  quiet?: boolean;
}

self.onmessage = (e: MessageEvent<BenchRequest>) => {
  const { id, config, strategy, quiet } = e.data;
  const result = runBench(config, strategy, quiet ? undefined : (fraction) => self.postMessage({ type: 'progress', id, fraction }));
  self.postMessage({ type: 'done', id, result });
};
