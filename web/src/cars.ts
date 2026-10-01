// SVG view of the Traffic model: one <g> per car, keyed by car id.

import { CAR_LENGTH, pose, type Car } from './traffic';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 10; // car width

function carNode(color: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'car');
  g.innerHTML = `
    <rect x="${-CAR_LENGTH / 2 + 0.5}" y="${-W / 2 + 0.8}" width="${CAR_LENGTH}" height="${W}" rx="3" fill="rgba(0,0,0,0.35)"/>
    <rect x="${-CAR_LENGTH / 2}" y="${-W / 2}" width="${CAR_LENGTH}" height="${W}" rx="3" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="0.6"/>
    <rect x="2.5" y="${-W / 2 + 1.2}" width="3.6" height="${W - 2.4}" rx="1" fill="#1d2833" opacity="0.85"/>
    <rect x="-8.5" y="${-W / 2 + 1.5}" width="2.4" height="${W - 3}" rx="0.8" fill="#1d2833" opacity="0.75"/>`;
  return g;
}

export class CarLayer {
  private nodes = new Map<number, SVGGElement>();

  constructor(private layer: SVGGElement) {}

  render(cars: Car[]): void {
    const alive = new Set<number>();
    for (const car of cars) {
      alive.add(car.id);
      let node = this.nodes.get(car.id);
      if (!node) {
        node = carNode(car.color);
        this.nodes.set(car.id, node);
        this.layer.appendChild(node);
      }
      // car.s is the front bumper; draw the body centred half a length behind it.
      const { x, y, angle } = pose(car.route, car.s - CAR_LENGTH / 2);
      node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`);
    }
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }
  }
}
