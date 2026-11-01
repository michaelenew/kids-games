/**
 * A guest visit from Unicorn Rancher: his sister plays one Mecha Forge
 * mission (Volcano Island, with STRIKER) without the math in between. The
 * page is opened as mecha-forge/?guest=unicorn&mission=vol-ash. It plays on
 * its own save (his is never read, written or synced), as an easy patrol she
 * can't lose, and ends with a button back to her ranch.
 */
const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

export const GUEST = params.get('guest') === 'unicorn';
export const GUEST_KEY = 'mecha-forge-guest-unicorn';

const MISSIONS = ['vol-ash', 'vol-lava', 'vol-forge', 'vol-core'];
export const GUEST_MISSION = MISSIONS.includes(params.get('mission') ?? '') ? params.get('mission')! : MISSIONS[0];

/** Back to the unicorns (they waited at the ranch). */
export function backToRanch(won: boolean): void {
  window.location.href = `../unicorn-rancher/?from=volcano${won ? '&won=1' : ''}`;
}
