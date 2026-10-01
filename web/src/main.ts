import './style.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';
import { Simulation, type SimSnapshot } from './sim';
import { createMenu } from './menu';
import { createIntro } from './intro';
import { Traffic } from './traffic';
import { LANE_SPAWN, ROUTE_DEFS } from './routes';
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
const traffic = new Traffic(ROUTE_DEFS, LANE_SPAWN);

// Phones get a second, finger-sized Tipkalo below the map.
const phoneControls = document.createElement('div');
phoneControls.className = 'phone-controls';
phoneControls.innerHTML = '<button type="button" class="tipkalo">Tipkalo — zahtjev za pješake</button>';
main.appendChild(phoneControls);

for (const button of [svg.querySelector('.tipkalo')!, phoneControls.querySelector('.tipkalo')!]) {
  button.addEventListener('click', () => sim.requestPedestrians());
}

const vehicleSignals = signals.filter((s) => s.placement.kind === 'vehicle');
const menu = createMenu(main, {
  timing: (i) => sim.timing(i),
  onModeChange: (mode) => sim.setMode(mode),
  onApply: (i, timing) => sim.applyTiming(i, timing),
  // The original scaled the selected signal to 2x (listenerPromjeneSemafora).
  onSelect: (i) => vehicleSignals.forEach((s, j) => s.setSelected(j === i)),
});
vehicleSignals.forEach((s, i) => s.root.addEventListener('click', () => menu.select(i)));

render(signals, sim.snapshot());

let last = 0;
function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward through many cycles at once.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  sim.advance(dt);
  const snap = sim.snapshot();
  traffic.step(dt, snap);
  render(signals, snap);
  carLayer.render(traffic.cars);
  requestAnimationFrame(frame);
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
