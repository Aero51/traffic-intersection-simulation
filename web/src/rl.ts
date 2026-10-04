// Training for the 'learned' control strategy: tabular Q-learning, played out in the same
// headless World the comparison uses. Every EPOCH seconds the agent sees a few buckets of
// queue lengths and the green time so far and chooses keep or switch; the reward is minus
// the number of cars standing before the stop lines (so lost time of a switch counts
// against it). Demand is drawn at random each episode so the table works for any slider
// setting. Pure TypeScript, no DOM; run with `npm run train`.

import { ACTIONS, STATES, learnedPolicy, type Action, type Observation, type Policy } from './controller';
import { World } from './world';
import { seeded } from './random';
import { MAX_CARS, TRAFFIC_GROUPS } from './routes';

export interface TrainOptions {
  episodes: number;
  /** Simulated minutes per episode. */
  minutes: number;
  seed: number;
  alpha?: number;
  /** Discount per second. */
  gamma?: number;
  /** Exploration, falling from the first to the second over the episodes. */
  epsilon?: [number, number];
  onEpisode?(episode: number, meanQueue: number): void;
}

const DT = 1 / 20;

export function emptyTable(): number[][] {
  return Array.from({ length: STATES }, () => [0, 0]);
}

/** Run one episode of random demand, updating `q` in place. Returns the mean number of cars queueing. */
function episode(
  q: number[][],
  random: () => number,
  seed: number,
  minutes: number,
  alpha: number,
  gamma: number,
  epsilon: number,
): number {
  const world = new World(seeded(seed), seeded(seed + 1));
  const { traffic, pedestrians, controller } = world;
  for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, 1 + Math.floor(random() * MAX_CARS));
  pedestrians.rate = Math.floor(random() * 13);
  traffic.options = { variety: true, drivers: true, grip: random() < 0.2 ? 0.7 : 1 };
  controller.strategy = 'learned';

  const lanes = TRAFFIC_GROUPS.flatMap((g) => Object.keys(g.lanes));
  let clock = 0;
  let reward = 0;
  let prev: { state: number; action: number; at: number } | null = null;

  const best = (state: number) => Math.max(q[state][0], q[state][1]);
  const explore: Policy = (state: number, observation: Observation): Action => {
    if (prev) {
      // The wait between decisions varies (a switch takes a few seconds), so discount by it.
      const target = reward / 10 + gamma ** (clock - prev.at) * best(state);
      q[prev.state][prev.action] += alpha * (target - q[prev.state][prev.action]);
    }
    const action =
      random() < epsilon
        ? Math.floor(random() * 2)
        : q[state][0] === q[state][1]
          ? ACTIONS.indexOf(learnedPolicy(state, observation))
          : q[state][0] > q[state][1]
            ? 0
            : 1;
    prev = { state, action, at: clock };
    reward = 0;
    return ACTIONS[action];
  };
  controller.policy = explore;

  let queued = 0;
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    clock += DT;
    const now = traffic.queued(lanes);
    reward -= now * DT;
    queued += now;
  }
  return queued / steps;
}

export function train(options: TrainOptions): number[][] {
  const { episodes, minutes, seed, alpha = 0.1, gamma = 0.97, epsilon = [0.3, 0.05] } = options;
  const q = emptyTable();
  const random = seeded(seed);
  for (let e = 0; e < episodes; e++) {
    const eps = epsilon[0] + ((epsilon[1] - epsilon[0]) * e) / Math.max(1, episodes - 1);
    const mean = episode(q, random, seed * 1000 + e * 2, minutes, alpha, gamma, eps);
    options.onEpisode?.(e, mean);
  }
  return q;
}
