import { startSynced } from './sync/game';

// Mecha Forge starts here: a synced save is brought up to date before the game loads.
void startSynced('mecha', () => import('./main'));
