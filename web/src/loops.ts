// Induction loops drawn in front of each stop line while "Automatski režim" is on.
// A loop lights up when a car is waiting on it, which is what makes the signals run.

import { LOOP_LENGTH, type Route } from './traffic';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HALF_WIDTH = 9;

/** Outline of the stretch [from, to] of a route, HALF_WIDTH px either side. */
function band(route: Route, from: number, to: number): string {
  const p = route.points;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = Math.max(1, Math.round(from)); i <= Math.min(route.length - 1, Math.round(to)); i += 2) {
    const dx = p[2 * i + 2] - p[2 * i - 2];
    const dy = p[2 * i + 3] - p[2 * i - 1];
    const n = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [-dy / n, dx / n];
    left.push(`${(p[2 * i] + nx * HALF_WIDTH).toFixed(1)},${(p[2 * i + 1] + ny * HALF_WIDTH).toFixed(1)}`);
    right.unshift(`${(p[2 * i] - nx * HALF_WIDTH).toFixed(1)},${(p[2 * i + 1] - ny * HALF_WIDTH).toFixed(1)}`);
  }
  return `M${left.join(' L')} L${right.join(' L')} Z`;
}

export class LoopLayer {
  private loops = new Map<string, SVGPathElement>();

  constructor(
    private layer: SVGGElement,
    routes: Route[],
  ) {
    // One loop per lane; routes in a lane share the stretch before the stop line.
    for (const route of routes) {
      const lane = route.def.lane;
      if (this.loops.has(lane)) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'loop');
      path.setAttribute('d', band(route, route.stopAt - LOOP_LENGTH, route.stopAt));
      layer.appendChild(path);
      this.loops.set(lane, path);
    }
  }

  setVisible(visible: boolean): void {
    this.layer.classList.toggle('is-visible', visible);
  }

  render(occupied: Set<string>): void {
    for (const [lane, path] of this.loops) path.classList.toggle('is-occupied', occupied.has(lane));
  }
}
