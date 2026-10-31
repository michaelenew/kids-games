import { startSynced } from '../sync/game';

// Unicorn Rancher starts here: a synced save is brought up to date before the game loads.
void startSynced('unicorn', () => import('./main'));
