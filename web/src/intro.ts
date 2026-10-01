// Start screen ("pocetni" scene): title, author, walking pedestrians and the
// "Povuci za Start" slide lock. Unlocking flips to the intersection, like the
// FlipOutYTransition / FlipInYTransition pair in the original.

const UNLOCK_AT = 0.92; // fraction of the track the knob must reach

export function createIntro(parent: HTMLElement, onUnlock: () => void): HTMLElement {
  const root = document.createElement('section');
  root.className = 'intro';
  root.setAttribute('aria-label', 'Početni ekran');
  root.innerHTML = `
    <h1 class="intro-title">Simulacija semafora</h1>
    <img class="intro-walkers" src="/pjesaci.gif" alt="" width="200" height="406" />
    <p class="intro-author">Nikola Srdoč</p>
    <div class="slide-lock">
      <div class="slide-track">
        <span class="slide-text" aria-hidden="true">Povuci za Start</span>
        <button type="button" class="slide-knob" aria-label="Povuci za Start (ili pritisni Enter)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;
  parent.appendChild(root);

  const track = root.querySelector<HTMLElement>('.slide-track')!;
  const knob = root.querySelector<HTMLButtonElement>('.slide-knob')!;
  const text = root.querySelector<HTMLElement>('.slide-text')!;

  let dragging = false;
  let startX = 0;
  let progress = 0;
  let unlocked = false;

  const travel = () => track.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft;

  function setProgress(p: number): void {
    progress = Math.min(1, Math.max(0, p));
    knob.style.transform = `translateX(${progress * travel()}px)`;
    text.style.opacity = String(1 - Math.min(1, progress * 2.5));
  }

  function unlock(): void {
    if (unlocked) return;
    unlocked = true;
    setProgress(1);
    knob.disabled = true;
    onUnlock();
  }

  knob.addEventListener('pointerdown', (e) => {
    if (unlocked) return;
    dragging = true;
    startX = e.clientX - progress * travel();
    knob.setPointerCapture(e.pointerId);
    knob.classList.add('is-dragging');
  });
  knob.addEventListener('pointermove', (e) => {
    if (dragging) setProgress((e.clientX - startX) / travel());
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    knob.classList.remove('is-dragging');
    if (progress >= UNLOCK_AT) unlock();
    else setProgress(0); // springs back (CSS transition)
  };
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);

  // Keyboard: Enter/Space (button click) or arrow right unlocks.
  knob.addEventListener('click', (e) => {
    if (e.detail === 0) unlock(); // keyboard-generated click
  });
  knob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'End') unlock();
  });

  return root;
}
