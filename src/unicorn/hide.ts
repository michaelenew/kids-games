import { say } from './speak';
import { sfx } from './sfx';
import type { UI } from './ui';

/**
 * The 👻 Hide button for unicorns with the Invisibility upgrade: tap it and
 * they turn invisible for a while, then it recharges. `onChange` hears when
 * the hiding starts and stops.
 */
export const HIDE_SECONDS = 8;
const RECHARGE_SECONDS = 6;

export function hideButton(ui: UI, onChange: (hidden: boolean) => void): { remove: () => void; hidden: () => boolean; press: () => void } {
  const style = document.createElement('style');
  style.textContent = `#hide { position: absolute; left: 16px; bottom: 20px; width: min(130px, 23vw); height: min(130px, 23vw); font-size: min(20px, 3.8vw); font-weight: 800;
      display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; color: #5f3dc4;
      background: conic-gradient(#d0bfff 0 var(--c), rgba(255,255,255,.55) var(--c) 100%); border: 6px solid #fff; }
    #hide span { font-size: min(52px, 9vw); }
    #hide.ready { background: radial-gradient(circle, #f3f0ff, #d0bfff); animation: glow 1.2s ease-in-out infinite; }
    #hide.on { background: rgba(255,255,255,.25); color: #fff; }`;
  const btn = document.createElement('button');
  btn.id = 'hide';
  btn.className = 'btn ready';
  btn.innerHTML = '<span>👻</span>HIDE';
  ui.root.append(style, btn);
  let state: 'ready' | 'on' | 'charging' = 'ready';
  let timer = 0;
  let raf = 0;
  const press = () => {
    if (state !== 'ready') return;
    state = 'on';
    btn.className = 'btn on';
    sfx.twinkle();
    void say('Invisible! The bad guys cannot see us!');
    onChange(true);
    timer = window.setTimeout(() => {
      onChange(false);
      state = 'charging';
      btn.className = 'btn';
      const t0 = performance.now();
      const fill = () => {
        const k = (performance.now() - t0) / (RECHARGE_SECONDS * 1000);
        btn.style.setProperty('--c', `${Math.min(100, k * 100)}%`);
        if (k >= 1) {
          state = 'ready';
          btn.className = 'btn ready';
        } else raf = requestAnimationFrame(fill);
      };
      fill();
    }, HIDE_SECONDS * 1000);
  };
  btn.addEventListener('click', press);
  return {
    remove: () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (state === 'on') onChange(false);
      btn.remove();
      style.remove();
    },
    hidden: () => state === 'on',
    press,
  };
}
