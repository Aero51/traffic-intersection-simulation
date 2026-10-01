// Croatian (original) and English UI text. Elements name their text with data attributes:
//   data-i18n="key"        -> textContent
//   data-i18n-title="key"  -> title
//   data-i18n-aria="k1 k2" -> aria-label (translations joined with spaces)
// so switching language just re-applies the dictionary to the page.

export type Lang = 'hr' | 'en';

const STRINGS = {
  'page.title': { hr: 'Simulacija semafora', en: 'Traffic light simulation' },
  'page.description': {
    hr: 'Simulacija rada semafora na raskrižju — Nikola Srdoč',
    en: 'Simulation of traffic lights at an intersection — Nikola Srdoč',
  },
  'scene.label': { hr: 'Raskrižje sa semaforima', en: 'Intersection with traffic lights' },
  'lang.label': { hr: 'Jezik', en: 'Language' },

  'tipkalo': { hr: 'Tipkalo', en: 'Walk' },
  'tipkalo.wait': { hr: 'Čekajte…', en: 'Wait…' },
  'tipkalo.long': { hr: 'Tipkalo — zahtjev za pješake', en: 'Pedestrian button — request to cross' },
  'tipkalo.longWait': { hr: 'Zahtjev primljen — čekajte zeleno', en: 'Request received — wait for green' },

  'menu': { hr: 'Izbornik', en: 'Menu' },
  'menu.mode': { hr: 'Mod rada', en: 'Operating mode' },
  'mode.normal': { hr: 'Glavni prednost', en: 'Main road priority' },
  'mode.secondary': { hr: 'Sporedni prednost', en: 'Side road priority' },
  'mode.flashing': { hr: 'Policajac', en: 'Flashing yellow' },
  'menu.auto': { hr: 'Automatski režim', en: 'Automatic mode' },
  'menu.auto.hint': {
    hr: 'Semafori se izmjenjuju samo kad vozilo čeka na crvenom (induktivna petlja)',
    en: 'Signals only change when a vehicle is waiting at a red light (induction loop)',
  },
  'menu.signal': { hr: 'Semafor:', en: 'Signal:' },
  'menu.open': { hr: 'Vrijeme otvorenosti:', en: 'Green time:' },
  'menu.closed': { hr: 'Vrijeme zatvorenosti:', en: 'Red time:' },
  'spinner.more': { hr: 'više', en: 'increase' },
  'spinner.less': { hr: 'manje', en: 'decrease' },
  'menu.apply': { hr: 'Prihvati', en: 'Apply' },
  'menu.traffic': { hr: 'Promet', en: 'Traffic' },
  'menu.traffic.unit': { hr: 'broj vozila', en: 'number of cars' },
  'traffic.count': { hr: '– broj vozila', en: '– number of cars' },

  'traffic.istok': { hr: 'Vozila istok', en: 'Cars from east' },
  'traffic.istok.desc': {
    hr: 'Vozila s istoka (glavna cesta, dolje desno)',
    en: 'Cars from the east (main road, bottom right)',
  },
  'traffic.sjever': { hr: 'Vozila sjever', en: 'Cars from north' },
  'traffic.sjever.desc': {
    hr: 'Vozila sa sjevera (sporedna cesta, gore desno)',
    en: 'Cars from the north (side road, top right)',
  },
  'traffic.zapad': { hr: 'Vozila zapad', en: 'Cars from west' },
  'traffic.zapad.desc': {
    hr: 'Vozila sa zapada (glavna cesta, gore lijevo)',
    en: 'Cars from the west (main road, top left)',
  },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

const STORAGE_KEY = 'raskrsce-lang';
let current: Lang = initialLang();
const listeners = new Set<(lang: Lang) => void>();

function initialLang(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'hr' || fromUrl === 'en') return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'hr' || saved === 'en') return saved;
  } catch {
    // Storage blocked (private mode etc.): fall back to the original language.
  }
  return 'hr';
}

export function lang(): Lang {
  return current;
}

export function t(key: StringKey): string {
  return STRINGS[key][current];
}

/** Switch language, update the page and remember the choice. */
export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered; still switches for this visit.
  }
  applyLanguage();
  for (const listener of listeners) listener(next);
}

export function onLangChange(listener: (lang: Lang) => void): void {
  listeners.add(listener);
}

/** Apply the current language to every annotated element (and the document itself). */
export function applyLanguage(root: ParentNode = document): void {
  document.documentElement.lang = current;
  document.title = t('page.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('page.description'));

  const tr = (keys: string) => keys.split(' ').map((k) => t(k as StringKey)).join(' ');
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n]')) el.textContent = tr(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n-title]')) el.setAttribute('title', tr(el.dataset.i18nTitle!));
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>('[data-i18n-aria]')) el.setAttribute('aria-label', tr(el.dataset.i18nAria!));
}

/** The HR | EN switch. */
export function createLanguageSwitch(parent: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'lang-switch';
  box.setAttribute('role', 'group');
  box.dataset.i18nAria = 'lang.label';
  box.innerHTML = (['hr', 'en'] as const)
    .map((l) => `<button type="button" data-lang="${l}" lang="${l}">${l.toUpperCase()}</button>`)
    .join('');
  parent.appendChild(box);

  const sync = () => {
    for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === current));
    }
  };
  box.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-lang]');
    if (button) setLang(button.dataset.lang as Lang);
  });
  onLangChange(sync);
  sync();
}
