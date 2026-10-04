// Things drawn over the intersection: the label of a followed car, the debug view of
// routes and conflict zones, pedestrian countdowns, signal tooltips, and night and rain.

import { SCENE_HEIGHT, SCENE_WIDTH, SIGNAL_HEIGHT, SIGNAL_WIDTH, type SignalPlacement } from './layout';
import type { Car, Route, Traffic } from './traffic';
import { lampKey, type Simulation } from './sim';
import type { Signal } from './signals';
import { num, t, tk } from './i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** px/s on the photo to km/h: a 4.5 m car is about 42 px long. */
const KMH_PER_PX_S = (4.5 / 42) * 3.6;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Percent position over the scene, for HTML overlays. */
function place(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${((x / SCENE_WIDTH) * 100).toFixed(3)}%`;
  el.style.top = `${((y / SCENE_HEIGHT) * 100).toFixed(3)}%`;
}

/** SVG path along a stretch of a route. */
function routePath(route: Route, from = 0, to = route.length, step = 3): string {
  const p = route.points;
  const parts: string[] = [];
  for (let i = Math.max(0, Math.round(from)); i <= Math.min(route.length, Math.round(to)); i += step) {
    parts.push(`${p[2 * i].toFixed(1)},${p[2 * i + 1].toFixed(1)}`);
  }
  return parts.length > 1 ? `M${parts.join(' L')}` : '';
}

const carCentre = (car: Car) => {
  const i = Math.min(car.route.length, Math.max(0, Math.round(car.s - car.length / 2)));
  return { x: car.route.points[2 * i], y: car.route.points[2 * i + 1] };
};

// ---------------------------------------------------------------- follow a car

export class FollowView {
  carId: number | null = null;
  private tag: HTMLElement;
  private path: SVGPathElement;
  private lastText = 0;

  constructor(wrap: HTMLElement, layer: SVGGElement) {
    this.tag = document.createElement('div');
    this.tag.className = 'follow-tag';
    this.tag.hidden = true;
    this.tag.setAttribute('aria-live', 'off');
    wrap.appendChild(this.tag);
    this.path = svg('path', { class: 'follow-route' }, layer);
  }

  follow(car: Car | null): void {
    this.carId = car?.id ?? null;
    this.tag.hidden = car === null;
    this.path.setAttribute('d', car ? routePath(car.route) : '');
    this.lastText = 0;
  }

  /** Returns false once the followed car has left the map. */
  render(cars: Car[], now: number): boolean {
    if (this.carId === null) return true;
    const car = cars.find((c) => c.id === this.carId);
    if (!car) {
      this.follow(null);
      return false;
    }
    const { x, y } = carCentre(car);
    place(this.tag, x, y);
    if (now - this.lastText > 120) {
      this.lastText = now;
      const kmh = Math.round(car.v * KMH_PER_PX_S);
      const waited = car.wait >= 1 ? ` · ${t('car.waited', { n: num(car.wait, 0) })}` : '';
      this.tag.innerHTML =
        `<strong>${tk(`kind.${car.kind}`)}</strong> · ${kmh} ${t('car.kmh')}<br>` +
        `<span class="status status-${car.status}">${tk(`status.${car.status}`)}</span>${waited}<br>` +
        `<small>${tk(`route.${car.route.def.id}`)}</small>`;
    }
    return true;
  }
}

// ---------------------------------------------------------------- debug view

const LANE_COLORS: Record<string, string> = {
  'nw-right': '#4fc3f7',
  'nw-left': '#81d4fa',
  'se-left': '#ce93d8',
  'se-right': '#e1bee7',
  side: '#a5d6a7',
};

export class DebugLayer {
  private zones = new Map<string, SVGPathElement[]>();
  private labels = new Map<number, SVGTextElement>();
  private labelLayer: SVGGElement;
  private fps: HTMLElement;
  private frames: number[] = [];

  constructor(
    private layer: SVGGElement,
    wrap: HTMLElement,
    traffic: Traffic,
  ) {
    for (const route of traffic.routes) {
      const color = LANE_COLORS[route.def.lane] ?? '#fff';
      svg('path', { class: 'dbg-route', d: routePath(route), stroke: color }, layer);
      // Stop line: a tick across the route; gate: a dot.
      const i = route.stopAt;
      const p = route.points;
      const dx = p[2 * i + 2] - p[2 * i - 2];
      const dy = p[2 * i + 3] - p[2 * i - 1];
      const n = Math.hypot(dx, dy) || 1;
      const [nx, ny] = [(-dy / n) * 9, (dx / n) * 9];
      svg('line', { class: 'dbg-stop', x1: p[2 * i] - nx, y1: p[2 * i + 1] - ny, x2: p[2 * i] + nx, y2: p[2 * i + 1] + ny }, layer);
      const g = Math.round(traffic.gate.get(route)!);
      svg('circle', { class: 'dbg-gate', cx: p[2 * g], cy: p[2 * g + 1], r: 2.5 }, layer);
      for (const z of traffic.conflicts.get(route)!) {
        // A merge runs to the end of the route; draw it only up to a little past the join.
        const to = z.kind === 'merge' ? Math.min(route.length, z.join[0] + 40) : z.at[1];
        const el = svg('path', { class: `dbg-zone dbg-${z.kind}`, d: routePath(route, z.at[0], to, 2) }, layer);
        const list = this.zones.get(z.key) ?? [];
        list.push(el);
        this.zones.set(z.key, list);
        const title = svg('title', {}, el);
        title.textContent = `${z.kind} ${route.def.id} × ${z.other.def.id}${z.yields ? ' (yields)' : ''}`;
      }
      for (const z of traffic.crosswalks.get(route)!) {
        svg('path', { class: 'dbg-crosswalk', d: routePath(route, z.at[0], z.at[1], 1) }, layer);
      }
    }
    this.labelLayer = svg('g', { class: 'dbg-labels' }, layer);
    this.fps = document.createElement('div');
    this.fps.className = 'dbg-fps';
    wrap.appendChild(this.fps);
  }

  setVisible(visible: boolean): void {
    this.layer.classList.toggle('is-visible', visible);
    this.fps.hidden = !visible;
  }

  render(traffic: Traffic, now: number): void {
    this.frames.push(now);
    while (this.frames.length && this.frames[0] < now - 1000) this.frames.shift();
    this.fps.textContent = `${this.frames.length} ${t('debug.fps')} · ${traffic.cars.length} 🚗`;

    for (const [key, els] of this.zones) {
      const claimed = (traffic.claims.get(key)?.size ?? 0) > 0;
      for (const el of els) el.classList.toggle('is-claimed', claimed);
    }
    const alive = new Set<number>();
    for (const car of traffic.cars) {
      alive.add(car.id);
      let label = this.labels.get(car.id);
      if (!label) {
        label = svg('text', { class: 'dbg-label' }, this.labelLayer);
        this.labels.set(car.id, label);
      }
      const { x, y } = carCentre(car);
      label.setAttribute('x', x.toFixed(1));
      label.setAttribute('y', (y - 12).toFixed(1));
      // ✓ = has claimed its way through the junction; ← why it is giving way.
      const reason = car.status === 'yield' && car.blocker ? ` ← ${car.blocker.why}` : '';
      const text = `${car.status}${reason}${car.cleared ? ' ✓' : ''}`;
      if (label.textContent !== text) label.textContent = text;
    }
    for (const [id, label] of this.labels) {
      if (!alive.has(id)) {
        label.remove();
        this.labels.delete(id);
      }
    }
  }
}

// ---------------------------------------------------------------- pedestrian countdown

/** Seconds of green left, shown next to each pedestrian signal while it is green. */
export class Countdowns {
  private items: { group: SVGGElement; text: SVGTextElement; light: number }[] = [];

  constructor(layer: SVGGElement, placements: SignalPlacement[]) {
    placements.forEach((p, light) => {
      const cx = p.x + SIGNAL_WIDTH / 2;
      const cy = p.y + SIGNAL_HEIGHT / 2;
      // Next to the housing, on the side away from its lamps' facing direction.
      const angle = ((p.rotate + 90) * Math.PI) / 180;
      const x = cx + Math.cos(angle) * 17;
      const y = cy + Math.sin(angle) * 17;
      const group = svg('g', { class: 'countdown', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, layer);
      svg('rect', { x: -8, y: -6.5, width: 16, height: 13, rx: 3 }, group);
      const text = svg('text', { x: 0, y: 4 }, group);
      this.items.push({ group, text, light });
    });
  }

  render(sim: Simulation): void {
    const snap = sim.snapshot();
    // The two lights of a crossing change together; look ahead once per crossing.
    const remaining = new Map<number, number | null>();
    for (const item of this.items) {
      const green = snap.pedestrians[item.light].green;
      item.group.classList.toggle('is-visible', green);
      if (!green) continue;
      const first = item.light < 2 ? 0 : 2;
      if (!remaining.has(first)) remaining.set(first, sim.nextChange('pedestrians', first));
      const left = remaining.get(first);
      const text = left === null || left === undefined ? '' : String(Math.ceil(left - 1e-6));
      if (item.text.textContent !== text) item.text.textContent = text;
    }
  }
}

// ---------------------------------------------------------------- signal tooltip

export class SignalTooltip {
  private tip: HTMLElement;
  private current: Signal | null = null;
  private last = 0;

  constructor(wrap: HTMLElement, signals: Signal[]) {
    this.tip = document.createElement('div');
    this.tip.className = 'signal-tip';
    this.tip.hidden = true;
    this.tip.setAttribute('role', 'tooltip');
    this.tip.id = 'signal-tip';
    wrap.appendChild(this.tip);
    for (const s of signals) {
      const show = () => {
        this.current = s;
        this.last = 0;
        this.tip.hidden = false;
        const { x, y } = s.placement;
        // Signals at the top edge get the tooltip below them instead of above.
        const below = y < 70;
        this.tip.classList.toggle('is-below', below);
        place(this.tip, x + SIGNAL_WIDTH / 2, below ? y + SIGNAL_HEIGHT : y);
      };
      const hide = () => {
        if (this.current === s) this.current = null;
        this.tip.hidden = true;
      };
      s.root.addEventListener('pointerenter', show);
      s.root.addEventListener('pointerleave', hide);
      s.root.addEventListener('focus', show);
      s.root.addEventListener('blur', hide);
    }
  }

  /** `held`: the controller is holding the clock, so nothing changes until traffic arrives. */
  render(sim: Simulation, held: boolean, now: number): void {
    const s = this.current;
    if (!s || now - this.last < 200) return;
    this.last = now;
    const { kind, id } = s.placement;
    const group = kind === 'vehicle' ? 'vehicles' : kind === 'pedestrian' ? 'pedestrians' : 'turns';
    const index = kind === 'vehicle' ? id - 1 : kind === 'pedestrian' ? id - 6 : id - 10;
    const lamps = lampKey(sim.snapshot()[group][index]);
    const next = sim.nextChange(group, index);
    const when = next === null ? t('signal.noChange') : held ? t('signal.held') : t('signal.change', { n: num(next, 0) });
    this.tip.innerHTML = `<strong>${tk(`signal.${kind}`, { n: id })}</strong><br><span class="lamp-name lamp-${lamps || 'off'}">${tk(`lamp.${lamps}`)}</span> · ${when}`;
  }
}

// ---------------------------------------------------------------- night and rain

/** Street lamps on the photo (near the poles), lighting the crosswalks at night. */
const STREET_LAMPS: [number, number][] = [
  [318, 340],
  [440, 380],
  [300, 205],
  [434, 100],
  [486, 120],
  [100, 120],
  [740, 470],
  [600, 330],
];

export class Environment {
  private overlay: SVGRectElement;
  private lamps: SVGGElement;
  private rain: HTMLElement;
  private clock: HTMLElement;
  private darknessLevel = -1;

  constructor(
    private wrap: HTMLElement,
    svgRoot: SVGSVGElement,
    overlayLayer: SVGGElement,
    private lightsLayer: SVGGElement,
  ) {
    svgRoot.querySelector('defs')!.insertAdjacentHTML(
      'beforeend',
      `<radialGradient id="street-lamp">
         <stop offset="0" stop-color="#ffd58a" stop-opacity="0.55"/>
         <stop offset="0.5" stop-color="#ffc56b" stop-opacity="0.2"/>
         <stop offset="1" stop-color="#ffc56b" stop-opacity="0"/>
       </radialGradient>`,
    );
    this.overlay = svg('rect', { class: 'night-overlay', width: SCENE_WIDTH, height: SCENE_HEIGHT }, overlayLayer);
    this.lamps = svg('g', { class: 'street-lamps' }, overlayLayer);
    for (const [x, y] of STREET_LAMPS) svg('circle', { cx: x, cy: y, r: 70, fill: 'url(#street-lamp)' }, this.lamps);

    this.rain = document.createElement('div');
    this.rain.className = 'rain';
    this.rain.innerHTML = '<div class="rain-layer rain-far"></div><div class="rain-layer rain-near"></div>';
    wrap.appendChild(this.rain);

    this.clock = document.createElement('div');
    this.clock.className = 'day-clock';
    this.clock.hidden = true;
    wrap.appendChild(this.clock);
  }

  /** 0 = day, 1 = night. */
  setDarkness(level: number): void {
    const rounded = Math.round(level * 100) / 100;
    if (rounded === this.darknessLevel) return;
    this.darknessLevel = rounded;
    this.overlay.style.opacity = String(rounded * 0.62);
    this.lamps.style.opacity = String(rounded);
    this.lightsLayer.style.opacity = String(Math.min(1, rounded * 1.4));
    this.wrap.classList.toggle('is-night', rounded > 0.5);
  }

  setRain(on: boolean): void {
    this.wrap.classList.toggle('is-rain', on);
  }

  setClock(text: string | null, night = false): void {
    this.clock.hidden = text === null;
    if (text !== null) {
      this.clock.textContent = `${night ? '☾' : '☀'} ${text}`;
      this.clock.title = t('clock.label');
    }
  }
}
