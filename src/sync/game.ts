import { flush, leaveGroup, noteSaved as note, onRemoteSave as onRemote, syncSlot, takeChanged } from './engine';
import { activeId, type GameId, slot, storageKey } from './registry';

export type { GameId } from './registry';

/**
 * The save this page's game is playing. Fixed when the game first asks, so
 * picking a different save in Saves & sync takes effect on the next load and
 * the running game never writes over the save just picked.
 */
const playing: Partial<Record<GameId, string>> = {};
function playingId(game: GameId): string {
  return (playing[game] ??= activeId(game));
}

/** Where the game keeps the save being played. */
export function saveKey(game: GameId): string {
  return storageKey(game, playingId(game));
}

/** The game just saved: if the save is synced, upload it soon. */
export function noteSaved(game: GameId): void {
  note(game, playingId(game));
}

/** How a save combined with another device's progress reaches the running game. */
export function onRemoteSave(game: GameId, fn: (save: unknown) => void): void {
  onRemote(game, playingId(game), fn);
}

/** Unhook the save being played from its sync group (it stays on this device). */
export function leaveSyncGroup(game: GameId): void {
  const id = playingId(game);
  if (slot(game, id)?.group) leaveGroup(game, id);
}

/**
 * Start a game: if its save is in a sync group, fetch the newest copy first
 * (giving up after a few seconds when offline), then load the game. While it
 * runs, uploads happen after each save; coming back to the page checks for
 * news and reloads if another device played on.
 */
export async function startSynced(game: GameId, load: () => Promise<unknown>): Promise<void> {
  const id = playingId(game);
  const synced = () => !!slot(game, id)?.group;
  if (synced()) {
    await Promise.race([syncSlot(game, id), new Promise((r) => setTimeout(r, 5000))]);
    takeChanged();
  }
  await load();
  document.addEventListener('visibilitychange', async () => {
    if (!synced()) return;
    if (document.visibilityState === 'hidden') return flush(game, id);
    await syncSlot(game, id);
    if (takeChanged()) location.reload();
  });
  window.addEventListener('online', () => synced() && void syncSlot(game, id));
}
