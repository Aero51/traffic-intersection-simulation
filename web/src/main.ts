import './style.css';
import { SCENE_HEIGHT, SCENE_WIDTH, SIGNALS, TIPKALO } from './layout';
import { Signal, createSignalDefs } from './signals';

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

const app = document.getElementById('app')!;
const { signals } = buildScene(app);

// Static preview of the state right after start-up: vehicle signals 1-4 green, 5 red,
// pedestrians red. The simulation clock replaces this in the next step.
for (const s of signals) {
  if (s.placement.kind === 'vehicle') s.set(s.id === 5 ? { red: { on: true } } : { green: { on: true } });
  if (s.placement.kind === 'pedestrian') s.set({ red: { on: true } });
}
