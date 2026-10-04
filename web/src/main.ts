import './style.css';
import './features.css';
import './menu.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';
import { PLAN_TIMINGS, type SimSnapshot } from './sim';
import { createMenu } from './menu';
import { MAX_SPEED, type Traffic } from './traffic';
import { TRAFFIC_GROUPS } from './routes';
import { CarLayer, createCarDefs } from './cars';
import { PedestrianLayer } from './pedestrian-layer';
import { LoopLayer } from './loops';
import { applyLanguage, createLanguageSwitch, lang, onLangChange, t, type StringKey } from './i18n';
import { World } from './world';
import { DEFAULT_SETTINGS, SPEEDS, Store, readUrl, writeUrl, type Settings } from './settings';
import { DAY_MINUTES_PER_SECOND, MAX_BOOSTED_CARS, RUSH_FACTOR, RUSH_SECONDS, darkness, demandFactor, formatClock } from './day';
import { createAnnouncer, createHelpDialog, createToolbar, toggleFullscreen } from './ui';
import { createAnalysisDialog } from './analysis';
import { createStatsPanel } from './stats-panel';
import { createChartDialog } from './charts';
import { Countdowns, DebugLayer, Environment, FollowView, SignalTooltip } from './overlays';
import { Sound } from './sound';
import { checkTimings } from './safety';

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
  const followLayer = svgEl('g', { class: 'follow' }, svg);
  const pedestrianLayer = new PedestrianLayer(svgEl('g', { class: 'walkers' }, svg));
  const carGroup = svgEl('g', { class: 'cars' }, svg);
  // Night: darkens everything above, then lamps and car lights glow on top of it.
  const nightLayer = svgEl('g', { class: 'night' }, svg);
  const lightsLayer = svgEl('g', { class: 'lights' }, svg);
  const carLayer = new CarLayer(carGroup, lightsLayer);
  const debugGroup = svgEl('g', { class: 'debug' }, svg);

  const tipkalo = svgEl('foreignObject', {
    x: String(TIPKALO.x), y: String(TIPKALO.y), width: '80', height: '28', class: 'tipkalo-wrap',
  }, svg);
  tipkalo.innerHTML = '<button xmlns="http://www.w3.org/1999/xhtml" class="tipkalo" type="button"></button>';

  const layer = svgEl('g', { class: 'signals' }, svg);
  const signals = SIGNALS.map((p) => new Signal(layer, p));
  const countdownLayer = svgEl('g', { class: 'countdowns' }, svg);

  return { svg, signals, carGroup, carLayer, pedestrianLayer, loopLayer, followLayer, nightLayer, lightsLayer, debugGroup, countdownLayer };
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

// ---------------------------------------------------------------- state

const fromUrl = readUrl();
const store = new Store(fromUrl.settings);
const world = new World();
const { sim, traffic, pedestrians, controller, stats } = world;
// A shared link may carry timings that let both roads through at once: ignore those.
if (fromUrl.timings && checkTimings(fromUrl.timings.plan, fromUrl.timings.timings).length === 0) {
  sim.setPlanTimings(fromUrl.timings.plan, fromUrl.timings.timings);
}

/** Seconds of simulated time since the page loaded (pauses and speed applied). */
let clock = 0;
/** Simulated hour of the day, for the day cycle. */
let hour = 6;
let rushUntil = -1;
let darknessNow = 0;

// ---------------------------------------------------------------- page

const stage = document.createElement('div');
stage.className = 'stage';
document.getElementById('app')!.appendChild(stage);

const main = document.createElement('div');
main.className = 'main';
stage.appendChild(main);

const wrap = document.createElement('div');
wrap.className = 'scene-wrap';
main.appendChild(wrap);

const scene = buildScene(wrap, traffic);
const { svg, signals, carLayer, pedestrianLayer, loopLayer } = scene;
const follow = new FollowView(wrap, scene.followLayer);
const debug = new DebugLayer(scene.debugGroup, wrap, traffic);
const countdowns = new Countdowns(scene.countdownLayer, SIGNALS.filter((p) => p.kind === 'pedestrian'));
const tooltip = new SignalTooltip(wrap, signals);
const environment = new Environment(wrap, svg, scene.nightLayer, scene.lightsLayer);
const sound = new Sound();
const announce = createAnnouncer(main);

// Phones get a second, finger-sized Tipkalo below the map.
const phoneControls = document.createElement('div');
phoneControls.className = 'phone-controls';
phoneControls.innerHTML = '<button type="button" class="tipkalo"></button>';
main.appendChild(phoneControls);

const tipkala = [svg.querySelector<HTMLButtonElement>('.tipkalo')!, phoneControls.querySelector<HTMLButtonElement>('.tipkalo')!];
let tipkaloPending: boolean | null = null; // null: not drawn yet
for (const button of tipkala) button.addEventListener('click', pressTipkalo);

function pressTipkalo(): void {
  sim.requestPedestrians();
  // People only come to the kerb if the request was accepted (not in "Policajac" mode).
  if (sim.pedestrianRequestPending) pedestrians.call();
  renderTipkalo();
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

const vehicleSignals = signals.filter((s) => s.placement.kind === 'vehicle');
const menu = createMenu(main, {
  store,
  timing: (i) => sim.timing(i),
  onApply: (i, timing) => {
    sim.applyTiming(i, timing);
    scheduleUrl();
  },
  onDefaults: () => {
    sim.setPlanTimings(sim.plan, PLAN_TIMINGS[sim.plan]);
    scheduleUrl();
  },
  timeline: (preview) => {
    if (!preview) return sim.planTimeline();
    const c = sim.clone();
    c.applyTiming(preview.index, preview.timing);
    return c.planTimeline();
  },
  // The original scaled the selected signal to 2x (listenerPromjeneSemafora).
  onSelect: (i) => vehicleSignals.forEach((s, j) => s.setSelected(j === i)),
  trafficGroups: TRAFFIC_GROUPS,
  onRush: startRush,
  onEmergency: sendAmbulance,
  onCopyLink: copyLink,
  onResetAll: resetAll,
});

// Signals: keyboard-focusable (for the tooltip), and 1-5 open their timings.
signals.forEach((s) => {
  s.root.setAttribute('tabindex', '0');
  s.root.setAttribute('aria-describedby', 'signal-tip');
  if (s.placement.kind === 'vehicle') s.root.setAttribute('role', 'button');
});
vehicleSignals.forEach((s, i) => {
  s.root.addEventListener('click', () => menu.select(i));
  s.root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      menu.select(i);
    }
  });
});
function labelSignals(): void {
  for (const s of signals) s.root.setAttribute('aria-label', t(`signal.${s.placement.kind}` as StringKey, { n: s.placement.id }));
}

// Click a car to follow it; click anywhere else on the map to stop.
svg.addEventListener('click', (e) => {
  const target = e.target as Element;
  const carEl = target.closest<SVGGElement>('.car');
  if (carEl) {
    const car = traffic.cars.find((c) => c.id === Number(carEl.dataset.id)) ?? null;
    follow.follow(car);
    carLayer.setFollowed(car?.id ?? null);
  } else if (!target.closest('.signal, .tipkalo-wrap')) {
    follow.follow(null);
    carLayer.setFollowed(null);
  }
});

createLanguageSwitch(main);
const help = createHelpDialog();
const bench = createAnalysisDialog({
  config: () => ({
    plan: sim.plan,
    timings: { normal: sim.planTimings('normal'), secondary: sim.planTimings('secondary') },
    cars: { ...store.get().cars },
    pedestrianRate: store.get().pedestrians,
    options: { ...traffic.options },
    minutes: 10,
    seed: 20251004,
  }),
  strategy: () => controller.strategy,
  onUse: (strategy) => store.set({ control: strategy }),
  onApplyTimings: (plan, timings) => {
    sim.setPlanTimings(plan, timings);
    menu.refresh();
    scheduleUrl();
  },
});
createToolbar(main, store, { onStep: stepOnce, onHelp: help.open });
const charts = createChartDialog(stats);
const statsPanel = createStatsPanel(main, stats, store, { onCompare: bench.open, onCharts: charts.open });

// ---------------------------------------------------------------- actions

let stepRequested = false;
function stepOnce(): void {
  if (store.get().paused) stepRequested = true;
}

function startRush(): void {
  rushUntil = clock + RUSH_SECONDS;
}

function emergencyBusy(): boolean {
  return traffic.cars.some((c) => c.emergency);
}

/** Send an ambulance in on a random route (trying others if that entry is blocked). */
function sendAmbulance(): void {
  if (emergencyBusy()) return;
  const routes = [...traffic.routes].sort(() => Math.random() - 0.5);
  for (const route of routes) {
    if (traffic.spawnEmergency(route)) return;
  }
}

async function copyLink(): Promise<boolean> {
  const url = new URL(writeUrl(store.get(), sim.planTimings(), sim.plan, lang()), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    window.prompt(t('view.copy'), url);
    return false;
  }
}

function resetAll(): void {
  for (const plan of ['normal', 'secondary'] as const) sim.setPlanTimings(plan, PLAN_TIMINGS[plan]);
  store.set({ ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars } });
  rushUntil = -1;
  hour = 6;
  stats.reset();
  menu.refresh();
  scheduleUrl();
}

// ---------------------------------------------------------------- settings -> simulation

let urlTimer = 0;
function scheduleUrl(): void {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => history.replaceState(null, '', writeUrl(store.get(), sim.planTimings(), sim.plan, lang())), 300);
}

const URL_KEYS: (keyof Settings)[] = ['mode', 'control', 'cars', 'pedestrians', 'variety', 'drivers', 'dayCycle', 'night', 'weather'];

function applySettings(s: Settings, changed: Set<keyof Settings>): void {
  if (changed.has('mode')) sim.setMode(s.mode);
  if (changed.has('control')) {
    controller.strategy = s.control;
    // The induction loops are what the detector-based strategies listen to.
    loopLayer.setVisible(s.control !== 'fixed');
  }
  if (changed.has('pedestrians') || changed.has('mode')) pedestrians.rate = s.mode === 'flashing' ? 0 : s.pedestrians;
  if (changed.has('variety') || changed.has('drivers') || changed.has('weather')) {
    traffic.options = { variety: s.variety, drivers: s.drivers, grip: s.weather === 'rain' ? 0.65 : 1 };
  }
  if (changed.has('weather')) environment.setRain(s.weather === 'rain');
  if (changed.has('dayCycle') && s.dayCycle) hour = 6;
  if (changed.has('sound')) sound.setEnabled(s.sound);
  if (changed.has('debug')) debug.setVisible(s.debug);
  if (changed.has('paused')) {
    stage.classList.toggle('is-paused', s.paused);
    sound.setPaused(s.paused);
  }
  if (changed.has('speed')) stage.style.setProperty('--sim-speed', String(s.speed));
  if (changed.has('stats')) statsPanel.render();
  if (URL_KEYS.some((k) => changed.has(k))) scheduleUrl();
}
store.subscribe(applySettings);
applySettings(store.get(), new Set(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]));
menu.refresh();

document.addEventListener('visibilitychange', () => sound.setPaused(document.hidden || store.get().paused));

// ---------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : document.body;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') && e.key !== '?') return; // the dialog handles its own keys
  const s = store.get();
  const onButton = target instanceof HTMLButtonElement || target.getAttribute('role') === 'button';
  switch (e.key) {
    case ' ':
      if (onButton) return; // Space activates the focused button instead
      e.preventDefault();
      store.set({ paused: !s.paused });
      break;
    case '1': case '2': case '3': case '4':
      store.set({ speed: SPEEDS[Number(e.key) - 1] });
      break;
    case '.':
      stepOnce();
      break;
    case 'f': case 'F':
      toggleFullscreen();
      break;
    case 'n': case 'N':
      if (!s.dayCycle) store.set({ night: !s.night });
      break;
    case 'r': case 'R':
      store.set({ weather: s.weather === 'rain' ? 'dry' : 'rain' });
      break;
    case 'm': case 'M':
      store.set({ sound: !s.sound });
      break;
    case 'd': case 'D':
      store.set({ debug: !s.debug });
      break;
    case 's': case 'S':
      store.set({ stats: !s.stats });
      break;
    case 'c': case 'C':
      charts.toggle();
      break;
    case 'o': case 'O':
      bench.open();
      break;
    case 'e': case 'E':
      sendAmbulance();
      break;
    case 'h': case 'H':
      startRush();
      break;
    case 't': case 'T':
      pressTipkalo();
      break;
    case '?':
      help.toggle();
      break;
    case 'Escape':
      follow.follow(null);
      carLayer.setFollowed(null);
      break;
    default:
      return;
  }
});

// ---------------------------------------------------------------- announcements

let lastPhase: string | null = null;
let lastWalk = [false, false];
let lastPreempted = false;
function announceChanges(snap: SimSnapshot): void {
  const phase = sim.mode === 'flashing' ? 'flashing' : sim.greenPhase ?? (snap.vehicles.every((v) => v.red && !v.yellow) ? 'allRed' : lastPhase);
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase) announce(`announce.${phase}` as StringKey);
  }
  const walk = [snap.pedestrians[0].green, snap.pedestrians[2].green];
  if (walk[0] && !lastWalk[0]) announce('announce.pedMain');
  if (walk[1] && !lastWalk[1]) announce('announce.pedSide');
  lastWalk = walk;
  const preempted = sim.preempted !== null;
  if (preempted && !lastPreempted) announce('announce.emergency');
  lastPreempted = preempted;
}

// ---------------------------------------------------------------- frame loop

onLangChange(() => {
  tipkaloPending = null; // redraw the Tipkalo labels in the new language
  renderTipkalo();
  labelSignals();
  scheduleUrl();
});
applyLanguage();
labelSignals();
renderTipkalo();
render(signals, sim.snapshot());

let last = performance.now();
let lastStats = 0;

function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward through many cycles at once.
  const raw = Math.min((now - last) / 1000, 0.1);
  last = now;
  const s = store.get();
  let dt = s.paused ? 0 : raw * s.speed;
  if (stepRequested) {
    dt = 1 / 30;
    stepRequested = false;
  }

  if (dt > 0) {
    clock += dt;
    if (s.dayCycle) hour = (hour + (dt * DAY_MINUTES_PER_SECOND) / 60) % 24;
    // Car counts: the sliders, scaled by the time of day and a rush hour.
    const factor = (s.dayCycle ? demandFactor(hour) : 1) * (clock < rushUntil ? RUSH_FACTOR : 1);
    for (const g of TRAFFIC_GROUPS) traffic.setTarget(g.id, Math.min(MAX_BOOSTED_CARS, Math.round(s.cars[g.id] * factor)));
    // Large steps (4x speed) are split so the signal controller reacts in time.
    const parts = Math.ceil(dt / 0.05);
    for (let i = 0; i < parts; i++) world.step(dt / parts);
  }

  const snap = sim.snapshot();
  render(signals, snap);
  renderTipkalo();
  carLayer.render(traffic.cars);
  pedestrianLayer.render(pedestrians.walkers);
  if (s.control !== 'fixed') loopLayer.render(traffic.occupiedLoops(snap));
  if (!follow.render(traffic.cars, now)) carLayer.setFollowed(null);
  if (s.debug) debug.render(traffic, now);
  countdowns.render(sim);
  tooltip.render(sim, controller.held, now);
  announceChanges(snap);

  // Night: follows the clock with the day cycle, otherwise fades to the toggle.
  const targetDark = s.dayCycle ? darkness(hour) : s.night ? 1 : 0;
  darknessNow += Math.sign(targetDark - darknessNow) * Math.min(Math.abs(targetDark - darknessNow), raw * 0.8);
  if (s.dayCycle) darknessNow = targetDark;
  environment.setDarkness(darknessNow);
  environment.setClock(s.dayCycle ? formatClock(hour) : null, darkness(hour) > 0.5);

  const position = sim.mode === 'flashing' || sim.preempted ? null : sim.cyclePosition(0);
  menu.frame(position, { preempted: sim.preempted !== null, rush: clock < rushUntil, emergencyBusy: emergencyBusy() });

  if (now - lastStats > 250) {
    lastStats = now;
    statsPanel.render();
    charts.render();
  }
  if (s.sound) {
    const moving = traffic.cars.reduce((sum, c) => sum + c.v, 0);
    sound.update({
      walk: snap.pedestrians.some((p) => p.green),
      traffic: moving / (MAX_SPEED * 14),
      siren: traffic.cars.some((c) => c.emergency),
    });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Offline support and "install as app" (production builds only; the dev server reloads itself).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
