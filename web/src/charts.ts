// "Grafikoni": the whole run as line charts. Three small panels share one time axis, each with
// its own scale (never a dual axis): cars per minute, average wait, and cars in the queue.
// Cars and pedestrians keep one colour each in every panel. Hover (or arrow keys) moves a
// crosshair through all panels and reads the values out; a table view and CSV download carry
// the same numbers without the chart.

import { createDialog } from './ui';
import { SERIES_EVERY, type Sample, type Stats } from './stats';
import { applyLanguage, num, onLangChange, t, type StringKey } from './i18n';
import { downloadText, seriesCsv, stamp, summaryCsv } from './export';
import { clockLabel, niceScale, timeTicks } from './chart-math';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Entity = 'cars' | 'peds';

interface SeriesSpec {
  entity: Entity;
  label: StringKey;
  value(sample: Sample): number | null;
}

interface PanelSpec {
  id: string;
  title: StringKey;
  /** Decimals in tooltips, end labels and the table. */
  decimals: number;
  /** Fill the area under the line (single-series panels only). */
  area: boolean;
  series: SeriesSpec[];
}

const PANELS: PanelSpec[] = [
  { id: 'flow', title: 'chart.flow', decimals: 1, area: true, series: [{ entity: 'cars', label: 'chart.cars', value: (s) => s.flow }] },
  {
    id: 'wait',
    title: 'chart.wait',
    decimals: 1,
    area: false,
    series: [
      { entity: 'cars', label: 'chart.cars', value: (s) => s.wait },
      { entity: 'peds', label: 'chart.peds', value: (s) => s.pedWait },
    ],
  },
  { id: 'queue', title: 'chart.queue', decimals: 0, area: true, series: [{ entity: 'cars', label: 'chart.cars', value: (s) => s.queue }] },
];

// Geometry in CSS pixels; the SVG is drawn at the real width of its container.
const HEIGHT = 108;
const MARGIN = { left: 36, right: 50, top: 8, bottom: 6, bottomLast: 22 };

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

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A drawn panel, kept so hover can move its crosshair without redrawing. */
interface Drawn {
  spec: PanelSpec;
  svg: SVGSVGElement;
  cross: SVGLineElement;
  dots: SVGCircleElement[];
  x(t: number): number;
  y(v: number): number;
  plotLeft: number;
  plotRight: number;
}

export function createChartDialog(stats: Stats): { open(): void; toggle(): void; render(): void } {
  const { dialog, body } = createDialog('chart-dialog', 'chart.title');
  body.innerHTML = `
    <div class="chart-bar">
      <p class="chart-note"></p>
      <div class="chart-actions">
        <button type="button" class="chart-btn" data-action="view"></button>
        <button type="button" class="chart-btn" data-action="series" data-i18n="chart.csv.series"></button>
        <button type="button" class="chart-btn" data-action="summary" data-i18n="chart.csv.summary"></button>
      </div>
    </div>
    <div class="chart-panels"></div>
    <div class="chart-table-wrap" hidden></div>`;
  applyLanguage(dialog);

  const panels = body.querySelector<HTMLElement>('.chart-panels')!;
  const tableWrap = body.querySelector<HTMLElement>('.chart-table-wrap')!;
  const note = body.querySelector<HTMLElement>('.chart-note')!;
  const showNote = () => (note.textContent = t('chart.note', { n: SERIES_EVERY }));
  showNote();
  const viewButton = body.querySelector<HTMLButtonElement>('[data-action="view"]')!;
  const tip = html('div', 'chart-tip');
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true'); // the table view and CSV carry the same numbers

  let view: 'chart' | 'table' = 'chart';
  let drawn: Drawn[] = [];
  let hover: number | null = null;
  let lastKey = '';

  const format = (spec: PanelSpec, v: number) => num(v, spec.decimals);

  function setView(next: 'chart' | 'table'): void {
    view = next;
    viewButton.textContent = t(view === 'chart' ? 'chart.table' : 'chart.charts');
    lastKey = '';
    render();
  }

  // ------------------------------------------------------------ hover

  function showHover(index: number | null, source?: Drawn): void {
    hover = index;
    const samples = stats.series;
    const sample = index === null ? null : samples[index];
    for (const d of drawn) {
      const on = sample !== null;
      d.cross.style.display = on ? '' : 'none';
      if (!sample) {
        d.dots.forEach((dot) => (dot.style.display = 'none'));
        continue;
      }
      const cx = d.x(sample.t);
      d.cross.setAttribute('x1', cx.toFixed(1));
      d.cross.setAttribute('x2', cx.toFixed(1));
      d.spec.series.forEach((s, i) => {
        const v = s.value(sample);
        const dot = d.dots[i];
        dot.style.display = v === null ? 'none' : '';
        if (v !== null) {
          dot.setAttribute('cx', cx.toFixed(1));
          dot.setAttribute('cy', d.y(v).toFixed(1));
        }
      });
    }
    if (!sample || !source) {
      tip.hidden = true;
      return;
    }
    // One tooltip, every series of the hovered panel: value first, name second.
    tip.replaceChildren(html('div', 'chart-tip-time', clockLabel(sample.t)));
    for (const s of source.spec.series) {
      const v = s.value(sample);
      const row = html('div', 'chart-tip-row');
      const key = el('svg', { class: 'chart-key', width: 14, height: 8, 'aria-hidden': 'true' });
      el('line', { x1: 1, x2: 13, y1: 4, y2: 4, class: `chart-line ${s.entity}` }, key);
      row.append(
        key,
        html('strong', 'chart-tip-value', v === null ? '–' : format(source.spec, v)),
        html('span', 'chart-tip-label', t(s.label)),
      );
      tip.appendChild(row);
    }
    tip.hidden = false;
    const box = panels.getBoundingClientRect();
    const svgBox = source.svg.getBoundingClientRect();
    const px = svgBox.left - box.left + source.x(sample.t);
    const flip = px > box.width * 0.6;
    tip.style.left = `${px + (flip ? -10 : 10)}px`;
    tip.style.top = `${svgBox.top - box.top + 4}px`;
    tip.classList.toggle('is-left', flip);
  }

  function nearest(samples: Sample[], seconds: number): number {
    let best = 0;
    for (let i = 1; i < samples.length; i++) {
      if (Math.abs(samples[i].t - seconds) < Math.abs(samples[best].t - seconds)) best = i;
    }
    return best;
  }

  // ------------------------------------------------------------ drawing

  function drawPanel(spec: PanelSpec, samples: Sample[], xMax: number, width: number, last: boolean): HTMLElement {
    const section = html('section', 'chart-panel');
    const head = html('div', 'chart-panel-head');
    head.appendChild(html('h3', 'chart-panel-title', t(spec.title)));
    if (spec.series.length > 1) {
      const legend = html('div', 'chart-legend');
      for (const s of spec.series) {
        const item = html('span', 'chart-legend-item');
        const key = el('svg', { class: 'chart-key', width: 16, height: 8, 'aria-hidden': 'true' });
        el('line', { x1: 1, x2: 15, y1: 4, y2: 4, class: `chart-line ${s.entity}` }, key);
        item.append(key, document.createTextNode(t(s.label)));
        legend.appendChild(item);
      }
      head.appendChild(legend);
    }
    section.appendChild(head);

    const bottom = last ? MARGIN.bottomLast : MARGIN.bottom;
    const height = HEIGHT + (last ? MARGIN.bottomLast - MARGIN.bottom : 0);
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = height - bottom;

    const values = spec.series.flatMap((s) => samples.map((p) => s.value(p)).filter((v): v is number => v !== null));
    const scale = niceScale(Math.max(0, ...values) * 1.05);
    const x = (sec: number) => plotLeft + (sec / xMax) * (plotRight - plotLeft);
    const y = (v: number) => plotBottom - (v / scale.max) * (plotBottom - plotTop);

    const svg = el('svg', {
      class: 'chart-svg',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      tabindex: 0,
      'aria-label': `${t(spec.title)}. ${t('chart.keys')}`,
    });
    section.appendChild(svg);

    // Gridlines (hairline, solid) with round y labels; the baseline is a touch stronger.
    for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
      el('line', { x1: plotLeft, x2: plotRight, y1: y(v), y2: y(v), class: v === 0 ? 'chart-axis' : 'chart-grid' }, svg).setAttribute(
        'shape-rendering',
        'crispEdges',
      );
      el('text', { x: plotLeft - 6, y: y(v) + 3.5, class: 'chart-tick chart-tick-y' }, svg).textContent = num(v, scale.step < 1 ? 1 : 0);
    }
    if (last) {
      for (const sec of timeTicks(xMax, Math.max(2, Math.floor((plotRight - plotLeft) / 70)))) {
        el('text', { x: x(sec), y: height - 5, class: 'chart-tick chart-tick-x' }, svg).textContent = clockLabel(sec);
      }
    }

    // Lines: 2px, one run per stretch of data (a gap where nothing was measured).
    const ends: { entity: Entity; cx: number; cy: number; text: string }[] = [];
    for (const s of spec.series) {
      const runs: [number, number][][] = [];
      let run: [number, number][] = [];
      for (const p of samples) {
        const v = s.value(p);
        if (v === null) {
          if (run.length) runs.push(run);
          run = [];
        } else {
          run.push([x(p.t), y(v)]);
        }
      }
      if (run.length) runs.push(run);
      for (const r of runs) {
        if (r.length === 1) {
          el('circle', { cx: r[0][0], cy: r[0][1], r: 2.5, class: `chart-dot-fill ${s.entity}` }, svg);
          continue;
        }
        const path = `M${r.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L')}`;
        if (spec.area)
          el(
            'path',
            {
              d: `${path} L${r[r.length - 1][0].toFixed(1)},${plotBottom} L${r[0][0].toFixed(1)},${plotBottom} Z`,
              class: `chart-area ${s.entity}`,
            },
            svg,
          );
        el('path', { d: path, class: `chart-line ${s.entity}` }, svg);
      }
      const end = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null;
      if (end) {
        const lastValue = [...samples]
          .reverse()
          .map((p) => s.value(p))
          .find((v) => v !== null)!;
        ends.push({ entity: s.entity, cx: end[0], cy: end[1], text: format(spec, lastValue) });
      }
    }
    // End dot (8px, with a 2px ring in the surface colour) and, if they don't collide, its value.
    const crowded = ends.some((a, i) => ends.some((b, j) => i !== j && Math.abs(a.cy - b.cy) < 13));
    for (const e of ends) {
      el('circle', { cx: e.cx, cy: e.cy, r: 4, class: `chart-dot ${e.entity}` }, svg);
      if (!crowded) el('text', { x: e.cx + 9, y: e.cy + 3.5, class: 'chart-end' }, svg).textContent = e.text;
    }

    // Hover layer: crosshair and one marker per series, hidden until used.
    const cross = el('line', { x1: 0, x2: 0, y1: plotTop, y2: plotBottom, class: 'chart-cross' }, svg);
    cross.style.display = 'none';
    const dots = spec.series.map((s) => {
      const dot = el('circle', { r: 4, class: `chart-dot ${s.entity}` }, svg);
      dot.style.display = 'none';
      return dot;
    });

    const d: Drawn = { spec, svg, cross, dots, x, y, plotLeft, plotRight };
    svg.addEventListener('pointermove', (e) => {
      const px = e.clientX - svg.getBoundingClientRect().left;
      showHover(nearest(stats.series, ((px - plotLeft) / (plotRight - plotLeft)) * xMax), d);
    });
    svg.addEventListener('pointerleave', () => {
      if (document.activeElement !== svg) showHover(null);
    });
    svg.addEventListener('focus', () => showHover(hover ?? stats.series.length - 1, d));
    svg.addEventListener('blur', () => showHover(null));
    svg.addEventListener('keydown', (e) => {
      const n = stats.series.length;
      const at = hover ?? n - 1;
      const next = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
      if (next === null) return;
      e.preventDefault();
      showHover(Math.min(n - 1, Math.max(0, next)), d);
    });
    drawn.push(d);
    return section;
  }

  function drawTable(): void {
    const table = html('table', 'chart-table');
    const head = table.createTHead().insertRow();
    for (const key of ['chart.time', 'chart.flow', 'chart.queue', 'chart.col.carWait', 'chart.col.pedWait'] as const) {
      head.appendChild(html('th', '', t(key))).setAttribute('scope', 'col');
    }
    const bodyEl = table.createTBody();
    for (const s of [...stats.series].reverse()) {
      const row = bodyEl.insertRow();
      row.append(
        html('th', '', clockLabel(s.t)),
        html('td', '', num(s.flow, 1)),
        html('td', '', num(s.queue, 0)),
        html('td', '', s.wait === null ? '–' : num(s.wait, 1)),
        html('td', '', s.pedWait === null ? '–' : num(s.pedWait, 1)),
      );
      row.firstElementChild!.setAttribute('scope', 'row');
    }
    tableWrap.replaceChildren(table);
  }

  function render(): void {
    if (!dialog.open) return;
    const samples = stats.series;
    const width = Math.max(280, Math.floor(panels.clientWidth || 600));
    // Charts only change when a new sample arrives (or the size, view or language does).
    const key = `${view}|${samples.length}|${samples[samples.length - 1]?.t}|${width}`;
    if (key === lastKey) return;
    lastKey = key;
    const keep = hover;

    panels.hidden = view !== 'chart';
    tableWrap.hidden = view !== 'table';
    drawn = [];
    panels.replaceChildren();
    tableWrap.replaceChildren();
    if (samples.length < 2) {
      (view === 'chart' ? panels : tableWrap).appendChild(html('p', 'chart-empty', t('chart.empty', { n: SERIES_EVERY })));
      return;
    }
    if (view === 'table') {
      drawTable();
      return;
    }
    const xMax = Math.max(60, samples[samples.length - 1].t);
    PANELS.forEach((spec, i) => panels.appendChild(drawPanel(spec, samples, xMax, width, i === PANELS.length - 1)));
    panels.appendChild(tip);
    if (keep !== null && keep < samples.length) showHover(keep, drawn[0]);
    else showHover(null);
  }

  body.addEventListener('click', (e) => {
    const action = (e.target as Element).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'view') setView(view === 'chart' ? 'table' : 'chart');
    else if (action === 'series') downloadText(`intersection-timeseries-${stamp()}.csv`, seriesCsv(stats));
    else if (action === 'summary') downloadText(`intersection-summary-${stamp()}.csv`, summaryCsv(stats));
  });
  dialog.addEventListener('close', () => showHover(null));
  onLangChange(() => {
    showNote();
    viewButton.textContent = t(view === 'chart' ? 'chart.table' : 'chart.charts');
    lastKey = '';
    render();
  });
  window.addEventListener('resize', render);
  viewButton.textContent = t('chart.table');

  const open = () => {
    lastKey = '';
    dialog.showModal();
    render();
  };
  return { open, toggle: () => (dialog.open ? dialog.close() : open()), render };
}
