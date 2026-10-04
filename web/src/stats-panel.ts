// Statistics panel over the trees in the bottom-left corner of the photo.

import { HISTORY, type Stats } from './stats';
import { applyLanguage, num, onLangChange } from './i18n';
import type { Store } from './settings';

const SPARK_W = 60;
const SPARK_H = 16;

function sparkline(history: number[], max: number): string {
  if (history.length < 2) return '';
  const x = (i: number) => ((i + HISTORY - history.length) / (HISTORY - 1)) * SPARK_W;
  const y = (v: number) => SPARK_H - 1 - (v / max) * (SPARK_H - 2);
  const pts = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<polyline points="${pts}"/><polygon points="${x(0).toFixed(1)},${SPARK_H} ${pts} ${SPARK_W},${SPARK_H}"/>`;
}

export function createStatsPanel(
  parent: HTMLElement,
  stats: Stats,
  store: Store,
  handlers: { onCompare(): void; onCharts(): void },
): { render(): void } {
  const panel = document.createElement('section');
  panel.className = 'stats-panel';
  panel.setAttribute('aria-labelledby', 'stats-title');
  panel.innerHTML = `
    <header class="stats-head">
      <h2 id="stats-title" data-i18n="stats.title"></h2>
      <button type="button" class="stats-reset" data-i18n="stats.reset"></button>
      <button type="button" class="stats-close" data-i18n-aria="stats.close" data-i18n-title="stats.close">×</button>
    </header>
    <table>
      <thead><tr>
        <th scope="col" data-i18n="stats.approach"></th>
        <th scope="col" data-i18n="stats.flow" data-i18n-title="stats.flow.hint"></th>
        <th scope="col" data-i18n="stats.wait" data-i18n-title="stats.wait.hint"></th>
        <th scope="col" data-i18n="stats.queue" data-i18n-title="stats.queue.hint"></th>
        <th scope="col" data-i18n="stats.trend"></th>
      </tr></thead>
      <tbody>
        ${stats.approaches
          .map(
            (a) => `
          <tr data-id="${a.id}">
            <th scope="row" data-i18n="stats.${a.id}"></th>
            <td class="flow"></td><td class="wait"></td><td class="queue"></td>
            <td><svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true"></svg></td>
          </tr>`,
          )
          .join('')}
        <tr class="total"><th scope="row" data-i18n="stats.total"></th><td class="flow"></td><td class="wait"></td><td class="queue"></td><td></td></tr>
      </tbody>
    </table>
    <p class="stats-peds"><span data-i18n="stats.peds"></span>: <span class="ped-wait"></span></p>
    <p class="stats-peds"><span data-i18n="stats.co2"></span>: <span class="co2"></span></p>
    <div class="stats-buttons">
      <button type="button" class="stats-charts menu-apply" data-i18n="stats.charts"></button>
      <button type="button" class="stats-compare menu-apply" data-i18n="stats.compare"></button>
    </div>`;
  parent.appendChild(panel);
  applyLanguage(panel);

  panel.querySelector('.stats-close')!.addEventListener('click', () => store.set({ stats: false }));
  panel.querySelector('.stats-reset')!.addEventListener('click', () => {
    stats.reset();
    render();
  });
  panel.querySelector('.stats-compare')!.addEventListener('click', handlers.onCompare);
  panel.querySelector('.stats-charts')!.addEventListener('click', handlers.onCharts);

  const show = () => panel.classList.toggle('is-open', store.get().stats);
  store.subscribe(show);
  show();

  const pair = (a: number, b: number, digits = 0) => `${num(a, digits)} / ${num(b, digits)}`;

  function render(): void {
    if (!store.get().stats) return;
    const max = Math.max(4, ...stats.approaches.flatMap((a) => a.history));
    let flow = 0;
    let wait = 0;
    let passed = 0;
    let queue = 0;
    let maxWait = 0;
    for (const a of stats.approaches) {
      const row = panel.querySelector<HTMLTableRowElement>(`tr[data-id="${a.id}"]`)!;
      row.querySelector('.flow')!.textContent = num(stats.throughput(a), 1);
      row.querySelector('.wait')!.textContent = pair(stats.avgWait(a), a.maxWait);
      row.querySelector('.queue')!.textContent = pair(a.queue, a.maxQueue);
      row.querySelector('.spark')!.innerHTML = sparkline(a.history, max);
      flow += stats.throughput(a);
      wait += a.totalWait;
      passed += a.passed;
      queue += a.queue;
      maxWait = Math.max(maxWait, a.maxWait);
    }
    const total = panel.querySelector<HTMLTableRowElement>('tr.total')!;
    total.querySelector('.flow')!.textContent = num(flow, 1);
    total.querySelector('.wait')!.textContent = pair(passed ? wait / passed : 0, maxWait);
    total.querySelector('.queue')!.textContent = pair(queue, stats.maxTotalQueue);
    panel.querySelector('.ped-wait')!.textContent = stats.pedCount
      ? `${pair(stats.pedTotalWait / stats.pedCount, stats.pedMaxWait)} s`
      : '–';
    const { co2, idleLitres, litres } = stats.emissions;
    panel.querySelector('.co2')!.textContent = `${num(co2, 1)} (${num(litres ? (idleLitres / litres) * 100 : 0, 0)} %)`;
  }
  onLangChange(render);
  return { render };
}
