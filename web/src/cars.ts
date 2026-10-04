// SVG view of the Traffic model: one top-down car sprite per car, keyed by car id.
// Sprites face +x with the origin at the car's centre; left is -y.
// A second group per car on the lights layer (above the night overlay) holds the
// headlight beams and lamp glows, so they stay bright when the scene is dark.

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
     </linearGradient>
     <radialGradient id="glow-head"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.35" stop-color="#fff4c8" stop-opacity="0.8"/><stop offset="1" stop-color="#fff4c8" stop-opacity="0"/></radialGradient>
     <radialGradient id="glow-tail"><stop offset="0" stop-color="#ff3b2f"/><stop offset="0.35" stop-color="#ff2a1f" stop-opacity="0.75"/><stop offset="1" stop-color="#ff2a1f" stop-opacity="0"/></radialGradient>
     <radialGradient id="glow-ind"><stop offset="0" stop-color="#ffd54f"/><stop offset="0.35" stop-color="#ffb300" stop-opacity="0.8"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>
     <radialGradient id="glow-beacon"><stop offset="0" stop-color="#82b1ff"/><stop offset="0.4" stop-color="#2979ff" stop-opacity="0.7"/><stop offset="1" stop-color="#2979ff" stop-opacity="0"/></radialGradient>
     <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0" stop-color="#fff4c8" stop-opacity="0.4"/>
       <stop offset="1" stop-color="#fff4c8" stop-opacity="0"/>
     </linearGradient>`,
  );
}

/** Cabin layout as fractions of the length: windshield front/back, roof back, rear window back. */
const CABIN: Partial<Record<VehicleKind, { wsFront: number; wsBack: number; roofBack: number; rwBack: number | null }>> = {
  sedan: { wsFront: 0.22, wsBack: 0.07, roofBack: -0.22, rwBack: -0.33 },
  hatch: { wsFront: 0.2, wsBack: 0.05, roofBack: -0.33, rwBack: -0.42 },
  van: { wsFront: 0.33, wsBack: 0.23, roofBack: -0.47, rwBack: null },
  ambulance: { wsFront: 0.33, wsBack: 0.23, roofBack: -0.47, rwBack: null },
};

const f = (n: number) => n.toFixed(2);

const lamp = (cls: string, x: number, y: number, w: number, h: number) =>
  `<rect class="${cls}" x="${f(x)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="0.8"/>`;

/** Shadow, head/tail lamps and indicators, shared by every four-wheeled sprite. */
function common(L: number, W: number, body: string): string {
  const x0 = -L / 2;
  const y0 = -W / 2;
  return `
    <rect x="${f(x0 + 1.5)}" y="${f(y0 + 2.6)}" width="${L}" height="${W}" rx="${f(W * 0.3)}" fill="#000" opacity="0.45" filter="url(#car-shadow)"/>
    ${body}
    ${lamp('head', L / 2 - 2, -W * 0.3, 1.8, 3.4)}
    ${lamp('head', L / 2 - 2, W * 0.3, 1.8, 3.4)}
    ${lamp('tail', x0 + 0.3, -W * 0.3, 1.8, 3.6)}
    ${lamp('tail', x0 + 0.3, W * 0.3, 1.8, 3.6)}
    ${lamp('ind ind-left', L / 2 - 3.2, y0 + 1.4, 2.4, 1.6)}
    ${lamp('ind ind-left', x0 + 0.8, y0 + 1.4, 2.4, 1.6)}
    ${lamp('ind ind-right', L / 2 - 3.2, -y0 - 1.4, 2.4, 1.6)}
    ${lamp('ind ind-right', x0 + 0.8, -y0 - 1.4, 2.4, 1.6)}`;
}

function carSprite(car: Car): string {
  const L = car.length;
  const W = car.width;
  const x0 = -L / 2;
  const y0 = -W / 2;
  const c = CABIN[car.kind]!;
  const ws = [c.wsFront * L, c.wsBack * L];
  const roof = c.roofBack * L;
  const glassW = W * 0.4;
  const roofW = W * 0.33;

  const trapezoid = (xOuter: number, xInner: number) =>
    `M${f(xOuter)},${f(-glassW)} L${f(xOuter)},${f(glassW)} L${f(xInner)},${f(roofW)} L${f(xInner)},${f(-roofW)} Z`;

  const boxy = car.kind === 'van' || car.kind === 'ambulance';
  const ambulance = car.kind === 'ambulance'
    ? `<rect x="${f(roof)}" y="${f(-W / 2)}" width="${f(L / 2 - roof - 2)}" height="2.2" fill="#d32f2f"/>
       <rect x="${f(roof)}" y="${f(W / 2 - 2.2)}" width="${f(L / 2 - roof - 2)}" height="2.2" fill="#d32f2f"/>
       <path d="M${f(roof + L * 0.22)},${f(-3.5)} h3 v2.5 h2.5 v3 h-2.5 v2.5 h-3 v-2.5 h-2.5 v-3 h2.5 z" fill="#d32f2f"/>
       <rect class="beacon beacon-a" x="${f(ws[1] - 3.2)}" y="${f(-W * 0.36)}" width="2.8" height="${f(W * 0.3)}" rx="1"/>
       <rect class="beacon beacon-b" x="${f(ws[1] - 3.2)}" y="${f(W * 0.06)}" width="2.8" height="${f(W * 0.3)}" rx="1"/>`
    : '';

  return common(L, W, `
    <rect x="${f(c.wsFront * L - 0.5)}" y="${f(y0 - 1.6)}" width="2.6" height="${f(W + 3.2)}" rx="0.9" fill="${car.color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="${f(W * 0.38)}" fill="${car.color}"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="${f(W * 0.38)}" fill="url(#car-sheen)" stroke="rgba(0,0,0,0.55)" stroke-width="0.7"/>
    <path d="${trapezoid(ws[0], ws[1])}" fill="url(#car-glass)"/>
    ${c.rwBack !== null ? `<path d="${trapezoid(c.rwBack * L, roof)}" fill="url(#car-glass)"/>` : ''}
    <rect x="${f(roof)}" y="${f(-W * 0.43)}" width="${f(ws[1] - roof)}" height="${f(W * 0.08)}" fill="#16222d" opacity="0.9"/>
    <rect x="${f(roof)}" y="${f(W * 0.35)}" width="${f(ws[1] - roof)}" height="${f(W * 0.08)}" fill="#16222d" opacity="0.9"/>
    <rect x="${f(roof)}" y="${f(-roofW)}" width="${f(ws[1] - roof)}" height="${f(2 * roofW)}" rx="1.5" fill="url(#car-roof)"/>
    ${boxy ? `<path d="M${f(roof + L * 0.18)},${f(-roofW)} v${f(2 * roofW)} M${f(roof + L * 0.4)},${f(-roofW)} v${f(2 * roofW)}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>` : ''}
    ${ambulance}`);
}

/** City bus: long roof with air-conditioning boxes, windows along both sides. */
function busSprite(car: Car): string {
  const L = car.length;
  const W = car.width;
  const x0 = -L / 2;
  const y0 = -W / 2;
  return common(L, W, `
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="3" fill="${car.color}"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${L}" height="${W}" rx="3" fill="url(#car-sheen)" stroke="rgba(0,0,0,0.55)" stroke-width="0.7"/>
    <rect x="${f(x0 + 3)}" y="${f(y0 + 0.8)}" width="${f(L - 9)}" height="2.4" fill="#16222d" opacity="0.85"/>
    <rect x="${f(x0 + 3)}" y="${f(W / 2 - 3.2)}" width="${f(L - 9)}" height="2.4" fill="#16222d" opacity="0.85"/>
    <rect x="${f(L / 2 - 4.5)}" y="${f(y0 + 1)}" width="3.6" height="${f(W - 2)}" rx="1" fill="url(#car-glass)"/>
    <rect x="${f(x0 + 4)}" y="${f(-W * 0.3)}" width="${f(L - 12)}" height="${f(W * 0.6)}" rx="1.5" fill="#eceff1" opacity="0.88"/>
    <rect x="${f(x0 + L * 0.18)}" y="${f(-W * 0.22)}" width="9" height="${f(W * 0.44)}" rx="1" fill="#b0bec5"/>
    <rect x="${f(x0 + L * 0.55)}" y="${f(-W * 0.22)}" width="9" height="${f(W * 0.44)}" rx="1" fill="#b0bec5"/>`);
}

/** Lorry: cab at the front, a white box behind it. */
function truckSprite(car: Car): string {
  const L = car.length;
  const W = car.width;
  const x0 = -L / 2;
  const y0 = -W / 2;
  const cab = 13;
  const box = L - cab - 1.5;
  return common(L, W, `
    <rect x="${f(L / 2 - cab)}" y="${f(y0 + 0.5)}" width="${cab}" height="${f(W - 1)}" rx="3" fill="${car.color}" stroke="rgba(0,0,0,0.55)" stroke-width="0.7"/>
    <rect x="${f(L / 2 - 4.5)}" y="${f(y0 + 2)}" width="3.4" height="${f(W - 4)}" rx="1" fill="url(#car-glass)"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${f(box)}" height="${W}" rx="1.2" fill="#e8eaed"/>
    <rect x="${f(x0)}" y="${f(y0)}" width="${f(box)}" height="${W}" rx="1.2" fill="url(#car-sheen)" stroke="rgba(0,0,0,0.55)" stroke-width="0.7"/>
    <path d="${Array.from({ length: 5 }, (_, i) => `M${f(x0 + ((i + 1) * box) / 6)},${f(y0 + 1)} v${f(W - 2)}`).join(' ')}" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>`);
}

/** Motorbike and rider seen from above. */
function motoSprite(car: Car): string {
  const L = car.length;
  return `
    <ellipse cx="1" cy="2" rx="${f(L / 2)}" ry="4" fill="#000" opacity="0.35" filter="url(#car-shadow)"/>
    <rect x="${f(-L / 2)}" y="-1.6" width="${L}" height="3.2" rx="1.6" fill="#222"/>
    <rect x="${f(L / 2 - 6)}" y="-4.2" width="1.6" height="8.4" rx="0.8" fill="#444"/>
    <ellipse cx="-1" cy="0" rx="5.5" ry="3.2" fill="${car.color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>
    <ellipse cx="-3" cy="0" rx="3" ry="4.3" fill="#263238"/>
    <circle cx="-1.4" cy="0" r="2.6" fill="${car.color}" stroke="rgba(0,0,0,0.6)" stroke-width="0.6"/>
    ${lamp('head', L / 2 - 1.6, 0, 1.6, 2.4)}
    ${lamp('tail', -L / 2, 0, 1.4, 2.4)}
    ${lamp('ind ind-left', L / 2 - 6.4, -4.2, 1.6, 1.4)}
    ${lamp('ind ind-right', L / 2 - 6.4, 4.2, 1.6, 1.4)}`;
}

/** Bicycle and cyclist seen from above: two wheels, a frame, handlebars, shoulders and a helmet. */
function bikeSprite(car: Car): string {
  const L = car.length;
  return `
    <ellipse cx="1" cy="1.5" rx="${f(L / 2)}" ry="3.4" fill="#000" opacity="0.3" filter="url(#car-shadow)"/>
    <rect x="${f(-L / 2)}" y="-0.9" width="${L}" height="1.8" rx="0.9" fill="#1c1c1c"/>
    <rect x="${f(L / 2 - 4.5)}" y="-3.4" width="1.3" height="6.8" rx="0.65" fill="#555"/>
    <ellipse cx="-1" cy="0" rx="2.6" ry="3.4" fill="${car.color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>
    <circle cx="0.4" cy="0" r="1.9" fill="#eceff1" stroke="rgba(0,0,0,0.6)" stroke-width="0.5"/>
    ${lamp('head', L / 2 - 1.2, 0, 1.2, 1.8)}
    ${lamp('tail', -L / 2, 0, 1.2, 1.8)}
    ${lamp('ind ind-left', L / 2 - 4.8, -3.4, 1.2, 1.2)}
    ${lamp('ind ind-right', L / 2 - 4.8, 3.4, 1.2, 1.2)}`;
}

function sprite(car: Car): string {
  if (car.kind === 'bus') return busSprite(car);
  if (car.kind === 'truck') return truckSprite(car);
  if (car.kind === 'moto') return motoSprite(car);
  if (car.kind === 'bike') return bikeSprite(car);
  return carSprite(car);
}

/** Night-time lights: beams ahead, glowing head/tail lamps, indicators (and beacons). */
function lightsSprite(car: Car): string {
  const L = car.length;
  const W = car.width;
  const moto = car.kind === 'moto' || car.kind === 'bike';
  const heads = moto ? [0] : [-W * 0.3, W * 0.3];
  const beam = (y: number) =>
    `<path class="beam" d="M${f(L / 2)},${f(y - 1.5)} L${f(L / 2 + 70)},${f(y - 16)} L${f(L / 2 + 70)},${f(y + 16)} L${f(L / 2)},${f(y + 1.5)} Z" fill="url(#beam)"/>`;
  const glow = (cls: string, x: number, y: number, r: number) => `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
  return `
    ${heads.map(beam).join('')}
    ${heads.map((y) => glow('glow-head', L / 2 - 1, y, 5)).join('')}
    ${heads.map((y) => glow('glow-tail', -L / 2 + 1, y, 4.5)).join('')}
    ${glow('glow-ind ind-left', L / 2 - 2, -W / 2 + 1, 4)}${glow('glow-ind ind-left', -L / 2 + 2, -W / 2 + 1, 4)}
    ${glow('glow-ind ind-right', L / 2 - 2, W / 2 - 1, 4)}${glow('glow-ind ind-right', -L / 2 + 2, W / 2 - 1, 4)}
    ${car.kind === 'ambulance' ? `${glow('glow-beacon beacon-a', L * 0.23 - 2, -W * 0.2, 9)}${glow('glow-beacon beacon-b', L * 0.23 - 2, W * 0.2, 9)}` : ''}`;
}

interface Node {
  g: SVGGElement;
  lights: SVGGElement;
  braking: boolean;
  indicator: Car['indicator'] | 'hazard';
  transform: string;
}

export class CarLayer {
  private nodes = new Map<number, Node>();
  private followed: number | null = null;

  constructor(private layer: SVGGElement, private lightsLayer: SVGGElement) {}

  /** Highlight one car (or none). */
  setFollowed(id: number | null): void {
    if (this.followed !== null) this.nodes.get(this.followed)?.g.classList.remove('is-followed');
    this.followed = id;
    if (id !== null) this.nodes.get(id)?.g.classList.add('is-followed');
  }

  render(cars: Car[]): void {
    const alive = new Set<number>();
    for (const car of cars) {
      alive.add(car.id);
      let node = this.nodes.get(car.id);
      if (!node) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', `car car-${car.kind}${car.id === this.followed ? ' is-followed' : ''}`);
        g.dataset.id = String(car.id);
        g.innerHTML = sprite(car);
        const lights = document.createElementNS(SVG_NS, 'g');
        lights.setAttribute('class', 'car-lights');
        lights.innerHTML = lightsSprite(car);
        // Stagger the indicator blink so turning cars don't flash in unison.
        const delay = `${(-Math.random() * 0.7).toFixed(2)}s`;
        g.style.setProperty('--blink-delay', delay);
        lights.style.setProperty('--blink-delay', delay);
        node = { g, lights, braking: false, indicator: null, transform: '' };
        this.nodes.set(car.id, node);
        this.layer.appendChild(g);
        this.lightsLayer.appendChild(lights);
      }
      if (node.braking !== car.braking) {
        node.braking = car.braking;
        node.g.classList.toggle('is-braking', car.braking);
        node.lights.classList.toggle('is-braking', car.braking);
      }
      const signal = car.stalled > 0 ? 'hazard' : car.indicator;
      if (node.indicator !== signal) {
        for (const el of [node.g, node.lights]) {
          el.classList.remove('indicating-left', 'indicating-right');
          if (signal === 'hazard') el.classList.add('indicating-left', 'indicating-right');
          else if (signal) el.classList.add(`indicating-${signal}`);
        }
        node.indicator = signal;
      }
      // car.s is the front bumper; the body is centred half a length behind it, and the
      // heading is taken over the wheelbase so the car turns smoothly through curves.
      const { x, y, angle } = pose(car.route, car.s - car.length / 2, car.length * 0.6);
      const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`;
      if (transform !== node.transform) {
        node.transform = transform;
        node.g.setAttribute('transform', transform);
        node.lights.setAttribute('transform', transform);
      }
    }
    for (const [id, node] of this.nodes) {
      if (!alive.has(id)) {
        node.g.remove();
        node.lights.remove();
        this.nodes.delete(id);
      }
    }
  }
}
