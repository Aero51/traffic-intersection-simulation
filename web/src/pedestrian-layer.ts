// SVG view of the Pedestrians model: top-down people (shoulders, head, stepping feet).

import { walkerPose, type Walker } from './pedestrians';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** True to scale, people would be barely visible next to the cars; draw them a bit larger. */
const SCALE = 1.5;

function sprite(w: Walker): string {
  return `
    <ellipse cx="1" cy="1.6" rx="3.6" ry="5" fill="#000" opacity="0.3"/>
    <g class="feet">
      <ellipse class="foot foot-l" cx="0" cy="-1.8" rx="1.8" ry="1.1" fill="#222"/>
      <ellipse class="foot foot-r" cx="0" cy="1.8" rx="1.8" ry="1.1" fill="#222"/>
    </g>
    <ellipse cx="0" cy="0" rx="2.6" ry="4.6" fill="${w.clothes}" stroke="rgba(0,0,0,0.45)" stroke-width="0.5"/>
    <circle cx="0.2" cy="0" r="2.2" fill="${w.hair}" stroke="rgba(0,0,0,0.35)" stroke-width="0.4"/>`;
}

export class PedestrianLayer {
  private nodes = new Map<number, { g: SVGGElement; walking: boolean }>();

  constructor(private layer: SVGGElement) {}

  render(walkers: Walker[]): void {
    const alive = new Set<number>();
    for (const w of walkers) {
      alive.add(w.id);
      let node = this.nodes.get(w.id);
      if (!node) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'walker');
        g.innerHTML = sprite(w);
        g.style.setProperty('--step-delay', `${(-Math.random() * 0.5).toFixed(2)}s`);
        node = { g, walking: false };
        this.nodes.set(w.id, node);
        this.layer.appendChild(g);
      }
      if (node.walking !== w.walking) {
        node.walking = w.walking;
        node.g.classList.toggle('is-walking', w.walking);
      }
      const { x, y, angle } = walkerPose(w);
      node.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)}) scale(${SCALE})`);
    }
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.g.remove();
        this.nodes.delete(id);
      }
    }
  }
}
