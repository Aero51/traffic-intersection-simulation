import './style.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';
import { Simulation, type SimSnapshot } from './sim';
import { createMenu } from './menu';
import { createIntro } from './intro';
import { Traffic } from './traffic';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';
import { CarLayer } from './cars';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FLIP_MS = 800;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, parent: Element) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

function buildScene(container: HTMLElement) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`,
    class: 'scene',
    role: 'img',
    'aria-label': 'Raskrižje sa semaforima',
  }, container);

  createSignalDefs(svg);

  // Background at native size (1003x581); the 900x500 viewBox crops it like the JavaFX stage did.
  svgEl('image', { href: '/raskrsce.webp', width: '1003', height: '581' }, svg);

  const carLayer = new CarLayer(svgEl('g', { class: 'cars' }, svg));

  const tipkalo = svgEl('foreignObject', {
    x: String(TIPKALO.x), y: String(TIPKALO.y), width: '70', height: '28', class: 'tipkalo-wrap',
  }, svg);
  tipkalo.innerHTML = '<button xmlns="http://www.w3.org/1999/xhtml" class="tipkalo" type="button">Tipkalo</button>';

  const layer = svgEl('g', { class: 'signals' }, svg);
  const signals = SIGNALS.map((p) => new Signal(layer, p));

  return { svg, signals, carLayer };
}

function render(signals: Signal[], snap: SimSnapshot): void {
  // Ids 1-5 vehicles, 6-9 pedestrians, 10-12 turn arrows (see layout.ts).
  const lights = [...snap.vehicles, ...snap.pedestrians, ...snap.turns];
  signals.forEach((signal, i) => {
    const l = lights[i];
    signal.set({
      red: { on: l.red },
      yellow: { on: l.yellow, blinking: l.yellowBlinking },
      green: { on: l.green },
    });
  });
}

const stage = document.createElement('div');
stage.className = 'stage is-intro';
document.getElementById('app')!.appendChild(stage);

const main = document.createElement('div');
main.className = 'main';
stage.appendChild(main);

const { svg, signals, carLayer } = buildScene(main);
const sim = new Simulation();
const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS);
for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, g.initial);
let automatic = false;

// Phones get a second, finger-sized Tipkalo below the map.
const phoneControls = document.createElement('div');
phoneControls.className = 'phone-controls';
phoneControls.innerHTML = '<button type="button" class="tipkalo">Tipkalo — zahtjev za pješake</button>';
main.appendChild(phoneControls);

const tipkala = [svg.querySelector<HTMLButtonElement>('.tipkalo')!, phoneControls.querySelector<HTMLButtonElement>('.tipkalo')!];
const tipkaloLabels = ['Tipkalo', 'Tipkalo — zahtjev za pješake'];
let tipkaloPending = false;
for (const button of tipkala) {
  button.addEventListener('click', () => {
    sim.requestPedestrians();
    renderTipkalo();
  });
}

/** Like the "signal coming" lamp on a real push button: lit until pedestrians get green. */
function renderTipkalo(): void {
  const pending = sim.pedestrianRequestPending;
  if (pending === tipkaloPending) return;
  tipkaloPending = pending;
  tipkala.forEach((button, i) => {
    button.classList.toggle('is-requested', pending);
    button.textContent = pending ? (i === 0 ? 'Čekajte…' : 'Zahtjev primljen — čekajte zeleno') : tipkaloLabels[i];
  });
}

const vehicleSignals = signals.filter((s) => s.placement.kind === 'vehicle');
const menu = createMenu(main, {
  timing: (i) => sim.timing(i),
  onModeChange: (mode) => sim.setMode(mode),
  onApply: (i, timing) => sim.applyTiming(i, timing),
  // The original scaled the selected signal to 2x (listenerPromjeneSemafora).
  onSelect: (i) => vehicleSignals.forEach((s, j) => s.setSelected(j === i)),
  trafficGroups: TRAFFIC_GROUPS,
  onTrafficChange: (id, cars) => traffic.setTarget(id, cars),
  onAutoChange: (enabled) => {
    automatic = enabled;
  },
});
vehicleSignals.forEach((s, i) => s.root.addEventListener('click', () => menu.select(i)));

render(signals, sim.snapshot());

let last = 0;
function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward through many cycles at once.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!automatic || signalsShouldRun(sim.snapshot())) sim.advance(dt);
  const snap = sim.snapshot();
  traffic.step(dt, snap);
  render(signals, snap);
  renderTipkalo();
  carLayer.render(traffic.cars);
  requestAnimationFrame(frame);
}

/**
 * "Automatski režim" from the MVC version: the signal cycle holds while nobody is waiting,
 * and runs when an induction loop reports a car at a red light (or Tipkalo was pressed).
 * Yellow and red-yellow phases always finish so a signal never freezes mid-change.
 */
function signalsShouldRun(snap: SimSnapshot): boolean {
  const changing = snap.vehicles.some((v) => v.yellow && !v.yellowBlinking);
  return changing || sim.pedestrianRequestPending || traffic.waitingAtRed(snap);
}

function start(): void {
  last = performance.now();
  requestAnimationFrame(frame);
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const intro = createIntro(stage, () => {
  const flip = reducedMotion ? 0 : FLIP_MS;
  intro.classList.add('is-leaving');
  setTimeout(() => {
    intro.remove();
    stage.classList.remove('is-intro');
    if (flip) main.classList.add('is-entering');
    start();
    setTimeout(() => main.classList.remove('is-entering'), flip);
  }, flip);
});
