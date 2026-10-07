// Touch controls. Every button feeds the same key names as the keyboard (main.ts keyDown/keyUp),
// so phones get the full game: analog steering pad, pedals, every vice, the phone, the menus, even 666.

export interface TouchApi {
  down(k: string): void;
  up(k: string): void;
  /** analog steering, −1..1; null = released */
  steer(v: number | null): void;
  mode(): string;
  ringing(): boolean;
  /** iOS only unlocks audio on touchend/click, not pointerdown */
  unlockAudio(): void;
}

export const isTouch = () => document.body.classList.contains('touch');

/** capture can fail for a pointer the browser already let go of; the button still works without it */
const capture = (e: Element, id: number) => {
  try {
    e.setPointerCapture(id);
  } catch {}
};
/** eating touchstart stops the compat click, which otherwise lands on whatever screen the press just opened
 *  (tap ⏸ → pause screen appears under the finger → its click unpauses) */
const noCompat = (e: Element) => e.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });

const el = (tag: string, cls: string, html = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
};

/** a press-and-hold button that maps to a key */
function keyBtn(api: TouchApi, k: string, cls: string, html: string) {
  const b = el('div', `tb ${cls}`, html);
  let id = -1;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (id !== -1) return;
    id = e.pointerId;
    capture(b, id);
    b.classList.add('on');
    navigator.vibrate?.(8);
    api.down(k);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    e.stopPropagation();
    id = -1;
    b.classList.remove('on');
    api.up(k);
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  noCompat(b);
  return b;
}

/** tap = press + release (menus, toggles) */
const tap = (api: TouchApi, k: string) => {
  api.down(k);
  api.up(k);
};

export function initTouch(api: TouchApi) {
  const enable = () => {
    if (isTouch()) return;
    document.body.classList.add('touch');
    relabel();
  };
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) enable();
  addEventListener('pointerdown', (e) => e.pointerType === 'touch' && enable(), { capture: true });

  // first tap: go fullscreen + landscape where the browser allows it (Android; iOS ignores this)
  let fs = false;
  addEventListener(
    'pointerup',
    () => {
      api.unlockAudio();
      if (fs || !isTouch()) return;
      fs = true;
      document.documentElement
        .requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    },
    { capture: true },
  );
  addEventListener('touchend', () => api.unlockAudio(), { passive: true });
  // no pinch zoom, no double-tap zoom, no pull-to-refresh, no long-press menu
  addEventListener('touchmove', (e) => !(e.target as HTMLElement).closest?.('.tscroll') && e.preventDefault(), { passive: false });
  addEventListener('contextmenu', (e) => isTouch() && e.preventDefault());

  // ---- in-car controls
  const pad = el('div', 'tpad');
  pad.id = 'touch';

  // steering: drag left/right anywhere in the zone; the wheel follows the thumb
  const steer = el('div', 'tsteer', '<div class="tring"><div class="tknob"></div></div><span>STEER</span>');
  const knob = steer.querySelector('.tknob') as HTMLElement;
  let sid = -1, sx = 0;
  const RANGE = 70;
  steer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sid !== -1) return;
    sid = e.pointerId;
    sx = e.clientX;
    capture(steer, sid);
    steer.classList.add('on');
    api.steer(0);
  });
  steer.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    const v = Math.max(-1, Math.min(1, (e.clientX - sx) / RANGE));
    // a small dead zone, then a gentle curve so lane changes don't need surgeon thumbs
    const c = Math.sign(v) * Math.max(0, (Math.abs(v) - 0.06) / 0.94) ** 1.3;
    api.steer(c);
    knob.style.transform = `translateX(${v * 40}px) rotate(${v * 90}deg)`;
  });
  const steerEnd = (e: PointerEvent) => {
    if (e.pointerId !== sid) return;
    sid = -1;
    steer.classList.remove('on');
    knob.style.transform = '';
    api.steer(null);
  };
  steer.addEventListener('pointerup', steerEnd);
  steer.addEventListener('pointercancel', steerEnd);
  noCompat(steer);

  const pedals = el('div', 'tpedals');
  pedals.append(keyBtn(api, 's', 'tbrake', 'BRAKE'), keyBtn(api, 'w', 'tgas', 'GAS'));

  const acts = el('div', 'tacts');
  acts.append(
    keyBtn(api, 'b', '', '🍺<small>BEER</small>'),
    keyBtn(api, 'c', '', '🚬<small>CIG</small>'),
    keyBtn(api, 'g', '', '💪<small>FLEX</small>'),
    keyBtn(api, 'q', '', '🖐️<small>WINDOW</small>'),
    keyBtn(api, 'f', '', '📯<small>HONK</small>'),
    keyBtn(api, 'h', 'thy', '🤘<small>HELL YEAH</small>'),
  );

  const sys = el('div', 'tsys');
  sys.append(
    keyBtn(api, 'r', '', '📻'),
    keyBtn(api, 'v', '', '🎨'),
    keyBtn(api, 't', '', '🌴'),
    keyBtn(api, 'm', '', '🔇'),
    keyBtn(api, 'p', '', '⏸'),
  );

  const phone = keyBtn(api, 'e', 'tphone', '📞<small>ANSWER</small>');

  pad.append(steer, pedals, acts, sys, phone);
  document.body.append(pad);

  // the secret: tap the wanted stars three times (6, 6, 6)
  const wanted = document.querySelector('.wanted') as HTMLElement | null;
  wanted?.addEventListener('pointerdown', (e) => {
    if (!isTouch()) return;
    e.stopPropagation();
    tap(api, '6');
  });

  // ---- menus: tap targets for everything that says "press"
  const title = document.querySelector('.title-wrap .start') as HTMLElement;
  const tmenu = el('div', 'tmenu');
  for (const [k, label] of [['k', '🎭 MASK'], ['u', '📼 MIXTAPE'], ['t', '🌴 THEME'], ['v', '🎨 GRAPHICS']] as const) {
    const b = el('button', '', label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      tap(api, k);
    });
    tmenu.append(b);
  }
  title.after(tmenu);
  // a screen only takes taps once it has been up for a moment, so the tap that opened it can't also close it
  const settled = (id: string, ms = 400) => {
    const e = document.getElementById(id)!;
    let since = 0;
    new MutationObserver(() => (since = e.classList.contains('show') ? performance.now() : 0)).observe(e, { attributes: true, attributeFilter: ['class'] });
    return (fn: () => void) => e.addEventListener('click', () => since && performance.now() - since > ms && fn());
  };
  title.addEventListener('click', () => api.mode() === 'title' && tap(api, 'enter'));
  for (const id of ['obit', 'busted', 'results']) settled(id, 600)(() => tap(api, 'enter'));
  settled('pause')(() => api.mode() === 'paused' && tap(api, 'p'));

  const rotate = el('div', '', '<div>📱↻</div><p>turn it sideways.<br/>the forearm needs room.</p>');
  rotate.id = 'rotate';
  document.body.append(rotate);

  // show the in-car pad only while driving; the phone button only while it rings
  setInterval(() => {
    document.body.dataset.state = api.mode();
    phone.classList.toggle('show', api.ringing());
  }, 120);
}

/** swap keyboard prompts for touch ones */
function relabel() {
  const set = (sel: string, html: string) => document.querySelectorAll(sel).forEach((e) => (e.innerHTML = html));
  set('#press', 'TAP TO ACKNOWLEDGE THAT YOU ARE NOT HIM');
  set('.title-wrap .start', '<b>TAP HERE</b> TO HELL YEAH');
  set('#obit .again', '<b>TAP</b> TO RESPAWN &nbsp;—&nbsp; (HE\'S BACK. HELL YEAH.)');
  set('#busted .again', '<b>TAP</b> TO POST BAIL (WITH BEER)');
  set('#results .again', '<b>TAP</b> TO KEEP DRIVING');
  set('.pause-box .tiny', 'tap to resume');
  set('.masks-box .hint', 'tap to choose • tap again to wear');
  set('.controls .secret', 'while driving, tap the wanted stars like the number of the beast...');
  set('#mx-close', 'CLOSE');
}
