/**
 * The browser's own shortcuts, kept out of the game's way while someone's playing: Ctrl is sprint
 * and W is forward, and Ctrl+W closes the tab. A page can't take every shortcut from the browser,
 * so this does what each allows:
 * - Most (Ctrl+S, Ctrl+D, Ctrl+F, Ctrl+P, Ctrl+R, Alt+Left …) are a keydown the page may cancel.
 * - Ctrl+W, Ctrl+T, Ctrl+N and Ctrl+Tab never reach a page in a tab. In full screen a Chromium
 *   browser hands them over (the Keyboard Lock API), so there play goes full screen as it starts
 *   (`fullscreenForPlay`) and they do nothing at all. F11 turns that off and on (the page's full
 *   screen, the one that allows it). Escape is left alone: it still leaves full screen and frees the mouse.
 * - Elsewhere, leaving the page mid-play asks first (`beforeunload`: a page may ask, never refuse),
 *   so a slip costs a click, not the game.
 */
/** The game itself is leaving the page (`leavePage`): that's no slip, so nothing asks. */
let leaving = false;

/** Leave for another page on the game's say-so, without the "leave site?" a slip gets. */
export function leavePage(url: string) {
  leaving = true;
  window.location.assign(url);
  // (If the browser didn't go, the guard is back.)
  window.setTimeout(() => (leaving = false), 5000);
}

export function guardShortcuts(playing: () => boolean, signal?: AbortSignal) {
  const opts = { signal, capture: true };
  window.addEventListener('keydown', (e) => {
    if (!playing() || typing(e.target)) return;
    if (e.code === 'F11') {
      e.preventDefault();
      if (!e.repeat) toggleFullscreen();
    } else if (e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
  }, opts);
  window.addEventListener('beforeunload', (e) => {
    if (!playing() || leaving) return;
    e.preventDefault();
    // (Older browsers ask only when this is set.)
    e.returnValue = '';
  }, opts);
  document.addEventListener('fullscreenchange', () => {
    const keyboard = keyboardOf();
    if (!keyboard) return;
    if (document.fullscreenElement) keyboard.lock(LOCKED).catch(() => {});
    else keyboard.unlock();
  }, opts);
  signal?.addEventListener('abort', () => keyboardOf()?.unlock());
}

/** The keys whose shortcuts the game takes in full screen: letters, digits, Tab and the function and page keys. Not Escape. */
const LOCKED = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
  ...'0123456789'.split('').map((c) => `Digit${c}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'Tab', 'Space', 'PageUp', 'PageDown', 'Backspace',
];

type LockableKeyboard = { lock(codes?: string[]): Promise<void>; unlock(): void };
const keyboardOf = () => (navigator as Navigator & { keyboard?: LockableKeyboard }).keyboard;

/** Whether play goes full screen by itself (F11 turns it off and on, and it's remembered). */
const KEPT = 'voxel.fullscreen';
let auto = kept() !== '0';

function kept(): string | null {
  try {
    return localStorage.getItem(KEPT);
  } catch {
    return null;
  }
}

/**
 * Play is starting (the mouse is being captured, on a click or a key): go full screen with it,
 * where that's what gives the game Ctrl+W and the like (a browser with the Keyboard Lock API).
 * Elsewhere full screen wouldn't help, so the window is left as it is.
 */
export function fullscreenForPlay() {
  if (!auto || document.fullscreenElement || !keyboardOf()?.lock) return;
  // (Only a person's click or key may ask for it.)
  if (navigator.userActivation && !navigator.userActivation.isActive) return;
  enter();
}

function enter() {
  try {
    // Not allowed here (a frame without the permission): play goes on in the window.
    document.documentElement.requestFullscreen().catch(() => {});
  } catch {}
}

function toggleFullscreen() {
  auto = !document.fullscreenElement;
  try {
    localStorage.setItem(KEPT, auto ? '1' : '0');
  } catch {}
  if (auto) enter();
  else document.exitFullscreen().catch(() => {});
}

function typing(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, [contenteditable]');
}
