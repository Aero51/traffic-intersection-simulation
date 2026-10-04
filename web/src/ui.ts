// Page chrome around the intersection: the playback toolbar, the help and comparison
// dialogs, and a live region that announces signal changes to screen readers.

import { SPEEDS, type Store } from './settings';
import { applyLanguage, num, onLangChange, t, type StringKey } from './i18n';
import { CONTROL_STRATEGIES, type ControlStrategy } from './controller';
import type { BenchConfig, BenchResult } from './bench';
import type { BenchRequest } from './bench.worker';

const ICONS = {
  play: '<path d="M4 2.5v11l9-5.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M4.5 2.5v11M11.5 2.5v11" stroke-width="2.6"/>',
  step: '<path d="M3 2.5v11l7-5.5z" fill="currentColor" stroke="none"/><path d="M13 2.5v11" stroke-width="2"/>',
  stats: '<path d="M2 14h12M4 12V8M8 12V3M12 12V6" stroke-width="2"/>',
  help: '<circle cx="8" cy="8" r="6.3"/><path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3v.4" /><circle cx="8" cy="11.7" r="0.4" fill="currentColor"/>',
  enter: '<path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/>',
  exit: '<path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/>',
};

const icon = (path: string, cls = '') => `<svg viewBox="0 0 16 16" aria-hidden="true" class="${cls}">${path}</svg>`;

export interface ToolbarHandlers {
  onStep(): void;
  onHelp(): void;
}

/** Pause / speed / step / statistics / help / full screen, bottom left of the map. */
export function createToolbar(parent: HTMLElement, store: Store, handlers: ToolbarHandlers): void {
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.dataset.i18nAria = 'tool.label';
  bar.innerHTML = `
    <button type="button" class="tool" data-tool="play">${icon(ICONS.pause, 'i-pause')}${icon(ICONS.play, 'i-play')}</button>
    <button type="button" class="tool tool-speed" data-tool="speed" data-i18n-title="tool.speed" data-i18n-aria="tool.speed"></button>
    <button type="button" class="tool" data-tool="step" data-i18n-title="tool.step" data-i18n-aria="tool.step">${icon(ICONS.step)}</button>
    <button type="button" class="tool" data-tool="stats" data-i18n-title="tool.stats" data-i18n-aria="tool.stats">${icon(ICONS.stats)}</button>
    <button type="button" class="tool" data-tool="help" data-i18n-title="tool.help" data-i18n-aria="tool.help">${icon(ICONS.help)}</button>
    ${document.fullscreenEnabled ? `<button type="button" class="tool" data-tool="fullscreen">${icon(ICONS.enter, 'i-enter')}${icon(ICONS.exit, 'i-exit')}</button>` : ''}`;
  parent.appendChild(bar);
  applyLanguage(bar);

  const play = bar.querySelector<HTMLButtonElement>('[data-tool="play"]')!;
  const speed = bar.querySelector<HTMLButtonElement>('[data-tool="speed"]')!;
  const step = bar.querySelector<HTMLButtonElement>('[data-tool="step"]')!;
  const stats = bar.querySelector<HTMLButtonElement>('[data-tool="stats"]')!;
  const fullscreen = bar.querySelector<HTMLButtonElement>('[data-tool="fullscreen"]');

  bar.addEventListener('click', (e) => {
    const tool = (e.target as Element).closest<HTMLButtonElement>('[data-tool]')?.dataset.tool;
    const s = store.get();
    if (tool === 'play') store.set({ paused: !s.paused });
    else if (tool === 'speed') store.set({ speed: SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length] });
    else if (tool === 'step') handlers.onStep();
    else if (tool === 'stats') store.set({ stats: !s.stats });
    else if (tool === 'help') handlers.onHelp();
    else if (tool === 'fullscreen') toggleFullscreen();
  });

  const sync = () => {
    const s = store.get();
    play.classList.toggle('is-paused', s.paused);
    const label = t(s.paused ? 'tool.play' : 'tool.pause');
    play.title = label;
    play.setAttribute('aria-label', label);
    speed.textContent = `${num(s.speed, s.speed < 1 ? 1 : 0)}×`;
    step.disabled = !s.paused;
    stats.setAttribute('aria-pressed', String(s.stats));
    if (fullscreen) {
      const on = document.fullscreenElement !== null;
      fullscreen.classList.toggle('is-on', on);
      const fsLabel = t(on ? 'fullscreen.exit' : 'fullscreen.enter');
      fullscreen.title = fsLabel;
      fullscreen.setAttribute('aria-label', fsLabel);
    }
  };
  store.subscribe(sync);
  onLangChange(sync);
  document.addEventListener('fullscreenchange', sync);
  sync();
}

export function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return; // e.g. iPhone Safari
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function createDialog(cls: string, title: StringKey): { dialog: HTMLDialogElement; body: HTMLElement } {
  const dialog = document.createElement('dialog');
  dialog.className = `dialog ${cls}`;
  dialog.innerHTML = `
    <header class="dialog-head">
      <h2 data-i18n="${title}"></h2>
      <button type="button" class="dialog-close" data-i18n-aria="dialog.close" data-i18n-title="dialog.close">×</button>
    </header>
    <div class="dialog-body"></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
  // Click on the backdrop closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return { dialog, body: dialog.querySelector<HTMLElement>('.dialog-body')! };
}

const KEYS: [string, StringKey][] = [
  ['Space', 'key.space'],
  ['1 – 4', 'key.speed'],
  ['.', 'key.step'],
  ['T', 'key.walk'],
  ['E', 'key.emergency'],
  ['H', 'key.rush'],
  ['S', 'key.stats'],
  ['N', 'key.night'],
  ['R', 'key.rain'],
  ['M', 'key.sound'],
  ['D', 'key.debug'],
  ['F', 'key.fullscreen'],
  ['?', 'key.help'],
  ['Esc', 'key.escape'],
];

export function createHelpDialog(): { open(): void; toggle(): void } {
  const { dialog, body } = createDialog('help-dialog', 'help.title');
  body.innerHTML = `
    <p data-i18n="help.click"></p>
    <dl class="keys">${KEYS.map(([k, label]) => `<dt><kbd>${k}</kbd></dt><dd data-i18n="${label}"></dd>`).join('')}</dl>`;
  applyLanguage(dialog);
  return {
    open: () => dialog.showModal(),
    toggle: () => (dialog.open ? dialog.close() : dialog.showModal()),
  };
}

/** "Usporedi upravljanja": run each strategy in its own worker and show a results table. */
export function createBenchDialog(config: () => BenchConfig, onUse: (strategy: ControlStrategy) => void): { open(): void } {
  const { dialog, body } = createDialog('bench-dialog', 'bench.title');
  body.innerHTML = `
    <p class="bench-intro"></p>
    <div class="bench-controls">
      <label><span data-i18n="bench.minutes"></span>
        <select class="bench-minutes"><option>5</option><option selected>10</option><option>20</option><option>30</option></select>
      </label>
      <button type="button" class="menu-apply bench-run" data-i18n="bench.run"></button>
    </div>
    <table class="bench-table">
      <thead><tr>
        <th scope="col" data-i18n="bench.strategy"></th>
        <th scope="col" data-i18n="bench.avgWait"></th>
        <th scope="col" data-i18n="bench.maxWait"></th>
        <th scope="col" data-i18n="bench.throughput"></th>
        <th scope="col" data-i18n="bench.maxQueue"></th>
        <th scope="col" data-i18n="bench.pedWait"></th>
        <th scope="col"><span class="visually-hidden" data-i18n="bench.use"></span></th>
      </tr></thead>
      <tbody>${CONTROL_STRATEGIES.map((s) => `
        <tr data-strategy="${s}">
          <th scope="row" data-i18n="control.${s}"></th>
          <td colspan="5"><div class="bench-progress"><div></div></div></td>
          <td><button type="button" class="bench-use" data-i18n="bench.use" disabled></button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  applyLanguage(dialog);

  const intro = body.querySelector<HTMLElement>('.bench-intro')!;
  const minutes = body.querySelector<HTMLSelectElement>('.bench-minutes')!;
  const run = body.querySelector<HTMLButtonElement>('.bench-run')!;
  const showIntro = () => (intro.textContent = t('bench.intro', { n: minutes.value }));
  minutes.addEventListener('change', showIntro);
  onLangChange(showIntro);
  showIntro();

  let workers: Worker[] = [];
  let results: BenchResult[] = [];

  const row = (s: ControlStrategy) => body.querySelector<HTMLTableRowElement>(`tr[data-strategy="${s}"]`)!;

  function resetRows(): void {
    for (const s of CONTROL_STRATEGIES) {
      const r = row(s);
      r.querySelectorAll('td.result').forEach((td) => td.remove());
      let cell = r.querySelector<HTMLTableCellElement>('td[colspan]');
      if (!cell) {
        cell = document.createElement('td');
        cell.colSpan = 5;
        cell.innerHTML = '<div class="bench-progress"><div></div></div>';
        r.insertBefore(cell, r.lastElementChild);
      }
      cell.querySelector<HTMLElement>('.bench-progress > div')!.style.width = '0%';
      r.querySelector<HTMLButtonElement>('.bench-use')!.disabled = true;
      r.classList.remove('is-best');
    }
  }

  function showResults(): void {
    const best = (key: keyof BenchResult, higher = false) => {
      const values = results.map((r) => r[key] as number);
      return higher ? Math.max(...values) : Math.min(...values);
    };
    const bestWait = best('avgWait');
    for (const r of results) {
      const tr = row(r.strategy);
      tr.querySelector('td[colspan]')?.remove();
      const cells: [number, keyof BenchResult, boolean, number][] = [
        [r.avgWait, 'avgWait', false, 1],
        [r.maxWait, 'maxWait', false, 0],
        [r.throughput, 'throughput', true, 1],
        [r.maxQueue, 'maxQueue', false, 0],
        [r.pedAvgWait, 'pedAvgWait', false, 1],
      ];
      for (const [value, key, higher, digits] of cells) {
        const td = document.createElement('td');
        td.className = 'result';
        td.textContent = num(value, digits) + (key.includes('Wait') ? ' s' : '');
        if (Math.abs(value - best(key, higher)) < 1e-9) td.classList.add('is-best');
        tr.insertBefore(td, tr.lastElementChild);
      }
      tr.classList.toggle('is-best', Math.abs(r.avgWait - bestWait) < 1e-9);
      tr.querySelector<HTMLButtonElement>('.bench-use')!.disabled = false;
    }
  }

  run.addEventListener('click', () => {
    for (const w of workers) w.terminate();
    workers = [];
    results = [];
    resetRows();
    run.disabled = true;
    run.textContent = t('bench.running');
    const cfg = { ...config(), minutes: Number(minutes.value) };
    for (const strategy of CONTROL_STRATEGIES) {
      const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
      workers.push(worker);
      worker.onmessage = (e: MessageEvent<{ type: 'progress'; fraction: number } | { type: 'done'; result: BenchResult }>) => {
        if (e.data.type === 'progress') {
          row(strategy).querySelector<HTMLElement>('.bench-progress > div')!.style.width = `${(e.data.fraction * 100).toFixed(0)}%`;
          return;
        }
        results.push(e.data.result);
        worker.terminate();
        if (results.length === CONTROL_STRATEGIES.length) {
          run.disabled = false;
          run.textContent = t('bench.run');
          showResults();
        }
      };
      worker.postMessage({ config: cfg, strategy } satisfies BenchRequest);
    }
  });

  body.addEventListener('click', (e) => {
    const use = (e.target as Element).closest<HTMLButtonElement>('.bench-use');
    if (!use) return;
    onUse(use.closest<HTMLTableRowElement>('tr')!.dataset.strategy as ControlStrategy);
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    for (const w of workers) w.terminate();
    workers = [];
    if (results.length < CONTROL_STRATEGIES.length) {
      run.disabled = false;
      run.textContent = t('bench.run');
    }
  });

  return {
    open: () => {
      showIntro();
      dialog.showModal();
    },
  };
}

/** Polite live region: says when a road or crossing gets green. */
export function createAnnouncer(parent: HTMLElement): (key: StringKey) => void {
  const region = document.createElement('div');
  region.className = 'visually-hidden';
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('role', 'status');
  parent.appendChild(region);
  return (key) => {
    region.textContent = t(key);
  };
}
