// "Izbornik": the sliding settings panel from GlavnaKlasa.start() (iphoneMenu group).

import { VEHICLE_COUNT, type Mode, type SignalTiming } from './sim';
import { MAX_CARS_PER_MINUTE, type TrafficGroup } from './routes';

export interface MenuCallbacks {
  /** Current timing of a vehicle signal (0-based index), to fill the spinners. */
  timing(index: number): SignalTiming;
  onModeChange(mode: Mode): void;
  onSelect(index: number | null): void;
  onApply(index: number, timing: SignalTiming): void;
  /** Traffic sliders, applied immediately (no Prihvati needed). */
  trafficGroups: TrafficGroup[];
  onTrafficChange(groupId: string, carsPerMinute: number): void;
}

export interface Menu {
  /** Select a vehicle signal (0-based), e.g. after a click on the map, and open the menu. */
  select(index: number): void;
}

const MIN_SECONDS = 1;
const MAX_SECONDS = 99;

const spinner = (name: string, label: string, disabled = false) => `
  <div class="menu-row">
    <label for="menu-${name}">${label}</label>
    <div class="spinner${disabled ? ' is-disabled' : ''}">
      <input id="menu-${name}" name="${name}" type="number" inputmode="numeric" ${disabled ? 'disabled' : ''} />
      <div class="spinner-buttons">
        <button type="button" data-step="1" data-for="${name}" aria-label="${label} više" ${disabled ? 'disabled' : ''}>▲</button>
        <button type="button" data-step="-1" data-for="${name}" aria-label="${label} manje" ${disabled ? 'disabled' : ''}>▼</button>
      </div>
    </div>
  </div>`;

const slider = (g: TrafficGroup) => `
  <div class="menu-row menu-slider">
    <label for="traffic-${g.id}" title="${g.description}">${g.label}</label>
    <input id="traffic-${g.id}" type="range" min="0" max="${MAX_CARS_PER_MINUTE}" step="1" value="${g.initial}"
      data-group="${g.id}" aria-label="${g.description}, vozila po minuti" />
    <output for="traffic-${g.id}">${g.initial}</output>
  </div>`;

export function createMenu(parent: HTMLElement, cb: MenuCallbacks): Menu {
  const root = document.createElement('section');
  root.className = 'menu';
  root.innerHTML = `
    <button type="button" class="menu-header" aria-expanded="false" aria-controls="menu-body">Izbornik</button>
    <form id="menu-body" class="menu-body">
      <div class="menu-card">
        <div class="menu-row">
          <label for="menu-mode">Mod rada</label>
          <select id="menu-mode" name="mode">
            <option value="normal">Glavni prednost</option>
            <option value="secondary" disabled>Sporedni prednost</option>
            <option value="flashing">Policajac</option>
          </select>
        </div>
        ${spinner('signal', 'Semafor:')}
        ${spinner('open', 'Vrijeme otvorenosti:')}
        ${spinner('closed', 'Vrijeme zatvorenosti:', true)}
        <div class="menu-toolbar"><button type="submit" class="menu-apply">Prihvati</button></div>
      </div>
      <fieldset class="menu-card menu-traffic">
        <legend class="menu-row menu-subhead"><span>Promet</span><span class="menu-unit">vozila / min</span></legend>
        ${cb.trafficGroups.map(slider).join('')}
      </fieldset>
    </form>`;
  parent.appendChild(root);

  const header = root.querySelector<HTMLButtonElement>('.menu-header')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const mode = form.querySelector<HTMLSelectElement>('#menu-mode')!;
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

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function show(): void {
    inputs.signal.value = String(selected + 1);
    inputs.open.value = String(open);
    inputs.closed.value = String(closed);
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

  function setExpanded(value: boolean): void {
    expanded = value;
    root.classList.toggle('is-open', value);
    header.setAttribute('aria-expanded', String(value));
    // Keep the hidden (slid-down) controls out of the tab order.
    form.inert = !value;
    cb.onSelect(value ? selected : null);
  }

  header.addEventListener('click', () => setExpanded(!expanded));

  mode.addEventListener('change', () => {
    if (mode.value === 'normal' || mode.value === 'flashing') cb.onModeChange(mode.value);
  });

  form.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-step]');
    if (!button) return;
    const step = Number(button.dataset.step);
    if (button.dataset.for === 'signal') load(clamp(selected + step, 0, VEHICLE_COUNT - 1));
    if (button.dataset.for === 'open') setOpen(open + step);
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
    if (range.type !== 'range' || !range.dataset.group) return;
    range.nextElementSibling!.textContent = range.value;
    cb.onTrafficChange(range.dataset.group, Number(range.value));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cb.onApply(selected, { open, closed });
  });

  form.inert = true;
  load(0);

  return {
    select(index: number) {
      load(index);
      if (!expanded) setExpanded(true);
    },
  };
}
