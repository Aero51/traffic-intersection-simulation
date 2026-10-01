import './style.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';
import { Simulation, type SimSnapshot } from './sim';

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildScene(container: HTMLElement): { svg: SVGSVGElement; signals: Signal[] } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`);
  svg.setAttribute('class', 'scene');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Raskrižje sa semaforima');
  container.appendChild(svg);

  createSignalDefs(svg);

  // Background at native size (1003x581); the 900x500 viewBox crops it like the JavaFX stage did.
  const bg = document.createElementNS(SVG_NS, 'image');
  bg.setAttribute('href', '/raskrsce.webp');
  bg.setAttribute('width', '1003');
  bg.setAttribute('height', '581');
  svg.appendChild(bg);

  const tipkalo = document.createElementNS(SVG_NS, 'foreignObject');
  tipkalo.setAttribute('x', String(TIPKALO.x));
  tipkalo.setAttribute('y', String(TIPKALO.y));
  tipkalo.setAttribute('width', '70');
  tipkalo.setAttribute('height', '28');
  tipkalo.innerHTML = '<button xmlns="http://www.w3.org/1999/xhtml" class="tipkalo" type="button">Tipkalo</button>';
  svg.appendChild(tipkalo);

  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'signals');
  svg.appendChild(layer);
  const signals = SIGNALS.map((p) => new Signal(layer, p));

  return { svg, signals };
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

const app = document.getElementById('app')!;
const { svg, signals } = buildScene(app);
const sim = new Simulation();

svg.querySelector('.tipkalo')!.addEventListener('click', () => sim.requestPedestrians());

let last = performance.now();
function frame(now: number): void {
  // Clamp so a backgrounded tab doesn't fast-forward through many cycles at once.
  sim.advance(Math.min((now - last) / 1000, 0.25));
  last = now;
  render(signals, sim.snapshot());
  requestAnimationFrame(frame);
}
render(signals, sim.snapshot());
requestAnimationFrame(frame);
