import { canEncrypt } from './crypto';
import { joinCode, joinGroup, leaveGroup, parseJoinCode, startGroup, syncSlot, takeChanged } from './engine';
import { qrSvg, scanQr } from './qr';
import { activeId, GAMES, type GameId, readJson, setActive, type Slot, slots, storageKey, updateSlot } from './registry';

/**
 * The grown-ups' "Saves & sync" screen: the saves on this device (pick which
 * one is played), starting a sync group from a save, showing a group's QR
 * code to add another device, and scanning one to join. Opens over the
 * welcome page or over a game.
 */

export interface PanelOptions {
  /** The welcome page's address (join links point there). */
  root: string;
  /** Opened from inside this game: it's listed first, and switching its save reloads the game. */
  game?: GameId;
  /** A join code or link to offer straight away. */
  join?: string;
}

const CSS = `
.kgs { position: fixed; inset: 0; z-index: 1000; background: rgba(10, 12, 24, 0.6); overflow: auto; padding: 16px; box-sizing: border-box;
  -webkit-user-select: text; user-select: text; touch-action: auto; font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
.kgs-box { background: #fff; color: #1d2333; border-radius: 18px; max-width: 640px; margin: 0 auto; padding: 18px 18px 22px; box-sizing: border-box; }
.kgs h2 { margin: 0; font-size: 22px; }
.kgs h3 { margin: 22px 0 8px; font-size: 18px; }
.kgs .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.kgs .note { color: #4a5268; font-size: 15px; }
.kgs ul.note { padding-left: 20px; margin: 8px 0; }
.kgs .card { border: 1px solid #d7dbe6; border-radius: 12px; padding: 12px; margin: 8px 0; }
.kgs .card.on { border: 2px solid #2b59c3; }
.kgs .badge { display: inline-block; background: #2b59c3; color: #fff; border-radius: 8px; padding: 1px 8px; font-size: 13px; margin-left: 6px; vertical-align: 2px; }
.kgs .warn { background: #fff4d6; border: 1px solid #f0c75e; border-radius: 10px; padding: 10px 12px; margin: 10px 0; }
.kgs .bad { color: #a4161a; }
.kgs .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; align-items: center; }
.kgs button { font: inherit; font-size: 15px; padding: 9px 14px; border-radius: 10px; border: 1px solid #b9c0d4; background: #f3f5fa; color: #1d2333; cursor: pointer; }
.kgs button.main { background: #2b59c3; border-color: #2b59c3; color: #fff; }
.kgs button.danger { color: #a4161a; }
.kgs button:disabled { opacity: 0.5; }
.kgs input { font: inherit; padding: 8px 10px; border-radius: 10px; border: 1px solid #b9c0d4; min-width: 0; flex: 1 1 220px; }
.kgs .qr { width: min(280px, 100%); margin: 8px auto; display: block; }
.kgs .qr svg { width: 100%; height: auto; display: block; }
.kgs video { width: 100%; max-height: 50vh; border-radius: 12px; background: #000; }
.kgs code { word-break: break-all; font-size: 12px; background: #f3f5fa; padding: 6px 8px; border-radius: 8px; display: block; }
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function ago(t?: number): string {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function status(s: Slot): string {
  if (!s.group) return 'Only on this device.';
  if (s.problem === 'lost') return '<span class="bad">The online copy is gone (deleted or expired). This device\'s copy is fine: stop syncing it, then start a new group.</span>';
  if (s.problem === 'unreadable') return '<span class="bad">The online copy can\'t be unlocked (it was changed by someone without the key). Nothing here was changed.</span>';
  const when = s.synced ? `last checked ${ago(s.synced)}` : '';
  if (s.problem === 'offline') return `Synced save · couldn't reach the internet${when ? `, ${when}` : ''}. It will catch up.`;
  return `Synced save · ${s.pending ? 'changes waiting to upload' : 'up to date'}${when ? `, ${when}` : ''}.`;
}

export function openSyncPanel(opts: PanelOptions): void {
  if (!document.getElementById('kgs-style')) {
    const style = document.createElement('style');
    style.id = 'kgs-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'kgs';
  document.body.appendChild(root);
  // Keep taps from reaching the game underneath.
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup']) root.addEventListener(ev, (e) => e.stopPropagation());

  let sharing = '';
  let joining = opts.join ?? '';
  let scanning: AbortController | null = null;
  let busy = '';
  let message = '';
  let reload = false;
  const games = (Object.keys(GAMES) as GameId[]).sort((a, b) => Number(b === opts.game) - Number(a === opts.game));

  const close = () => {
    scanning?.abort();
    root.remove();
    if (reload) location.reload();
  };

  const card = (game: GameId, s: Slot) => {
    const on = activeId(game) === s.id;
    const k = `${game}/${s.id}`;
    const btn = (act: string, label: string, cls = '') => `<button class="${cls}" data-act="${act}" data-game="${game}" data-id="${esc(s.id)}"${busy ? ' disabled' : ''}>${label}</button>`;
    const share = sharing === k && s.group
      ? `<div class="qr">${qrSvg(`${opts.root}#join=${joinCode(s.group)}`)}</div>
         <div class="note">On the other device, open <b>Saves &amp; sync</b> (on the Kids Games welcome page, or in the game's grown-up settings), tap <b>Scan a code</b> and point it at this.
         If the game is on that device's home screen, open it from inside the game there, so the save goes where the game looks for it.
         No camera? Copy the code and paste it there instead. Anyone with this code can open this save, so only share it with your own devices.</div>
         <div class="row">${btn('copy', 'Copy the code')}${btn('unshare', 'Hide')}</div>`
      : '';
    return `<div class="card${on ? ' on' : ''}">
      <b>${esc(s.name)}</b>${on ? '<span class="badge">Playing on this device</span>' : ''}
      <div class="note">${esc(GAMES[game].summary(readJson(storageKey(game, s.id))))}</div>
      <div class="note">${status(s)}</div>
      <div class="row">
        ${on ? '' : btn('play', 'Play this save', 'main')}
        ${s.group ? btn('share', 'Add another device') + btn('sync', 'Sync now') : btn('start', 'Start syncing this save')}
        ${btn('rename', 'Rename')}
        ${s.group ? btn('leave', 'Stop syncing', 'danger') : ''}
      </div>${share}
    </div>`;
  };

  const render = () => {
    const joinBlock = scanning
      ? `<video></video><div class="row"><button data-act="cancel-scan">Cancel</button></div>`
      : `<div class="row">
           <button data-act="scan" class="main"${busy ? ' disabled' : ''}>Scan a code</button>
           <input id="kgs-code" placeholder="…or paste a code here" value="${esc(joining)}">
           <button data-act="join"${busy ? ' disabled' : ''}>Add</button>
         </div>`;
    root.innerHTML = `<div class="kgs-box">
      <div class="top"><h2>Saves &amp; sync <span class="note">(grown-ups)</span></h2><button data-act="close">Done</button></div>
      <ul class="note">
        <li>A synced save is the same save on several devices, so a kid can switch between the iPad, a phone or a computer.</li>
        <li>It's locked (encrypted) on this device before it goes online, then kept at <b>jsonblob.com</b>, a free public storage site. Without the key the stored copy is unreadable. The key goes from device to device only by QR code (or a code you copy); it is never sent online.</li>
        <li>It uploads a moment after each save, and checks for news when the game opens or you come back to it.</li>
        <li>Adding a device never replaces anything on it: the synced save is added next to the saves already there, and you can switch back here at any time.</li>
        <li>jsonblob.com is a free service we don't control. If it loses the online copy, every device still has its own.</li>
      </ul>
      ${canEncrypt() ? '' : '<div class="warn">Sync needs the secure (https) address of the games; it can\'t lock saves on this page.</div>'}
      ${message ? `<div class="warn">${message}</div>` : ''}
      ${busy ? `<div class="note">${esc(busy)}…</div>` : ''}
      <h3>Add a synced save from another device</h3>
      <div class="note">On a device that already has it, tap <b>Add another device</b> under the save to show its code.</div>
      ${joinBlock}
      ${games.map((g) => `<h3>${GAMES[g].title}</h3>${slots(g).map((s) => card(g, s)).join('')}`).join('')}
    </div>`;
    if (scanning) void runScan(scanning);
    if (sharing) root.querySelector('.qr')?.scrollIntoView({ block: 'center' });
  };

  const runScan = async (ctl: AbortController) => {
    try {
      const text = await scanQr(root.querySelector('video')!, ctl.signal);
      if (scanning !== ctl) return;
      scanning = null;
      joining = text;
      await doJoin();
    } catch (e) {
      if (scanning !== ctl) return;
      scanning = null;
      message = `The camera didn't work (${esc((e as Error).message)}). You can paste the code instead.`;
      render();
    }
  };

  const work = async (label: string, job: () => Promise<void>) => {
    busy = label;
    message = '';
    render();
    try {
      await job();
    } catch (e) {
      message = `That didn't work: ${esc((e as Error).message)}. Check the internet connection and try again.`;
    }
    busy = '';
    render();
  };

  const doJoin = () => work('Fetching the synced save', async () => {
    const group = parseJoinCode(joining);
    if (!group) {
      message = "That doesn't look like a sync code.";
      return;
    }
    const j = await joinGroup(group);
    joining = '';
    if (opts.game === j.game) reload = true;
    message = j.already
      ? `“${esc(j.name)}” is already on this device. It's now the ${GAMES[j.game].title} save played here.`
      : `Added “${esc(j.name)}”. It's now the ${GAMES[j.game].title} save played here; the saves that were already here are kept below, and you can switch back any time.`;
  });

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const game = b.dataset.game as GameId;
    const id = b.dataset.id ?? '';
    const s = game ? slots(game).find((x) => x.id === id) : undefined;
    switch (b.dataset.act) {
      case 'close':
        return close();
      case 'scan':
        scanning = new AbortController();
        return render();
      case 'cancel-scan':
        scanning?.abort();
        scanning = null;
        return render();
      case 'join':
        joining = (root.querySelector('#kgs-code') as HTMLInputElement).value;
        return doJoin();
      case 'play':
        setActive(game, id);
        if (opts.game === game) reload = true;
        return render();
      case 'rename': {
        const name = prompt('Name for this save (only on this device):', s?.name)?.trim();
        if (name) updateSlot(game, id, (x) => (x.name = name));
        return render();
      }
      case 'start': {
        const name = prompt("Name the synced save (for example, the kid's name). Other devices will see this name.", s?.name === "This device's save" ? '' : s?.name)?.trim();
        if (!name) return;
        return work('Locking and uploading the save', () => startGroup(game, id, name).then(() => void (sharing = `${game}/${id}`)));
      }
      case 'share':
        sharing = `${game}/${id}`;
        return render();
      case 'unshare':
        sharing = '';
        return render();
      case 'copy':
        if (s?.group) {
          const code = `${opts.root}#join=${joinCode(s.group)}`;
          try {
            await navigator.clipboard.writeText(code);
            message = 'Copied. Paste it into Saves &amp; sync on the other device.';
          } catch {
            message = `Copy this by hand:<code>${esc(code)}</code>`;
          }
        }
        return render();
      case 'sync':
        return work('Syncing', async () => {
          await syncSlot(game, id);
          if (opts.game === game && takeChanged()) reload = true;
        });
      case 'leave':
        if (confirm(`Stop syncing “${s?.name}” on this device? It stays here as it is now, and the other devices keep syncing with each other.`)) {
          leaveGroup(game, id);
        }
        return render();
    }
  });

  render();
}
