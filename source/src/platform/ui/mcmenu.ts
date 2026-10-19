import { h } from './dom';
import type { Settings, ShadowQuality } from '../settings';
import './mcmenu.css';

/**
 * The pause menu as Minecraft has it (ported from mconline, trimmed to this build's settings): the
 * Game Menu, and under Options its screens of buttons and sliders, two to a row. It's a face on the
 * pause menu, which still keeps the settings and does the work: this lays its controls out the
 * other way.
 *
 * Sizes are in the game's "GUI pixels" (`--g` in the stylesheet: a button is 20 tall, 150 or 200
 * wide), at the places the game's screens put them. Where the game has a button this platform has
 * nothing for (Language, Resource Packs…), the button is there and greyed out, so the layout is
 * the game's own.
 */
export interface MinecraftMenuHost {
  get<K extends keyof Settings>(key: K): Settings[K];
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  resume(): void;
  exit(): void;
  invite(done: (text: string) => void): void;
  /** Restart the match, where the game lets its players. */
  restart: (() => void) | null;
  /** Run a command of the game's, as if typed (`skin next`). */
  command(line: string): void;
  /** The world's clock can be set: its slider, and what it reads. */
  clock: { slider: HTMLInputElement; text: () => string } | null;
  /** The pause menu's own lists and controls, shown on these screens. */
  players: HTMLElement;
  achievements: HTMLElement | null;
  help: () => HTMLElement;
  keys: { list: HTMLElement; reset: HTMLButtonElement; hint: HTMLElement };
  /** Rebinding a key is waiting for one. */
  rebinding(): boolean;
  stopRebinding(): void;
}

type Screen = { el: HTMLElement; refresh: () => void };

/** Shadow qualities to step through (never off: the platform's lighting is shaded by them). */
const SHADOWS: ShadowQuality[] = ['low', 'medium', 'high', 'ultra'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class MinecraftMenu {
  readonly root = h('div.mc-menu');
  private screens = new Map<string, Screen>();
  private stack: string[] = ['game'];

  constructor(private host: MinecraftMenuHost) {
    paintTextures(document.documentElement); // (On the page itself: a kit's own screens wear the same stone.)
    const { host: m } = this;
    const on = (v: boolean) => (v ? 'ON' : 'OFF');

    // --- widgets ---------------------------------------------------------------------------------
    const refreshers: (() => void)[] = [];
    const button = (label: string, onclick: (() => void) | null, cls = '') => {
      const b = h(`button.mc-button${cls}`, { onclick: () => onclick?.() }, h('span', {}, label)) as HTMLButtonElement;
      b.disabled = !onclick;
      return b;
    };
    const open = (label: string, screen: string, cls = '') => button(label, () => this.open(screen), cls);
    /** A button that turns a setting on and off: "Clouds: ON". */
    const toggle = (label: string, key: keyof Settings, cls = '') => {
      const b = button('', () => {
        m.set(key, !m.get(key) as never);
        refresh();
      }, cls);
      const refresh = () => b.firstElementChild!.replaceChildren(`${label}: `, h(`span.mc-state.${m.get(key) ? 'on' : 'off'}`, {}, on(Boolean(m.get(key)))));
      refreshers.push(refresh);
      return b;
    };
    /** A button that steps a setting through its choices: "Shadows: High". */
    const cycle = <K extends keyof Settings>(label: string, key: K, choices: Settings[K][], name: (v: Settings[K]) => string, cls = '') => {
      const b = button('', () => {
        m.set(key, choices[(choices.indexOf(m.get(key)) + 1) % choices.length]);
        refresh();
      }, cls);
      const refresh = () => (b.firstElementChild!.textContent = `${label}: ${name(m.get(key))}`);
      refreshers.push(refresh);
      return b;
    };
    /** A slider with its name and value written on it: "FOV: 75". */
    const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string, cls = '') => {
      const input = h('input', { type: 'range', min, max, step }) as HTMLInputElement;
      const text = h('span');
      const refresh = () => {
        input.value = String(m.get(key));
        text.textContent = `${label}: ${fmt(Number(m.get(key)))}`;
      };
      input.addEventListener('input', () => {
        m.set(key, Number(input.value) as never);
        text.textContent = `${label}: ${fmt(Number(input.value))}`;
      });
      refreshers.push(refresh);
      return h(`label.mc-slider${cls}`, {}, input, text);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    // --- screens ---------------------------------------------------------------------------------
    /** A screen of options: its title at the top, its rows two to a row, Done at the bottom. */
    const options = (id: string, title: string, rows: (HTMLElement | null)[], more: HTMLElement[] = []) => {
      const done = button('Done', () => this.back(), '.mc-done');
      this.add(id, h('div.mc-screen.mc-options', {}, h('h2.mc-title', {}, title), h('div.mc-grid', {}, ...rows.filter((r) => !!r)), ...more, h('div.mc-foot', {}, done)));
    };
    /** A screen that shows something of the pause menu's own (a list), in a panel, with Done. */
    const panel = (id: string, title: string, body: () => HTMLElement | null, foot: HTMLElement[] = []) => {
      const hole = h('div.mc-panel');
      this.add(id, h('div.mc-screen.mc-listing', {}, h('h2.mc-title', {}, title), hole, h('div.mc-foot', {}, ...foot, button('Done', () => this.back(), '.mc-done'))), () => {
        const b = body();
        if (b && b.parentElement !== hole) hole.replaceChildren(b);
      });
    };

    // The Game Menu.
    const invite = button('Open to Friends', () => m.invite((text) => {
      invite.firstElementChild!.textContent = text === 'Link copied' ? 'Link Copied!' : 'Copy This Link';
      window.setTimeout(() => (invite.firstElementChild!.textContent = 'Open to Friends'), 2000);
    }));
    this.add('game', h(
      'div.mc-screen.mc-game',
      {},
      h('h2.mc-title', {}, 'Game Menu'),
      h(
        'div.mc-column',
        {},
        button('Back to Game', () => m.resume(), '.wide'),
        open('Advancements', 'advancements'),
        open('Statistics', 'statistics'),
        open('How to Play', 'help'),
        button('Restart Match', m.restart),
        open('Options...', 'options'),
        invite,
        button('Save and Quit to Title', () => m.exit(), '.wide'),
      ),
    ));
    panel('advancements', 'Advancements', () => m.achievements ?? h('div.mc-empty', {}, 'This game has no advancements.'));
    panel('statistics', 'Statistics', () => m.players);
    panel('help', 'How to Play', () => m.help());

    // Options, as the game lays them out (the field of view and one more above, then two columns).
    this.add('options', h(
      'div.mc-screen.mc-options',
      {},
      h('h2.mc-title', {}, 'Options'),
      h('div.mc-grid.mc-top', {}, slider('FOV', 'fov', 55, 110, 1, (v) => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : String(v))), m.clock ? open('World...', 'world') : button('Online...', null)),
      h(
        'div.mc-grid',
        {},
        open('Skin Customization...', 'skin'),
        open('Music & Sounds...', 'sounds'),
        open('Video Settings...', 'video'),
        open('Controls...', 'controls'),
        button('Language...', null),
        button('Chat Settings...', null),
        button('Resource Packs...', null),
        button('Accessibility Settings...', null),
      ),
      h('div.mc-foot', {}, button('Done', () => this.back(), '.mc-done')),
    ));

    options('skin', 'Skin Customization', [
      button('Previous Skin', () => m.command('skin prev')),
      button('Next Skin', () => m.command('skin next')),
      button('Random Skin', () => m.command('skin random')),
      button('Cape: OFF', null),
    ]);
    options('sounds', 'Music & Sound Options', [slider('Master Volume', 'volume', 0, 1, 0.01, (v) => (v > 0 ? pct(v) : 'OFF'), '.wide'), slider('Music', 'music', 0, 1, 0.01, (v) => (v > 0 ? pct(v) : 'OFF'))]);

    // Video Settings: the everyday ones, then the rest by kind (OptiFine's way).
    options('video', 'Video Settings', [
      toggle('Auto Quality', 'autoQuality'),
      slider('Render Distance', 'renderDistance', 4, 24, 1, (v) => `${v} chunks`),
      cycle('Shadows', 'shadows', SHADOWS, (v) => cap(v)),
      slider('Render Quality', 'renderScale', 0.4, 1, 0.05, pct),
      toggle('View Bobbing', 'viewBobbing'),
      toggle('Antialiasing', 'msaa'),
      open('Details...', 'details'),
      open('Performance...', 'performance'),
    ]);
    options('details', 'Detail Settings', [toggle('Clouds', 'clouds'), toggle('Water Reflections', 'ssr'), toggle('God Rays', 'godrays'), toggle('Bloom', 'bloom')]);
    options('performance', 'Performance Settings', [toggle('Smart Culling', 'occlusion'), toggle('Auto Quality', 'autoQuality'), slider('Render Distance', 'renderDistance', 4, 24, 1, (v) => `${v} chunks`), slider('Render Quality', 'renderScale', 0.4, 1, 0.05, pct)]);

    options('controls', 'Controls', [open('Mouse Settings...', 'mouse'), open('Key Binds...', 'keys'), open('Controller...', 'controller'), toggle('View Bobbing', 'viewBobbing')]);
    options('mouse', 'Mouse Settings', [slider('Sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => `${Math.round(v * 100)}%`), toggle('Invert Mouse', 'invertY')]);
    options('controller', 'Controller', [slider('Stick Sensitivity', 'stickSensitivity', 0.3, 2.5, 0.05, (v) => `${Math.round(v * 100)}%`), toggle('Invert Look', 'invertY'), toggle('Vibration', 'vibration'), toggle('Aim Assist', 'aimAssist')]);
    const resetKeys = button('Reset Keys', () => {
      m.keys.reset.click();
    });
    panel('keys', 'Key Binds', () => h('div.mc-keys', {}, m.keys.list, m.keys.hint), [resetKeys]);
    if (m.clock) {
      const clock = m.clock;
      const text = h('span');
      const show = () => (text.textContent = `Time: ${clock.text()}`);
      clock.slider.addEventListener('input', show);
      refreshers.push(show);
      options('world', 'World', [h('label.mc-slider', {}, clock.slider, text), slider('Day Length', 'dayMinutes', 2, 60, 1, (v) => `${v} min`)]);
    }

    this.refreshAll = () => refreshers.forEach((r) => r());
    this.show();
  }

  private refreshAll: () => void = () => {};

  private add(id: string, el: HTMLElement, refresh: () => void = () => {}) {
    el.classList.add('hidden');
    this.root.append(el);
    this.screens.set(id, { el, refresh });
  }

  private render() {
    const top = this.stack[this.stack.length - 1];
    this.refreshAll();
    for (const [id, s] of this.screens) {
      s.el.classList.toggle('hidden', id !== top);
      if (id === top) s.refresh();
    }
  }

  private open(id: string) {
    if (!this.screens.has(id)) return;
    this.host.stopRebinding();
    this.stack.push(id);
    this.render();
  }

  /** Back a screen (Escape, Done); false at the Game Menu, which Escape leaves. */
  back(): boolean {
    if (this.host.rebinding()) return true;
    this.host.stopRebinding();
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.render();
    return true;
  }

  /** The menu comes up: at the Game Menu. */
  show() {
    this.stack = ['game'];
    this.render();
  }
}

/**
 * The buttons' stone, painted here (the game's own texture isn't ours to ship): a speckled grey a
 * button's size, lighter along its top and left and darker along its bottom, for a button, one
 * under the pointer (tinted blue) and one that's off (dark). They go to the stylesheet as pictures.
 */
function paintTextures(root: HTMLElement) {
  const paint = (base: [number, number, number], spread: number, light: number, dark: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 20;
    const c = canvas.getContext('2d');
    if (!c) return '';
    const image = c.createImageData(200, 20);
    let seed = 1234567;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 200; x++) {
        // (Speckle in pairs of pixels, as the stone's is; the rim one shade lighter or darker.)
        const n = (random() - 0.5) * spread + (random() < 0.12 ? -spread * 0.6 : 0);
        const edge = y === 0 || x === 0 ? light : y >= 18 ? dark : x === 199 ? dark * 0.6 : 0;
        const o = (y * 200 + x) * 4;
        for (let k = 0; k < 3; k++) image.data[o + k] = Math.max(0, Math.min(255, base[k] + n + edge));
        image.data[o + 3] = 255;
      }
    }
    c.putImageData(image, 0, 0);
    return `url(${canvas.toDataURL()})`;
  };
  root.style.setProperty('--mc-stone', paint([111, 111, 111], 18, 58, -34));
  root.style.setProperty('--mc-stone-hover', paint([124, 134, 190], 18, 62, -38));
  root.style.setProperty('--mc-stone-off', paint([44, 44, 44], 8, 6, -8));
}
