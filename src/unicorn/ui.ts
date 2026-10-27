/**
 * Everything drawn on top of the 3D view: big round buttons, the microphone
 * bubble, the narrator's caption, number buttons, and the grown-ups' panel.
 * Plain HTML, sized for small fingers.
 */

const CSS = `
html, body { margin: 0; height: 100%; overflow: hidden; background: #bfe6ff;
  touch-action: none; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none;
  font-family: "Arial Rounded MT Bold", "Nunito", "Helvetica Neue", Arial, sans-serif; }
#ui { position: fixed; inset: 0; pointer-events: none; z-index: 2; }
#ui > * { pointer-events: auto; }
.btn { border: none; cursor: pointer; font: inherit; color: #6a1b9a; background: #fff;
  border-radius: 999px; box-shadow: 0 6px 0 #d7a6e8, 0 10px 24px rgba(80,0,120,.25); transition: transform .1s; }
.btn:active { transform: translateY(5px); box-shadow: 0 1px 0 #d7a6e8; }
#home { position: absolute; left: 14px; top: 14px; width: 54px; height: 54px; font-size: 28px; display:flex; align-items:center; justify-content:center; text-decoration: none; }
#gear { position: absolute; right: 14px; top: 14px; width: 54px; height: 54px; font-size: 26px; opacity: .75; }
#gear .fill { position:absolute; inset:0; border-radius:999px; background: conic-gradient(#c77dff var(--p, 0%), transparent 0); opacity:.6; pointer-events:none; }
#stats { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 14px;
  font-size: 24px; color: #fff; text-shadow: 0 2px 0 #9b4dca, 0 0 8px rgba(120,0,160,.5); pointer-events: none; white-space: nowrap; }
#caption { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); max-width: min(720px, 86vw);
  background: rgba(255,255,255,.92); color: #5a189a; padding: 10px 20px; border-radius: 22px; font-size: 22px; text-align: center;
  box-shadow: 0 6px 20px rgba(90,24,154,.2); pointer-events: none; transition: opacity .3s; }
#caption.hide { opacity: 0; }
#mic { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); width: 108px; height: 108px; border-radius: 999px;
  border: 6px solid #fff; background: radial-gradient(circle at 50% 40%, #ff9ad5, #c03fe0); color: #fff; font-size: 52px;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 calc(10px + var(--lvl, 0) * 60px) rgba(255,120,220,.95), 0 8px 18px rgba(80,0,120,.35);
  transition: opacity .3s, transform .2s; }
#mic.hide { opacity: 0; transform: translateX(-50%) scale(.5); pointer-events: none; }
#mic.listening { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { transform: translateX(-50%) scale(1.08); } }
#choices, #numpad { position: absolute; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
#choices { bottom: 140px; }
#numpad { bottom: 140px; width: min(760px, 94vw); }
#choices .btn { width: 110px; height: 110px; font-size: 64px; }
#numpad .btn { width: 66px; height: 66px; font-size: 36px; }
#menu { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; gap: 22px; }
#menu .btn { width: 128px; height: 128px; font-size: 62px; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height: 1; }
#menu .btn small { font-size: 17px; margin-top: 6px; }
#menu .btn.glow { animation: glow 1.2s ease-in-out infinite; }
#menu .btn.locked { opacity: .45; filter: grayscale(.6); }
@keyframes glow { 50% { box-shadow: 0 6px 0 #d7a6e8, 0 0 40px 12px rgba(255,214,0,.85); transform: scale(1.06); } }
#toast { position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%) scale(0); font-size: clamp(48px, 9vw, 96px); color: #fff;
  text-shadow: 0 5px 0 #c03fe0, 0 0 30px rgba(255,100,220,.9); pointer-events: none; white-space: nowrap; transition: transform .35s cubic-bezier(.3,1.6,.5,1), opacity .4s; }
#toast.show { transform: translate(-50%, -50%) scale(1); }
#cover { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
  background: radial-gradient(circle at 50% 40%, rgba(255,240,251,.95), rgba(255,196,230,.97)); color: #9d2bbf; text-align: center; padding: 20px; }
#cover.hide { display: none; }
#cover h1 { margin: 0; font-size: clamp(40px, 8vw, 78px); color: #fff; text-shadow: 0 5px 0 #c77dff, 0 10px 30px rgba(157,43,191,.4); }
#cover .big { font-size: 40px; padding: 22px 48px; }
#cover .bar { width: min(420px, 80vw); height: 26px; border-radius: 99px; background: #fff; overflow: hidden; box-shadow: inset 0 2px 6px rgba(0,0,0,.15); }
#cover .bar div { height: 100%; width: 0%; background: linear-gradient(90deg, #ff6fae, #ffd43b, #69db7c, #4dabf7, #b197fc); transition: width .2s; }
#cover p { margin: 0; font-size: 20px; max-width: 560px; }
#panel { position: fixed; inset: 0; z-index: 6; background: rgba(40,10,60,.55); display: flex; align-items: center; justify-content: center; }
#panel.hide { display: none; }
#panel .box { background: #fff; color: #333; border-radius: 24px; padding: 22px; width: min(640px, 92vw); max-height: 88vh; overflow: auto;
  font-family: system-ui, -apple-system, sans-serif; font-size: 16px; touch-action: pan-y; -webkit-user-select: text; user-select: text; }
#panel h2 { margin: 0 0 10px; color: #7b2cbf; }
#panel h3 { margin: 18px 0 6px; font-size: 16px; color: #555; }
#panel .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#panel button.opt { font: inherit; padding: 8px 14px; border-radius: 12px; border: 2px solid #d0bfff; background: #fff; color: #5a189a; cursor: pointer; }
#panel button.opt.on { background: #7b2cbf; color: #fff; border-color: #7b2cbf; }
#panel .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
#panel .cell { border-radius: 10px; padding: 6px; text-align: center; background: #f3f0ff; font-size: 13px; }
#panel .cell b { display: block; font-size: 24px; }
#panel .cell.ok { background: #d3f9d8; } #panel .cell.bad { background: #ffe3e3; } #panel .cell.meh { background: #fff3bf; }
#panel .note { color: #666; font-size: 14px; }
#check { position: fixed; inset: 0; z-index: 7; background: linear-gradient(#fff0fb, #e7d9ff); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; font-family: system-ui, sans-serif; }
#check.hide { display: none; }
#check .letter { font-size: min(40vh, 300px); line-height: 1; color: #7b2cbf; font-family: "Arial Rounded MT Bold", Arial, sans-serif; }
#check .heard { font-size: 26px; color: #444; min-height: 34px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export class UI {
  readonly root = el('div', { id: 'ui' });
  readonly caption = el('div', { id: 'caption', class: 'hide' });
  readonly mic = el('button', { id: 'mic', class: 'hide', 'aria-label': 'Say it again' }, '🎤');
  readonly choices = el('div', { id: 'choices' });
  readonly numpad = el('div', { id: 'numpad' });
  readonly menu = el('div', { id: 'menu' });
  readonly stats = el('div', { id: 'stats' });
  readonly toastEl = el('div', { id: 'toast' });
  readonly cover = el('div', { id: 'cover' });
  readonly panel = el('div', { id: 'panel', class: 'hide' });
  readonly check = el('div', { id: 'check', class: 'hide' });
  readonly gear = el('button', { id: 'gear', class: 'btn', 'aria-label': 'Grown-ups' }, '⚙<span class="fill"></span>');
  private captionTimer = 0;
  private toastTimer = 0;
  /** Tapping the mic bubble repeats the question. */
  onMicTap: () => void = () => {};

  constructor() {
    document.head.appendChild(el('style', {}, CSS));
    const home = el('a', { id: 'home', class: 'btn', href: '../', 'aria-label': 'All games' }, '🏠');
    this.root.append(home, this.gear, this.stats, this.caption, this.choices, this.numpad, this.menu, this.mic, this.toastEl);
    document.body.append(this.root, this.cover, this.panel, this.check);
    this.mic.addEventListener('click', () => this.onMicTap());
  }

  setCaption(text: string): void {
    this.caption.textContent = text;
    this.caption.classList.toggle('hide', !text);
    clearTimeout(this.captionTimer);
    if (text) this.captionTimer = window.setTimeout(() => this.caption.classList.add('hide'), 2500 + text.length * 70);
  }

  showMic(on: boolean, listening = on): void {
    this.mic.classList.toggle('hide', !on);
    this.mic.classList.toggle('listening', listening);
  }

  micLevel(v: number): void {
    this.mic.style.setProperty('--lvl', v.toFixed(2));
  }

  setStats(html: string): void {
    this.stats.innerHTML = html;
  }

  toast(text: string, ms = 1400): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** Big tap buttons (letters or anything short). Cleared with clearButtons(). */
  showChoices(items: string[], onPick: (item: string) => void): void {
    this.choices.innerHTML = '';
    for (const it of items) {
      const b = el('button', { class: 'btn' }, it);
      b.addEventListener('click', () => onPick(it));
      this.choices.appendChild(b);
    }
  }

  showNumpad(max: number, onPick: (n: number) => void): void {
    this.numpad.innerHTML = '';
    for (let n = 0; n <= max; n++) {
      const b = el('button', { class: 'btn' }, String(n));
      b.addEventListener('click', () => onPick(n));
      this.numpad.appendChild(b);
    }
  }

  clearButtons(): void {
    this.choices.innerHTML = '';
    this.numpad.innerHTML = '';
  }

  /** The big activity buttons at the ranch. */
  showMenu(items: { icon: string; label: string; glow?: boolean; locked?: boolean; onTap: () => void }[]): void {
    this.menu.innerHTML = '';
    for (const it of items) {
      const b = el('button', { class: `btn${it.glow ? ' glow' : ''}${it.locked ? ' locked' : ''}`, 'aria-label': it.label }, `${it.icon}<small>${it.label}</small>`);
      b.addEventListener('click', it.onTap);
      this.menu.appendChild(b);
    }
  }

  hideMenu(): void {
    this.menu.innerHTML = '';
  }

  /** Press and hold the gear (so little hands don't open it by accident). */
  onGearHold(ms: number, fn: () => void): void {
    let t0 = 0;
    let raf = 0;
    const fill = this.gear.querySelector('.fill') as HTMLElement;
    const stop = () => {
      cancelAnimationFrame(raf);
      t0 = 0;
      fill.style.setProperty('--p', '0%');
    };
    const step = () => {
      const k = (performance.now() - t0) / ms;
      fill.style.setProperty('--p', `${Math.min(100, k * 100)}%`);
      if (k >= 1) {
        stop();
        fn();
      } else raf = requestAnimationFrame(step);
    };
    this.gear.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) this.gear.addEventListener(ev, stop);
  }
}
