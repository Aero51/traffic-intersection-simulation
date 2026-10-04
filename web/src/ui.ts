// Page chrome around the intersection: the playback toolbar, the help and comparison
// dialogs, and a live region that announces signal changes to screen readers.

import { SPEEDS, type Store } from './settings';
import { applyLanguage, num, onLangChange, t, type StringKey } from './i18n';

const ICONS = {
  play: '<path d="M4 2.5v11l9-5.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M4.5 2.5v11M11.5 2.5v11" stroke-width="2.6"/>',
  step: '<path d="M3 2.5v11l7-5.5z" fill="currentColor" stroke="none"/><path d="M13 2.5v11" stroke-width="2"/>',
  replay: '<path d="M8 3.2a5 5 0 1 1-4.6 3"/><path d="M3 2.2v4.2h4.2"/>',
  stats: '<path d="M2 14h12M4 12V8M8 12V3M12 12V6" stroke-width="2"/>',
  help: '<circle cx="8" cy="8" r="6.3"/><path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3v.4" /><circle cx="8" cy="11.7" r="0.4" fill="currentColor"/>',
  enter: '<path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/>',
  exit: '<path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/>',
};

const icon = (path: string, cls = '') => `<svg viewBox="0 0 16 16" aria-hidden="true" class="${cls}">${path}</svg>`;

export interface ToolbarHandlers {
  onStep(): void;
  onHelp(): void;
  onReplay(): void;
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
    <button type="button" class="tool" data-tool="replay" data-i18n-title="tool.replay" data-i18n-aria="tool.replay">${icon(ICONS.replay)}</button>
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
    else if (tool === 'replay') handlers.onReplay();
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

export interface ReplayBar {
  /** Show the bar for `frames` recorded frames, starting at `index`. */
  open(frames: number, index: number): void;
  close(): void;
  /** Move the thumb and label (seconds before now) without firing onSeek. */
  update(index: number, ago: number, playing: boolean): void;
}

/** Rewind bar above the toolbar: play/pause, a scrubber over the last minute, and "Live". */
export function createReplayBar(
  parent: HTMLElement,
  handlers: { onSeek(index: number): void; onTogglePlay(): void; onLive(): void },
): ReplayBar {
  const bar = document.createElement('div');
  bar.className = 'replay-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'group');
  bar.dataset.i18nAria = 'replay.label';
  bar.innerHTML = `
    <button type="button" class="tool" data-replay="play">${icon(ICONS.pause, 'i-pause')}${icon(ICONS.play, 'i-play')}</button>
    <input type="range" class="replay-range" min="0" max="0" step="1" value="0" data-i18n-aria="replay.scrub" />
    <span class="replay-time" aria-live="off"></span>
    <button type="button" class="replay-live" data-i18n="replay.live"></button>`;
  parent.appendChild(bar);
  applyLanguage(bar);

  const play = bar.querySelector<HTMLButtonElement>('[data-replay="play"]')!;
  const range = bar.querySelector<HTMLInputElement>('.replay-range')!;
  const time = bar.querySelector<HTMLElement>('.replay-time')!;
  range.addEventListener('input', () => handlers.onSeek(Number(range.value)));
  play.addEventListener('click', handlers.onTogglePlay);
  bar.querySelector('.replay-live')!.addEventListener('click', handlers.onLive);

  const setPlaying = (playing: boolean) => {
    play.classList.toggle('is-paused', !playing);
    const label = t(playing ? 'tool.pause' : 'tool.play');
    play.title = label;
    play.setAttribute('aria-label', label);
  };
  return {
    open(frames, index) {
      range.max = String(Math.max(0, frames - 1));
      range.value = String(index);
      bar.hidden = false;
    },
    close() {
      bar.hidden = true;
    },
    update(index, ago, playing) {
      range.value = String(index);
      time.textContent = `−${num(ago, 1)} s`;
      setPlaying(playing);
    },
  };
}

export function toggleFullscreen(): void {
  if (!document.fullscreenEnabled) return; // e.g. iPhone Safari
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

export function createDialog(cls: string, title: StringKey): { dialog: HTMLDialogElement; body: HTMLElement } {
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
  ['B', 'key.breakdown'],
  ['Y', 'key.replay'],
  ['H', 'key.rush'],
  ['S', 'key.stats'],
  ['C', 'key.charts'],
  ['O', 'key.analysis'],
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
