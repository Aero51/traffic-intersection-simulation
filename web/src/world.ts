// Everything that moves, stepped together: signals (through the controller), cars,
// pedestrians, ambulance priority and statistics. Used by the page and by the headless
// strategy comparison, so both behave the same. Pure TypeScript, no DOM.

import { Simulation, type SimSnapshot } from './sim';
import { Traffic } from './traffic';
import { Pedestrians } from './pedestrians';
import { Controller } from './controller';
import { Stats } from './stats';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';

export class World {
  readonly sim = new Simulation();
  readonly traffic: Traffic;
  readonly pedestrians: Pedestrians;
  readonly controller = new Controller();
  readonly stats = new Stats(TRAFFIC_GROUPS);

  constructor(random: () => number = Math.random, pedestrianRandom: () => number = random) {
    this.traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS, random);
    this.pedestrians = new Pedestrians(pedestrianRandom);
  }

  step(dt: number): SimSnapshot {
    const { sim, traffic, pedestrians } = this;
    // An ambulance on its way gets green on its road until it is through the junction.
    const ambulance = traffic.emergencyApproaching();
    if (ambulance) sim.preempt(ambulance.route.def.control.signal === 4 ? 'side' : 'main');
    else if (sim.preempted) sim.release();

    this.controller.step(dt, sim, traffic);
    const snap = sim.snapshot();
    traffic.step(dt, snap, pedestrians.walkers);
    const arrived = pedestrians.step(dt, snap, (crossing) => !traffic.crosswalkBusy(crossing));
    for (const crossing of arrived) sim.requestPedestrians(crossing.id === 'side' ? 'side' : 'main');
    this.stats.update(dt, traffic, pedestrians);
    return snap;
  }
}
