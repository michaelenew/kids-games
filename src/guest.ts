import type { BotId } from './state';

/**
 * A guest visit from Unicorn Rancher: his sister plays one Mecha Forge
 * mission without the math in between: Volcano Island with STRIKER, or the
 * Deep with TRIDENT. The page is opened as
 * mecha-forge/?guest=unicorn&mission=vol-ash. It plays on its own save (his
 * is never read, written or synced), as an easy patrol she can't lose, and
 * ends with a button back to her ranch.
 */
const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

export const GUEST = params.get('guest') === 'unicorn';
export const GUEST_KEY = 'mecha-forge-guest-unicorn';

/** The places she can visit, the missions there (in order) and who she flies. */
export const GUEST_PLACES = {
  volcano: { missions: ['vol-ash', 'vol-lava', 'vol-forge', 'vol-core'], bot: 'jet' as BotId, saved: 'VOLCANO SAVED!' },
  // The Deep's first mission starts with RHINO, so hers start at the kelp forest.
  deep: { missions: ['sea-kelp', 'sea-wreck', 'sea-reef', 'sea-deep'], bot: 'sub' as BotId, saved: 'OCEAN SAVED!' },
};
export type GuestPlace = keyof typeof GUEST_PLACES;

const asked = params.get('mission') ?? '';
export const GUEST_PLACE: GuestPlace = (Object.keys(GUEST_PLACES) as GuestPlace[]).find((p) => GUEST_PLACES[p].missions.includes(asked)) ?? 'volcano';
export const GUEST_MISSION = GUEST_PLACES[GUEST_PLACE].missions.includes(asked) ? asked : GUEST_PLACES[GUEST_PLACE].missions[0];
export const GUEST_BOT = GUEST_PLACES[GUEST_PLACE].bot;

/** Back to the unicorns (they waited at the ranch). */
export function backToRanch(won: boolean): void {
  window.location.href = `../unicorn-rancher/?from=${GUEST_PLACE}${won ? '&won=1' : ''}`;
}
