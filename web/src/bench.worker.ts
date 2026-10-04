// Runs one strategy of the comparison off the main thread.

import { runBench, type BenchConfig } from './bench';
import type { ControlStrategy } from './controller';

export interface BenchRequest {
  config: BenchConfig;
  strategy: ControlStrategy;
}

self.onmessage = (e: MessageEvent<BenchRequest>) => {
  const { config, strategy } = e.data;
  const result = runBench(config, strategy, (fraction) => self.postMessage({ type: 'progress', fraction }));
  self.postMessage({ type: 'done', result });
};
