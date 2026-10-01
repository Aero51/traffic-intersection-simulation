// SVG view of the Traffic model: one top-down car sprite per car, keyed by car id.
// Sprites face +x with the origin at the car's centre; left is -y.

import { pose, type Car, type VehicleKind } from './traffic';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Shared gradients and filters for the sprites; call once per <svg>. */
export function createCarDefs(svg: SVGSVGElement): void {
  const defs = svg.querySelector('defs') ?? svg.insertBefore(document.createElementNS(SVG_NS, 'defs'), svg.firstChild);
  defs.insertAdjacentHTML(
    'beforeend',
    `<filter id="car-shadow" x="-30%" y="-50%" width="160%" height="200%">
       <feGaussianBlur stdDeviation="1.6"/>
     </filter>
     <filter id="lamp-glow" x="-200%" y="-200%" width="500%" height="500%">
       <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b"/>
       <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
     </filter>
     <linearGradient id="car-sheen" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#000" stop-opacity="0.38"/>
       <stop offset="0.16" stop-color="#fff" stop-opacity="0.28"/>
       <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
       <stop offset="0.84" stop-color="#000" stop-opacity="0.06"/>
       <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
     </linearGradient>
     <linearGradient id="car-glass" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#4a6378"/>
       <stop offset="0.45" stop-color="#16222d"/>
       <stop offset="1" stop-color="#0b1117"/>
     </linearGradient>
     <linearGradient id="car-roof" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#fff" stop-opacity="0.08"/>
       <stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/>
       <stop offset="1" stop-color="#fff" stop-opacity="0.04"/>
     </linearGradient>`,
  );
}

/** Cabin layout as fractions of the length: windshield front/back, roof back, rear window back. */
const CABIN: Record<VehicleKind, { wsFront: number; wsBack: number; roofBack: number; rwBack: number | null }> = {
  sedan: { wsFront: 0.22, wsBack: 0.07, roofBack: -0.22, rwBack: -0.33 },
  hatch: { wsFront: 0.2, wsBack: 0.05, roofBack: -0.33, rwBack: -0.42 },
  van: { wsFront: 0.33, wsBack: 0.23, roofBack: -0.47, rwBack: null },
};

const f = (n: number) => n.toFixed(2);

function sprite(car: Car): string {
  const L = car.length;
  const W = car.width;
  const x0 = -L / 2;
  const y0 = -W / 2;
  const c = CABIN[car.kind];
  const ws = [c.wsFront * L, c.wsBack * L];
  const roof = c.roofBack * L;
  const glassW = W * 0.4;
  const roofW = W * 0.33;

  const trapezoid = (xOuter: number, xInner: number) =>
    `M${f(xOuter)},${f(-glassW)} L${f(xOuter)},${f(glassW)} L${f(xInner)},${f(roofW)} L${f(xInner)},${f(-roofW)} Z`;

  const lamp = (cls: string, x: number, y: number, w: number, h: number) =>
    `<rect class="${cls}" x="${f(x)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="0.8"/>`;

  return `
    <rect x="${f(x0 + 1.5)}" y="${f(y0 + 2.6)}" width="${L}" height="${W}" rx="${f(W * 0.4)}" fill="#000" opacity="0.45" filter="url(#car-shadow)"/>
    <rect x="${f(c.wsFront * L - 0.5)}" y="${f(y0 - 1.6)}" width="2.6" height="${f(W + 3.2)}" rx="0.9" fill="${car.color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="${f(W * 0.38)}" fill="${car.color}"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="${f(W * 0.38)}" fill="url(#car-sheen)" stroke="rgba(0,0,0,0.55)" stroke-width="0.7"/>
    <path d="${trapezoid(ws[0], ws[1])}" fill="url(#car-glass)"/>
    ${c.rwBack !== null ? `<path d="${trapezoid(c.rwBack * L, roof)}" fill="url(#car-glass)"/>` : ''}
    <rect x="${f(roof)}" y="${f(-W * 0.43)}" width="${f(ws[1] - roof)}" height="${f(W * 0.08)}" fill="#16222d" opacity="0.9"/>
    <rect x="${f(roof)}" y="${f(W * 0.35)}" width="${f(ws[1] - roof)}" height="${f(W * 0.08)}" fill="#16222d" opacity="0.9"/>
    <rect x="${f(roof)}" y="${f(-roofW)}" width="${f(ws[1] - roof)}" height="${f(2 * roofW)}" rx="1.5" fill="url(#car-roof)"/>
    ${car.kind === 'van' ? `<path d="M${f(roof + L * 0.18)},${f(-roofW)} v${f(2 * roofW)} M${f(roof + L * 0.4)},${f(-roofW)} v${f(2 * roofW)}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>` : ''}
    ${lamp('head', L / 2 - 2, -W * 0.3, 1.8, 3.4)}
    ${lamp('head', L / 2 - 2, W * 0.3, 1.8, 3.4)}
    ${lamp('tail', x0 + 0.3, -W * 0.3, 1.8, 3.6)}
    ${lamp('tail', x0 + 0.3, W * 0.3, 1.8, 3.6)}
    ${lamp('ind ind-left', L / 2 - 3.2, y0 + 1.4, 2.4, 1.6)}
    ${lamp('ind ind-left', x0 + 0.8, y0 + 1.4, 2.4, 1.6)}
    ${lamp('ind ind-right', L / 2 - 3.2, -y0 - 1.4, 2.4, 1.6)}
    ${lamp('ind ind-right', x0 + 0.8, -y0 - 1.4, 2.4, 1.6)}`;
}

interface Node {
  g: SVGGElement;
  braking: boolean;
  indicator: Car['indicator'];
}

export class CarLayer {
  private nodes = new Map<number, Node>();

  constructor(private layer: SVGGElement) {}

  render(cars: Car[]): void {
    const alive = new Set<number>();
    for (const car of cars) {
      alive.add(car.id);
      let node = this.nodes.get(car.id);
      if (!node) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'car');
        g.innerHTML = sprite(car);
        // Stagger the indicator blink so turning cars don't flash in unison.
        g.style.setProperty('--blink-delay', `${(-Math.random() * 0.7).toFixed(2)}s`);
        node = { g, braking: false, indicator: null };
        this.nodes.set(car.id, node);
        this.layer.appendChild(g);
      }
      if (node.braking !== car.braking) {
        node.braking = car.braking;
        node.g.classList.toggle('is-braking', car.braking);
      }
      if (node.indicator !== car.indicator) {
        node.g.classList.remove('indicating-left', 'indicating-right');
        if (car.indicator) node.g.classList.add(`indicating-${car.indicator}`);
        node.indicator = car.indicator;
      }
      // car.s is the front bumper; the body is centred half a length behind it, and the
      // heading is taken over the wheelbase so the car turns smoothly through curves.
      const { x, y, angle } = pose(car.route, car.s - car.length / 2, car.length * 0.6);
      node.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`);
    }
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.g.remove();
        this.nodes.delete(id);
      }
    }
  }
}
