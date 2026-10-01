// SVG ports of TrafficLightSkin / PjesaciSkin / SkretaciSkin.
// Proportions follow the JavaFX skins: lamps at 0.2H / 0.5H / 0.8H, radius 0.3125W.

import { SIGNAL_HEIGHT as H, SIGNAL_WIDTH as W, type SignalKind, type SignalPlacement } from './layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type LampColor = 'red' | 'yellow' | 'green';

export interface LampState {
  on: boolean;
  blinking: boolean;
}

export type SignalState = Partial<Record<LampColor, Partial<LampState>>>;

const LAMPS: Record<SignalKind, LampColor[]> = {
  vehicle: ['red', 'yellow', 'green'],
  pedestrian: ['red', 'green'],
  turn: ['green'],
};

// Fraction of H covered by the housing background, per skin.
const HOUSING_HEIGHT: Record<SignalKind, number> = {
  vehicle: 0.9,
  pedestrian: 0.6,
  turn: 0.3,
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Shared gradients and glow filters; call once per <svg>. */
export function createSignalDefs(svg: SVGSVGElement): void {
  const defs = el('defs', {}, svg);

  const radial = (id: string, cx: number, cy: number, r: number, stops: [number, string][]) => {
    const g = el('radialGradient', { id, cx, cy, r }, defs);
    for (const [offset, color] of stops) el('stop', { offset, 'stop-color': color }, g);
  };

  // On/off lamp fills (stop colours from the JavaFX RadialGradients).
  const lamp = {
    red: { on: ['#ff0000', '#410000'], off: ['#4d0000', '#010000'] },
    yellow: { on: ['#ffff00', '#555700'], off: ['#535500', '#010100'] },
    green: { on: ['#00ff00', '#204724'], off: ['#195600', '#000100'] },
  } as const;
  for (const color of ['red', 'yellow', 'green'] as const) {
    for (const state of ['on', 'off'] as const) {
      const [inner, outer] = lamp[color][state];
      radial(`lamp-${color}-${state}`, 0.5, 0.84, 0.95, [
        [0, inner],
        [0.98, outer],
        [1, state === 'on' ? outer : '#000'],
      ]);
    }
  }
  radial('lamp-highlight-on', 0.5, 0.25, 0.7, [
    [0, 'rgba(255,255,255,0.67)'],
    [1, 'rgba(255,255,255,0.09)'],
  ]);
  radial('lamp-highlight-off', 0.5, 0.25, 0.7, [
    [0, 'rgba(255,255,255,0.22)'],
    [1, 'rgba(255,255,255,0.03)'],
  ]);

  const glow = { red: '#ff0000', yellow: '#ffff00', green: '#00ff00' };
  for (const [color, flood] of Object.entries(glow)) {
    const f = el('filter', { id: `glow-${color}`, x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
    el('feFlood', { 'flood-color': flood, result: 'c' }, f);
    el('feComposite', { in: 'c', in2: 'SourceAlpha', operator: 'in', result: 'shape' }, f);
    el('feGaussianBlur', { in: 'shape', stdDeviation: 0.18 * W * 0.6, result: 'blur' }, f);
    const merge = el('feMerge', {}, f);
    el('feMergeNode', { in: 'blur' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);
  }
}

export class Signal {
  readonly root: SVGGElement;
  readonly placement: SignalPlacement;
  private lamps = new Map<LampColor, SVGGElement>();

  constructor(parent: SVGElement, placement: SignalPlacement) {
    this.placement = placement;
    const { x, y, rotate, kind, dark, id } = placement;

    // JavaFX setRotate() pivots around the centre of the node's layout bounds.
    this.root = el(
      'g',
      {
        class: `signal signal-${kind}`,
        'data-id': id,
        transform: `translate(${x} ${y}) rotate(${rotate} ${W / 2} ${H / 2})`,
      },
      parent,
    );
    // Inner group so selection scaling (scaleX/Y = 2 in the original) can be done in CSS.
    const body = el('g', { class: 'signal-body' }, this.root);

    const k = HOUSING_HEIGHT[kind];
    const frame = dark ? 'rgba(204,204,204,0.6)' : 'rgba(51,51,51,0.8)';
    const back = dark ? 'rgba(51,51,51,0.6)' : 'rgba(204,204,204,0.8)';
    el('rect', { x: 0, y: 0, width: W, height: (k + 0.1) * H, rx: W / 2, ry: 0.2 * H, fill: frame }, body);
    el('rect', {
      x: 0.125 * W,
      y: 0.055 * H,
      width: 0.75 * W,
      height: k * H,
      rx: 0.375 * W,
      ry: 0.15 * H,
      fill: back,
      stroke: kind === 'vehicle' ? 'none' : 'gray',
      'stroke-width': 0.75,
    }, body);

    LAMPS[kind].forEach((color, i) => {
      const cy = (0.2 + 0.3 * i) * H;
      const r = 0.3125 * W;
      const lamp = el('g', { class: `lamp lamp-${color}` }, body);
      el('circle', { class: 'off', cx: W / 2, cy, r, fill: `url(#lamp-${color}-off)` }, lamp);
      el('ellipse', {
        class: 'off', cx: 0.49375 * W, cy: cy - 0.07 * H, rx: 0.23125 * W, ry: 0.05 * H,
        fill: 'url(#lamp-highlight-off)',
      }, lamp);
      el('circle', {
        class: 'on', cx: W / 2, cy, r, fill: `url(#lamp-${color}-on)`, filter: `url(#glow-${color})`,
      }, lamp);
      el('ellipse', {
        class: 'on', cx: 0.49375 * W, cy: cy - 0.07 * H, rx: 0.23125 * W, ry: 0.05 * H,
        fill: 'url(#lamp-highlight-on)',
      }, lamp);
      this.lamps.set(color, lamp);
    });
  }

  get id(): number {
    return this.placement.id;
  }

  set(state: SignalState): void {
    for (const [color, s] of Object.entries(state) as [LampColor, Partial<LampState>][]) {
      const lamp = this.lamps.get(color);
      if (!lamp || !s) continue;
      if (s.on !== undefined) lamp.classList.toggle('is-on', s.on);
      if (s.blinking !== undefined) lamp.classList.toggle('is-blinking', s.blinking);
    }
  }

  /** All lamps off, no blinking (stopOdabranog / sviStop in the original). */
  clear(): void {
    for (const lamp of this.lamps.values()) lamp.classList.remove('is-on', 'is-blinking');
  }

  setSelected(selected: boolean): void {
    this.root.classList.toggle('is-selected', selected);
  }
}
