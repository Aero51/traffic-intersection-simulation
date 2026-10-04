// "Analiza raskrižja": two tools that run many headless simulations from the current set-up.
//  - Control comparison: the same traffic under each control strategy, side by side.
//  - Best timings: a search for the green split and cycle length with the shortest delay.
// Both run in web workers, so the page stays responsive.

import { createDialog } from './ui';
import { applyLanguage, num, onLangChange, t } from './i18n';
import { CONTROL_STRATEGIES, type ControlStrategy } from './controller';
import type { BenchConfig, BenchResult } from './bench';
import type { BenchRequest } from './bench.worker';
import type { Plan, SignalTiming } from './sim';
import { optimize, timingsFor, type OptimizeOutcome } from './optimizer';
import { BenchPool } from './pool';
import { benchCsv, downloadText, stamp } from './export';

export interface AnalysisHandlers {
  /** The current set-up (the dialog fills in the length of each run). */
  config(): BenchConfig;
  /** The control strategy in use. */
  strategy(): ControlStrategy;
  /** Switch to a control strategy (from the comparison). */
  onUse(strategy: ControlStrategy): void;
  /** Use these timings for a plan (from the search). */
  onApplyTimings(plan: Plan, timings: SignalTiming[]): void;
}

/** Share of the progress bar each pass of the search takes (by how much simulating it does). */
const STAGE_WEIGHT = { coarse: 0.35, fine: 0.55, verify: 0.1 } as const;
const STAGE_ORDER = ['coarse', 'fine', 'verify'] as const;

export function createAnalysisDialog(handlers: AnalysisHandlers): { open(): void } {
  const { dialog, body } = createDialog('analysis-dialog', 'analysis.title');
  body.innerHTML = `
    <section class="analysis-section">
      <h3 data-i18n="bench.title"></h3>
      <p class="bench-intro"></p>
      <div class="bench-controls">
        <label><span data-i18n="bench.minutes"></span>
          <select class="bench-minutes"><option>5</option><option selected>10</option><option>20</option><option>30</option></select>
        </label>
        <button type="button" class="menu-apply bench-run" data-i18n="bench.run"></button>
        <button type="button" class="chart-btn bench-csv" data-i18n="bench.csv" hidden></button>
      </div>
      <div class="table-scroll">
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
        </table>
      </div>
    </section>

    <section class="analysis-section opt">
      <h3 data-i18n="opt.title"></h3>
      <p data-i18n="opt.intro"></p>
      <div class="bench-controls">
        <button type="button" class="menu-apply opt-run" data-i18n="opt.run"></button>
        <button type="button" class="chart-btn opt-cancel" data-i18n="opt.cancel" hidden></button>
      </div>
      <div class="opt-progress" hidden>
        <div class="bench-progress"><div></div></div>
        <p class="opt-status" role="status"></p>
      </div>
      <p class="opt-error" role="alert" hidden></p>
      <div class="opt-result" hidden>
        <div class="table-scroll">
          <table class="bench-table opt-table">
            <thead><tr>
              <th scope="col"></th>
              <th scope="col" data-i18n="opt.col.main"></th>
              <th scope="col" data-i18n="opt.col.side"></th>
              <th scope="col" data-i18n="opt.col.cycle"></th>
              <th scope="col" data-i18n="opt.col.delay"></th>
              <th scope="col" data-i18n="bench.throughput"></th>
              <th scope="col" data-i18n="bench.pedWait"></th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <p class="opt-verdict"></p>
        <div class="bench-controls">
          <button type="button" class="menu-apply opt-apply" data-i18n="opt.apply"></button>
        </div>
      </div>
    </section>`;
  applyLanguage(dialog);

  // ---------------------------------------------------------------- control comparison

  const intro = body.querySelector<HTMLElement>('.bench-intro')!;
  const minutes = body.querySelector<HTMLSelectElement>('.bench-minutes')!;
  const run = body.querySelector<HTMLButtonElement>('.bench-run')!;
  const csv = body.querySelector<HTMLButtonElement>('.bench-csv')!;
  const showIntro = () => (intro.textContent = t('bench.intro', { n: minutes.value }));
  minutes.addEventListener('change', showIntro);
  onLangChange(showIntro);
  showIntro();

  let workers: Worker[] = [];
  let results: BenchResult[] = [];

  const row = (s: ControlStrategy) => body.querySelector<HTMLTableRowElement>(`tr[data-strategy="${s}"]`)!;

  function resetRows(): void {
    csv.hidden = true;
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
    csv.hidden = false;
  }

  function stopComparison(): void {
    for (const w of workers) w.terminate();
    workers = [];
    if (results.length < CONTROL_STRATEGIES.length) {
      run.disabled = false;
      run.textContent = t('bench.run');
    }
  }

  run.addEventListener('click', () => {
    stopComparison();
    results = [];
    resetRows();
    run.disabled = true;
    run.textContent = t('bench.running');
    const cfg = { ...handlers.config(), minutes: Number(minutes.value) };
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
  csv.addEventListener('click', () => downloadText(`control-comparison-${stamp()}.csv`, benchCsv(results)));

  // ---------------------------------------------------------------- best timings

  const optRun = body.querySelector<HTMLButtonElement>('.opt-run')!;
  const optCancel = body.querySelector<HTMLButtonElement>('.opt-cancel')!;
  const optProgress = body.querySelector<HTMLElement>('.opt-progress')!;
  const optBar = optProgress.querySelector<HTMLElement>('.bench-progress > div')!;
  const optStatus = body.querySelector<HTMLElement>('.opt-status')!;
  const optError = body.querySelector<HTMLElement>('.opt-error')!;
  const optResult = body.querySelector<HTMLElement>('.opt-result')!;
  const optBody = optResult.querySelector<HTMLTableSectionElement>('tbody')!;
  const optVerdict = body.querySelector<HTMLElement>('.opt-verdict')!;
  const optApply = body.querySelector<HTMLButtonElement>('.opt-apply')!;

  let pool: BenchPool | null = null;
  let controller: AbortController | null = null;
  let outcome: { result: OptimizeOutcome; plan: Plan } | null = null;

  function setSearching(on: boolean): void {
    optRun.disabled = on;
    optCancel.hidden = !on;
    optProgress.hidden = !on;
    if (on) {
      optResult.hidden = true;
      optError.hidden = true;
      optBar.style.width = '0%';
    }
  }

  function stopSearch(): void {
    controller?.abort();
    pool?.close();
    pool = null;
    controller = null;
  }

  const seconds = (v: number) => `${num(v, 1)} s`;

  function showOutcome(result: OptimizeOutcome, config: BenchConfig): void {
    const current = config.timings[config.plan];
    const cells = (label: string, main: number, side: number, cycle: number, r: BenchResult) => {
      const tr = document.createElement('tr');
      const head = document.createElement('th');
      head.scope = 'row';
      head.textContent = label;
      tr.appendChild(head);
      const values = [
        `${main} s`,
        `${side} s`,
        `${cycle} s`,
        seconds(r.delay),
        num(r.throughput, 1),
        config.pedestrianRate > 0 ? seconds(r.pedAvgWait) : '–',
      ];
      for (const v of values) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      return tr;
    };
    const best = result.best.candidate;
    optBody.replaceChildren(
      cells(t('opt.current'), current[0].open, current[4].open, current[0].open + current[0].closed + 3, result.baseline.result),
      cells(t('opt.best'), best.main, best.side, best.cycle, result.best.result),
    );
    optBody.lastElementChild!.classList.toggle('is-best', result.worthIt);
    const pct = num(Math.abs(result.improvement) * 100, 0);
    optVerdict.textContent = result.worthIt
      ? t('opt.verdict.better', { a: num(result.baseline.delay, 1), b: num(result.best.delay, 1), p: pct })
      : result.improvement >= 0
        ? t('opt.verdict.same', { p: pct })
        : t('opt.verdict.worse');
    optApply.hidden = result.improvement <= 0;
    optApply.disabled = false;
    optApply.textContent = t('opt.apply');
    optResult.hidden = false;
  }

  optRun.addEventListener('click', async () => {
    stopSearch();
    const config = handlers.config();
    const thisPool = (pool = new BenchPool());
    const thisController = (controller = new AbortController());
    setSearching(true);
    try {
      const result = await optimize(config, handlers.strategy(), (c, s) => thisPool.run(c, s), {
        signal: thisController.signal,
        onProgress: ({ stage, done, total }) => {
          const index = STAGE_ORDER.indexOf(stage);
          const before = STAGE_ORDER.slice(0, index).reduce((n, s) => n + STAGE_WEIGHT[s], 0);
          const fraction = Math.min(1, before + STAGE_WEIGHT[stage] * (total ? done / total : 0));
          optBar.style.width = `${(fraction * 100).toFixed(0)}%`;
          optStatus.textContent = `${t(`opt.stage.${stage}`)} (${t('opt.step', { i: index + 1, p: num(fraction * 100, 0) })})`;
        },
      });
      outcome = { result, plan: config.plan };
      showOutcome(result, config);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        optError.textContent = t('opt.error');
        optError.hidden = false;
      }
    } finally {
      if (pool === thisPool) {
        pool.close();
        pool = null;
        controller = null;
        setSearching(false);
      }
    }
  });
  optCancel.addEventListener('click', () => {
    stopSearch();
    setSearching(false);
  });
  optApply.addEventListener('click', () => {
    if (!outcome) return;
    handlers.onApplyTimings(outcome.plan, timingsFor(outcome.result.best.candidate));
    optApply.textContent = t('opt.applied');
    optApply.disabled = true;
  });

  // ---------------------------------------------------------------- shared

  body.addEventListener('click', (e) => {
    const use = (e.target as Element).closest<HTMLButtonElement>('.bench-use');
    if (!use) return;
    handlers.onUse(use.closest<HTMLTableRowElement>('tr')!.dataset.strategy as ControlStrategy);
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    stopComparison();
    stopSearch();
    setSearching(false);
  });

  return {
    open: () => {
      showIntro();
      dialog.showModal();
    },
  };
}
