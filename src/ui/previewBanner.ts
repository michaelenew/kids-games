import { inPreview } from '../state';

/**
 * A strip across the top of the screen while a grown-up is previewing on a
 * copy of the save, so nobody mistakes it for his real game.
 */
export function updatePreviewBanner(): void {
  let el = document.getElementById('preview-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'preview-banner';
    el.textContent = 'PREVIEW MODE · his real save is safe · end it in ⚙ Settings';
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)', zIndex: '20',
      background: 'rgba(214, 40, 40, 0.92)', color: '#fff', font: 'bold 14px system-ui, sans-serif',
      padding: '4px 14px', borderRadius: '0 0 10px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
    });
    document.body.appendChild(el);
  }
  el.style.display = inPreview() ? 'block' : 'none';
}
