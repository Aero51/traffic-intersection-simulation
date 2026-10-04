// "Izbornik": the sliding settings panel from GlavnaKlasa.start() (iphoneMenu group),
// now with three tabs: signal timings, traffic, and view options.

import { PRESETS } from './scenarios';
import { VEHICLE_COUNT, type SignalTiming, type Timeline } from './sim';
import { MAX_CARS, type TrafficSlider } from './routes';
import { CONTROL_STRATEGIES } from './controller';
import { analyzeTimeline, safeOpenRange, type SafetyIssue } from './safety';
import { MAX_PEDESTRIAN_RATE, type Settings, type Store } from './settings';
import { applyLanguage, onLangChange, t, type StringKey } from './i18n';

export interface MenuCallbacks {
  store: Store;
  /** Current timing of a vehicle signal (0-based index), to fill the spinners. */
  timing(index: number): SignalTiming;
  onSelect(index: number | null): void;
  onApply(index: number, timing: SignalTiming): void;
  /** Restore the current plan's default timings. */
  onDefaults(): void;
  /** Cycle diagram of the current plan, optionally with one signal's timing changed (preview). */
  timeline(preview?: { index: number; timing: SignalTiming }): Timeline | null;
  trafficGroups: TrafficSlider[];
  onRush(): void;
  onEmergency(): void;
  onBreakdown(): void;
  onCopyLink(): Promise<boolean>;
  onResetAll(): void;
  onPreset(id: string): void;
  onSaveScenario(): void;
  /** Load a scenario file's text; false if it is not a scenario. */
  onLoadScenario(text: string): boolean;
}

export interface Menu {
  /** Select a vehicle signal (0-based), e.g. after a click on the map, and open the menu. */
  select(index: number): void;
  /** Reload the spinners and diagram (timings or mode changed elsewhere). */
  refresh(): void;
  /** Per frame: playhead position in the cycle (s), or null when there is no cycle. */
  frame(position: number | null, state: { preempted: boolean; rush: boolean; emergencyBusy: boolean }): void;
}

const MIN_SECONDS = 1;
const MAX_SECONDS = 99;

const spinner = (name: string, label: StringKey, disabled = false) => `
  <div class="menu-row">
    <label for="menu-${name}" data-i18n="${label}"></label>
    <div class="spinner${disabled ? ' is-disabled' : ''}">
      <input id="menu-${name}" name="${name}" type="number" inputmode="numeric" ${disabled ? 'disabled' : ''} />
      <div class="spinner-buttons">
        <button type="button" data-step="1" data-for="${name}" data-i18n-aria="${label} spinner.more" ${disabled ? 'disabled' : ''}>+</button>
        <button type="button" data-step="-1" data-for="${name}" data-i18n-aria="${label} spinner.less" ${disabled ? 'disabled' : ''}>−</button>
      </div>
    </div>
  </div>`;

/** How far along its track a slider's thumb is, for the filled part of the track. */
const fill = (value: number, max: number) => `${((value / max) * 100).toFixed(1)}%`;

const slider = (id: string, label: StringKey, description: StringKey, unit: StringKey, max: number, value: number) => `
  <div class="menu-row menu-slider">
    <label for="traffic-${id}" data-i18n="${label}" data-i18n-title="${description}"></label>
    <input id="traffic-${id}" type="range" min="0" max="${max}" step="1" value="${value}"
      style="--p: ${fill(value, max)}" data-setting="${id}" data-i18n-aria="${description} ${unit}" />
    <output for="traffic-${id}">${value}</output>
  </div>`;

const check = (name: keyof Settings, label: StringKey, hint?: StringKey) => `
  <div class="menu-row">
    <label for="menu-${name}" data-i18n="${label}" ${hint ? `data-i18n-title="${hint}"` : ''}></label>
    <input id="menu-${name}" name="${name}" type="checkbox" class="menu-check" data-flag="${name}" />
  </div>`;

const TABS = ['signals', 'traffic', 'view'] as const;
const TAB_ICONS: Record<(typeof TABS)[number], string> = {
  signals:
    '<rect x="5" y="1.5" width="6" height="13" rx="3"/><circle cx="8" cy="5" r="0.9"/><circle cx="8" cy="8" r="0.9"/><circle cx="8" cy="11" r="0.9"/>',
  traffic:
    '<path d="M2 10.5V8.2l1.4-3h9.2l1.4 3v2.3"/><path d="M2 10.5h12"/><circle cx="5" cy="11.8" r="1.4"/><circle cx="11" cy="11.8" r="1.4"/>',
  view: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
};
type Tab = (typeof TABS)[number];

const SVG_NS = 'http://www.w3.org/2000/svg';
const TL_WIDTH = 300;
const TL_LABEL = 14;
const TL_ROW = 9;
const TL_GAP = 2;
const LAMP_FILL: Record<string, string> = { G: '#34c26a', Y: '#f5c518', R: '#e5484d', RY: 'url(#tl-ry)', '': '#2a323d', '*': '#f5c518' };

export function createMenu(parent: HTMLElement, cb: MenuCallbacks): Menu {
  const s0 = cb.store.get();
  const root = document.createElement('section');
  root.className = 'menu';
  root.innerHTML = `
    <button type="button" class="menu-header" aria-expanded="false" aria-controls="menu-body">
      <svg class="menu-logo" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="0.75" width="7" height="14.5" rx="3.5"/><circle cx="8" cy="4.4" r="1.15"/><circle cx="8" cy="8" r="1.15"/><circle cx="8" cy="11.6" r="1.15"/></svg>
      <span data-i18n="menu"></span>
      <svg class="menu-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 6.5L6 2l4.5 4.5"/></svg>
    </button>
    <form id="menu-body" class="menu-body">
      <div class="menu-tabs" role="tablist">
        ${TABS.map((tab) => `<button type="button" role="tab" id="tab-${tab}" aria-controls="panel-${tab}" data-tab="${tab}"><svg viewBox="0 0 16 16" aria-hidden="true">${TAB_ICONS[tab]}</svg><span data-i18n="tab.${tab}"></span></button>`).join('')}
      </div>

      <div class="menu-panel" role="tabpanel" id="panel-signals" aria-labelledby="tab-signals">
        <div class="menu-card">
          <div class="menu-row">
            <label for="menu-mode" data-i18n="menu.mode"></label>
            <select id="menu-mode" name="mode">
              <option value="normal" data-i18n="mode.normal"></option>
              <option value="secondary" data-i18n="mode.secondary"></option>
              <option value="flashing" data-i18n="mode.flashing"></option>
            </select>
          </div>
          <div class="menu-row">
            <label for="menu-control" data-i18n="menu.control" data-i18n-title="control.hint"></label>
            <select id="menu-control" name="control" data-i18n-title="control.hint">
              ${CONTROL_STRATEGIES.map((c) => `<option value="${c}" data-i18n="control.${c}"></option>`).join('')}
            </select>
          </div>
          ${spinner('signal', 'menu.signal')}
          ${spinner('open', 'menu.open')}
          ${spinner('closed', 'menu.closed', true)}
          <div class="menu-timeline">
            <svg class="timeline" viewBox="0 0 ${TL_WIDTH} ${5 * (TL_ROW + TL_GAP) + 12}" role="img" data-i18n-aria="timeline.aria"></svg>
            <div class="timeline-legend" data-i18n="timeline.legend"></div>
          </div>
          <div class="menu-toolbar">
            <button type="submit" class="menu-apply" data-i18n="menu.apply"></button>
            <button type="button" class="menu-apply menu-secondary" data-action="defaults" data-i18n="menu.defaults" data-i18n-title="menu.defaults.hint"></button>
          </div>
        </div>
      </div>

      <div class="menu-panel" role="tabpanel" id="panel-traffic" aria-labelledby="tab-traffic" hidden>
        <fieldset class="menu-card menu-traffic">
          <legend class="menu-row menu-subhead"><span data-i18n="menu.traffic"></span><span class="menu-unit" data-i18n="menu.traffic.unit"></span></legend>
          ${cb.trafficGroups.map((g) => slider(g.id, g.label, g.description, 'traffic.count', MAX_CARS, s0.cars[g.id])).join('')}
          ${slider('pedestrians', 'traffic.ped', 'traffic.ped.desc', 'traffic.ped.unit', MAX_PEDESTRIAN_RATE, s0.pedestrians)}
        </fieldset>
        <div class="menu-card">
          <div class="menu-row">
            <label for="menu-preset" data-i18n="preset.label" data-i18n-title="preset.hint"></label>
            <select id="menu-preset" data-preset data-i18n-title="preset.hint">
              <option value="" data-i18n="preset.choose"></option>
              ${PRESETS.map((p) => `<option value="${p.id}" data-i18n="preset.${p.id}"></option>`).join('')}
            </select>
          </div>
          ${check('variety', 'traffic.variety')}
          ${check('drivers', 'traffic.drivers', 'traffic.drivers.hint')}
          ${check('dayCycle', 'traffic.day', 'traffic.day.hint')}
          <div class="menu-toolbar">
            <button type="button" class="menu-apply" data-action="rush" data-i18n="traffic.rush" data-i18n-title="traffic.rush.hint"></button>
            <button type="button" class="menu-apply" data-action="breakdown" data-i18n="traffic.breakdown" data-i18n-title="traffic.breakdown.hint"></button>
            <button type="button" class="menu-apply menu-emergency" data-action="emergency" data-i18n="traffic.emergency" data-i18n-title="traffic.emergency.hint"></button>
          </div>
        </div>
      </div>

      <div class="menu-panel" role="tabpanel" id="panel-view" aria-labelledby="tab-view" hidden>
        <div class="menu-card">
          <div class="menu-row">
            <label for="menu-weather" data-i18n="view.weather"></label>
            <select id="menu-weather" name="weather">
              <option value="dry" data-i18n="weather.dry"></option>
              <option value="rain" data-i18n="weather.rain"></option>
            </select>
          </div>
          ${check('night', 'view.night')}
          ${check('sound', 'view.sound')}
          ${check('stats', 'view.stats')}
          ${check('debug', 'view.debug')}
          <div class="menu-toolbar">
            <button type="button" class="menu-apply" data-action="copy" data-i18n="view.copy" data-i18n-title="view.copy.hint"></button>
            <button type="button" class="menu-apply menu-secondary" data-action="reset" data-i18n="view.reset" data-i18n-title="view.reset.hint"></button>
          </div>
          <div class="menu-toolbar">
            <button type="button" class="menu-apply menu-secondary" data-action="save" data-i18n="file.save" data-i18n-title="file.save.hint"></button>
            <button type="button" class="menu-apply menu-secondary" data-action="load" data-i18n="file.load" data-i18n-title="file.load.hint"></button>
            <input type="file" accept="application/json,.json" data-scenario-file hidden />
          </div>
        </div>
      </div>
    </form>`;
  parent.appendChild(root);
  applyLanguage(root);

  const header = root.querySelector<HTMLButtonElement>('.menu-header')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const mode = form.querySelector<HTMLSelectElement>('#menu-mode')!;
  const control = form.querySelector<HTMLSelectElement>('#menu-control')!;
  const weather = form.querySelector<HTMLSelectElement>('#menu-weather')!;
  const svg = form.querySelector<SVGSVGElement>('.timeline')!;
  const legend = form.querySelector<HTMLElement>('.timeline-legend')!;
  const applyButton = form.querySelector<HTMLButtonElement>('.menu-apply[type="submit"]')!;
  const rushButton = form.querySelector<HTMLButtonElement>('[data-action="rush"]')!;
  const emergencyButton = form.querySelector<HTMLButtonElement>('[data-action="emergency"]')!;
  const copyButton = form.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const nightLabel = form.querySelector<HTMLLabelElement>('label[for="menu-night"]')!;
  const inputs = {
    signal: form.querySelector<HTMLInputElement>('#menu-signal')!,
    open: form.querySelector<HTMLInputElement>('#menu-open')!,
    closed: form.querySelector<HTMLInputElement>('#menu-closed')!,
  };
  inputs.signal.min = '1';
  inputs.signal.max = String(VEHICLE_COUNT);
  inputs.open.min = String(MIN_SECONDS);

  let selected = 0;
  let open = 0;
  let closed = 0;
  let expanded = false;
  let tab: Tab = 'signals';

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function show(): void {
    inputs.signal.value = String(selected + 1);
    inputs.open.value = String(open);
    inputs.closed.value = String(closed);
    drawTimeline();
  }

  function load(index: number): void {
    selected = index;
    ({ open, closed } = cb.timing(index));
    show();
    if (expanded) cb.onSelect(selected);
  }

  /**
   * Like the original listener on the open-time spinner: the closed time moves the
   * opposite way so the cycle length stays the same.
   */
  function setOpen(value: number): void {
    const total = open + closed;
    open = clamp(Math.round(value), MIN_SECONDS, Math.min(MAX_SECONDS, total - MIN_SECONDS));
    closed = total - open;
    show();
  }

  // ------------------------------------------------------------ timeline

  let timeline: Timeline | null = null;
  const playhead = document.createElementNS(SVG_NS, 'line');
  let preempted = false;
  /** Safety problem with the timings shown (or being previewed), as text; '' if none. */
  let warning = '';

  function renderLegend(): void {
    legend.classList.toggle('is-warning', warning !== '' && !preempted);
    if (!timeline) legend.textContent = t('timeline.flashing');
    else if (preempted) legend.textContent = t('timeline.preempted');
    else legend.textContent = warning || t('timeline.legend');
  }

  const seconds = (v: number) => String(Math.round(v * 10) / 10);

  /** Describe the first conflict and which green times would be safe for this signal. */
  function describe(issues: SafetyIssue[]): string {
    const first = issues[0];
    const vars = { from: seconds(first.from), to: seconds(first.to) };
    const what = t(first.kind === 'overlap' ? 'safety.overlap' : 'safety.tight', vars);
    const total = open + closed;
    const range = safeOpenRange(total, (o) => cb.timeline({ index: selected, timing: { open: o, closed: total - o } }), MAX_SECONDS);
    const hint = range ? t('safety.range', { n: selected + 1, min: range.min, max: range.max }) : t('safety.none');
    return `${what} ${hint}`;
  }

  function drawTimeline(): void {
    const current = cb.timing(selected);
    const pending = current.open !== open || current.closed !== closed;
    timeline = cb.timeline(pending ? { index: selected, timing: { open, closed } } : undefined);
    svg.replaceChildren();
    svg.insertAdjacentHTML(
      'afterbegin',
      `<defs><linearGradient id="tl-ry" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="#e5484d"/><stop offset="0.5" stop-color="#f5c518"/></linearGradient></defs>`,
    );
    svg.classList.toggle('is-preview', pending);
    if (!timeline) {
      warning = '';
      applyButton.disabled = false;
      applyButton.removeAttribute('title');
      renderLegend();
      return;
    }
    const issues = analyzeTimeline(timeline);
    warning = issues.length ? describe(issues) : '';
    // Unsafe timings can't be applied; Defaults and changing the value still work.
    applyButton.disabled = issues.length > 0;
    if (issues.length) applyButton.title = t('safety.blocked');
    else applyButton.removeAttribute('title');
    renderLegend();
    const scale = (TL_WIDTH - TL_LABEL) / timeline.cycle;
    timeline.rows.forEach((row, i) => {
      const y = i * (TL_ROW + TL_GAP);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', `tl-row${i === selected ? ' is-selected' : ''}`);
      g.innerHTML =
        `<text x="0" y="${y + TL_ROW - 1.5}" class="tl-label">${i + 1}</text>` +
        row
          .map(
            (seg) =>
              `<rect x="${(TL_LABEL + seg.from * scale).toFixed(2)}" y="${y}" width="${Math.max(0.5, (seg.to - seg.from) * scale).toFixed(2)}" height="${TL_ROW}" fill="${LAMP_FILL[seg.lamps] ?? '#ccc'}"><title>${seg.from.toFixed(0)}–${seg.to.toFixed(0)} s</title></rect>`,
          )
          .join('');
      svg.appendChild(g);
    });
    const axisY = 5 * (TL_ROW + TL_GAP) + 9;
    const ticks: string[] = [];
    const step = timeline.cycle > 60 ? 20 : timeline.cycle > 30 ? 10 : 5;
    for (let s = 0; s <= timeline.cycle; s += step) {
      ticks.push(`<text x="${(TL_LABEL + s * scale).toFixed(1)}" y="${axisY}" class="tl-tick">${s}</text>`);
    }
    ticks.push(`<text x="${TL_WIDTH}" y="${axisY}" class="tl-tick tl-end">${timeline.cycle} s</text>`);
    svg.insertAdjacentHTML('beforeend', ticks.join(''));
    for (const issue of issues) {
      const band = document.createElementNS(SVG_NS, 'rect');
      svg.appendChild(band);
      band.setAttribute('class', `tl-issue tl-issue-${issue.kind}`);
      band.setAttribute('x', (TL_LABEL + issue.from * scale).toFixed(2));
      band.setAttribute('y', '-1');
      band.setAttribute('width', Math.max(1.5, (issue.to - issue.from) * scale).toFixed(2));
      band.setAttribute('height', String(5 * (TL_ROW + TL_GAP) - 1));
    }
    playhead.setAttribute('class', 'tl-playhead');
    playhead.setAttribute('y1', '-1');
    playhead.setAttribute('y2', String(5 * (TL_ROW + TL_GAP) - 1));
    svg.appendChild(playhead);
  }

  // ------------------------------------------------------------ tabs and expand

  function setTab(next: Tab): void {
    tab = next;
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    for (const p of form.querySelectorAll<HTMLElement>('.menu-panel')) p.hidden = p.id !== `panel-${tab}`;
    cb.onSelect(expanded && tab === 'signals' ? selected : null);
  }

  function setExpanded(value: boolean): void {
    expanded = value;
    root.classList.toggle('is-open', value);
    header.setAttribute('aria-expanded', String(value));
    // Keep the hidden (slid-down) controls out of the tab order.
    form.inert = !value;
    cb.onSelect(value && tab === 'signals' ? selected : null);
  }

  header.addEventListener('click', () => setExpanded(!expanded));

  const tabList = form.querySelector<HTMLElement>('.menu-tabs')!;
  tabList.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-tab]');
    if (b) setTab(b.dataset.tab as Tab);
  });
  tabList.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = (TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[i]);
    form.querySelector<HTMLButtonElement>(`[data-tab="${TABS[i]}"]`)!.focus();
  });

  // ------------------------------------------------------------ controls -> store

  mode.addEventListener('change', () => cb.store.set({ mode: mode.value as Settings['mode'] }));
  control.addEventListener('change', () => cb.store.set({ control: control.value as Settings['control'] }));
  weather.addEventListener('change', () => cb.store.set({ weather: weather.value as Settings['weather'] }));

  form.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (box.type === 'checkbox' && box.dataset.flag) cb.store.set({ [box.dataset.flag]: box.checked } as Partial<Settings>);
  });

  form.addEventListener('click', (e) => {
    const target = e.target as Element;
    const button = target.closest<HTMLButtonElement>('button[data-step]');
    if (button) {
      const step = Number(button.dataset.step);
      if (button.dataset.for === 'signal') load(clamp(selected + step, 0, VEHICLE_COUNT - 1));
      if (button.dataset.for === 'open') setOpen(open + step);
      return;
    }
    const action = target.closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
    if (action === 'defaults') {
      cb.onDefaults();
      load(selected);
    } else if (action === 'rush') cb.onRush();
    else if (action === 'emergency') cb.onEmergency();
    else if (action === 'breakdown') cb.onBreakdown();
    else if (action === 'reset') cb.onResetAll();
    else if (action === 'save') cb.onSaveScenario();
    else if (action === 'load') scenarioFile.click();
    else if (action === 'copy') {
      cb.onCopyLink().then((ok) => {
        if (!ok) return;
        copyButton.textContent = t('view.copied');
        setTimeout(() => (copyButton.textContent = t('view.copy')), 1500);
      });
    }
  });

  const presetSelect = form.querySelector<HTMLSelectElement>('select[data-preset]')!;
  presetSelect.addEventListener('change', () => {
    if (presetSelect.value) cb.onPreset(presetSelect.value);
    presetSelect.value = '';
  });
  const scenarioFile = form.querySelector<HTMLInputElement>('input[data-scenario-file]')!;
  scenarioFile.addEventListener('change', async () => {
    const file = scenarioFile.files?.[0];
    scenarioFile.value = '';
    if (!file) return;
    const ok = cb.onLoadScenario(await file.text());
    if (!ok) window.alert(t('file.bad'));
  });

  inputs.signal.addEventListener('change', () => {
    const n = Number(inputs.signal.value);
    if (Number.isFinite(n)) load(clamp(Math.round(n) - 1, 0, VEHICLE_COUNT - 1));
    else show();
  });
  inputs.open.addEventListener('change', () => {
    const n = Number(inputs.open.value);
    if (Number.isFinite(n)) setOpen(n);
    else show();
  });

  form.addEventListener('input', (e) => {
    const range = e.target as HTMLInputElement;
    if (range.type !== 'range' || !range.dataset.setting) return;
    const value = Number(range.value);
    range.nextElementSibling!.textContent = range.value;
    range.style.setProperty('--p', fill(value, Number(range.max)));
    const key = range.dataset.setting;
    if (key === 'pedestrians') cb.store.set({ pedestrians: value });
    else cb.store.set({ cars: { ...cb.store.get().cars, [key]: value } });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cb.onApply(selected, { open, closed });
    drawTimeline();
  });

  // ------------------------------------------------------------ store -> controls

  function sync(s: Settings): void {
    mode.value = s.mode;
    control.value = s.control;
    control.disabled = s.mode === 'flashing';
    weather.value = s.weather;
    for (const box of form.querySelectorAll<HTMLInputElement>('input[data-flag]')) {
      box.checked = Boolean(s[box.dataset.flag as keyof Settings]);
    }
    // With the day cycle on, darkness follows the clock.
    const night = form.querySelector<HTMLInputElement>('#menu-night')!;
    night.disabled = s.dayCycle;
    nightLabel.textContent = t(s.dayCycle ? 'view.night.auto' : 'view.night');
    for (const range of form.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      const key = range.dataset.setting!;
      const value = key === 'pedestrians' ? s.pedestrians : s.cars[key];
      range.value = String(value);
      range.style.setProperty('--p', fill(value, Number(range.max)));
      range.nextElementSibling!.textContent = String(value);
    }
  }
  cb.store.subscribe((s, changed) => {
    sync(s);
    // After main.ts has switched the simulation to the new mode (it subscribes later).
    if (changed.has('mode')) queueMicrotask(() => load(selected));
  });
  onLangChange(() => {
    sync(cb.store.get());
    drawTimeline(); // also redraws the warning in the new language
    lastRush = lastPreempted = null; // redraw state-dependent labels on the next frame
  });

  form.inert = true;
  setTab('signals');
  sync(s0);
  load(0);

  let lastRush: boolean | null = null;
  let lastBusy: boolean | null = null;
  let lastPreempted: boolean | null = null;

  return {
    select(index: number) {
      if (tab !== 'signals') setTab('signals');
      load(index);
      if (!expanded) setExpanded(true);
    },
    refresh() {
      load(selected);
    },
    frame(position, state) {
      if (timeline && position !== null) {
        const x = TL_LABEL + (position / timeline.cycle) * (TL_WIDTH - TL_LABEL);
        playhead.setAttribute('x1', x.toFixed(2));
        playhead.setAttribute('x2', x.toFixed(2));
      }
      playhead.style.display = position === null ? 'none' : '';
      if (state.preempted !== lastPreempted) {
        lastPreempted = state.preempted;
        preempted = state.preempted;
        svg.classList.toggle('is-preempted', state.preempted);
        renderLegend();
      }
      if (state.rush !== lastRush) {
        lastRush = state.rush;
        rushButton.classList.toggle('is-active', state.rush);
        rushButton.textContent = t(state.rush ? 'traffic.rush.on' : 'traffic.rush');
      }
      if (state.emergencyBusy !== lastBusy) {
        lastBusy = state.emergencyBusy;
        emergencyButton.disabled = state.emergencyBusy;
      }
    },
  };
}
