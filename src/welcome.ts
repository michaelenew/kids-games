import { openSyncPanel } from './sync/panel';

// The welcome page's grown-ups button. A join link (from a sync QR code)
// opens it straight away; the code is taken out of the address bar.
const root = location.href.split('#')[0];
const open = (join?: string) => openSyncPanel({ root, join });
document.getElementById('grownups')!.addEventListener('click', () => open());
if (location.hash.startsWith('#join=')) {
  const join = location.hash;
  history.replaceState(null, '', root);
  open(join);
}
