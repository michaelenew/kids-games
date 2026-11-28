import type { PanelOptions } from './savesScreen';

/**
 * Open the grown-ups' Saves & sync screen. Its code (with the QR code reader)
 * is fetched only now, when it's asked for, so the games themselves never
 * depend on it: once, that one file failing to load in Safari kept Mecha
 * Forge from starting at all.
 */
export async function openSaves(opts: PanelOptions): Promise<void> {
  try {
    const m = await import('./savesScreen');
    m.openSyncPanel(opts);
  } catch {
    // The game carries on; only this screen is missing.
    window.alert("Saves & sync couldn't load. Check the connection (a content blocker can also stop it), then try again.");
  }
}
