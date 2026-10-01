import './style.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';
import { Simulation, type SimSnapshot } from './sim';
import { createMenu } from './menu';
import { Traffic } from './traffic';
import { ROUTE_DEFS, TRAFFIC_GROUPS } from './routes';
import { CarLayer, createCarDefs } from './cars';
import { Pedestrians } from './pedestrians';
import { PedestrianLayer } from './pedestrian-layer';
import { LoopLayer } from './loops';
import { applyLanguage, createLanguageSwitch, onLangChange, t } from './i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, parent: Element) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

function buildScene(container: HTMLElement, traffic: Traffic) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`,
    class: 'scene',
    role: 'img',
    'data-i18n-aria': 'scene.label',
  }, container);

  createSignalDefs(svg);
  createCarDefs(svg);
  svg.querySelector('defs')!.insertAdjacentHTML(
    'beforeend',
    `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
       <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
       <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
     </radialGradient>`,
  );

  // Background at native size (1003x581); the 900x500 viewBox crops it like the JavaFX stage did.
  svgEl('image', { href: '/raskrsce.webp', width: '1003', height: '581', class: 'photo' }, svg);
  svgEl('rect', { width: String(SCENE_WIDTH), height: String(SCENE_HEIGHT), fill: 'url(#vignette)', 'pointer-events': 'none' }, svg);

  const loopLayer = new LoopLayer(svgEl('g', { class: 'loops' }, svg), traffic.routes);
  const pedestrianLayer = new PedestrianLayer(svgEl('g', { class: 'walkers' }, svg));
  const carLayer = new CarLayer(svgEl('g', { class: 'cars' }, svg));

  const tipkalo = svgEl('foreignObject', {
    x: String(TIPKALO.x), y: String(TIPKALO.y), width: '80', height: '28', class: 'tipkalo-wrap',
  }, svg);
  tipkalo.innerHTML = '<button xmlns="http://www.w3.org/1999/xhtml" class="tipkalo" type="button"></button>';

  const layer = svgEl('g', { class: 'signals' }, svg);
  const signals = SIGNALS.map((p) => new Signal(layer, p));

  return { svg, signals, carLayer, pedestrianLayer, loopLayer };
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
stage.className = 'stage';
document.getElementById('app')!.appendChild(stage);

const main = document.createElement('div');
main.className = 'main';
stage.appendChild(main);

const sim = new Simulation();
const traffic = new Traffic(ROUTE_DEFS, TRAFFIC_GROUPS);
for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, g.initial);
const pedestrians = new Pedestrians();
const { svg, signals, carLayer, pedestrianLayer, loopLayer } = buildScene(main, traffic);
let automatic = false;

// Phones get a second, finger-sized Tipkalo below the map.
const phoneControls = document.createElement('div');
phoneControls.className = 'phone-controls';
phoneControls.innerHTML = '<button type="button" class="tipkalo"></button>';
main.appendChild(phoneControls);

const tipkala = [svg.querySelector<HTMLButtonElement>('.tipkalo')!, phoneControls.querySelector<HTMLButtonElement>('.tipkalo')!];
let tipkaloPending: boolean | null = null; // null: not drawn yet
for (const button of tipkala) {
  button.addEventListener('click', () => {
    sim.requestPedestrians();
    // People only come to the kerb if the request was accepted (not in "Policajac" mode).
    if (sim.pedestrianRequestPending) pedestrians.call();
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
    const [idle, waiting] = i === 0 ? (['tipkalo', 'tipkalo.wait'] as const) : (['tipkalo.long', 'tipkalo.longWait'] as const);
    button.textContent = t(pending ? waiting : idle);
  });
}
onLangChange(() => {
  tipkaloPending = null; // redraw the Tipkalo labels in the new language
  renderTipkalo();
});

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
    loopLayer.setVisible(enabled);
  },
});
vehicleSignals.forEach((s, i) => s.root.addEventListener('click', () => menu.select(i)));

createLanguageSwitch(main);
applyLanguage();
renderTipkalo();
render(signals, sim.snapshot());

let last = 0;
function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward through many cycles at once.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!automatic || signalsShouldRun(sim.snapshot())) sim.advance(dt);
  const snap = sim.snapshot();
  traffic.step(dt, snap);
  pedestrians.step(dt, snap);
  render(signals, snap);
  renderTipkalo();
  carLayer.render(traffic.cars);
  pedestrianLayer.render(pedestrians.walkers);
  if (automatic) loopLayer.render(traffic.occupiedLoops(snap));
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

last = performance.now();
requestAnimationFrame(frame);
