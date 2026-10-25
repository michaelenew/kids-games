import { randInt, type Rng } from './rng';

/**
 * Money (packet pages 11, 21, 28, 29): pennies, nickels, dimes, quarters and
 * dollar coins, totals up to $2. The junk trader sells the power core every
 * upgrade needs; he pays the exact price from a jar of old coins.
 */

export interface Coin {
  id: 'penny' | 'nickel' | 'dime' | 'quarter' | 'dollar';
  name: string;
  cents: number;
}

export const COINS: Coin[] = [
  { id: 'penny', name: 'Penny', cents: 1 },
  { id: 'nickel', name: 'Nickel', cents: 5 },
  { id: 'dime', name: 'Dime', cents: 10 },
  { id: 'quarter', name: 'Quarter', cents: 25 },
  { id: 'dollar', name: 'Dollar', cents: 100 },
];

export function moneyText(cents: number): string {
  return cents < 100 ? `${cents}¢` : `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export interface PriceProblem {
  /** Price in cents. */
  price: number;
  /** Coins he can use. */
  coins: Coin[];
  /** Whether a live running total is shown while paying. */
  showTotal: boolean;
}

/**
 * Mark I: under $1, coins up to a quarter, running total shown.
 * Mark II: $1 to $2 with dollar coins, total hidden until he pays.
 * Mark III: like Mark II with pennies needed (odd cents).
 */
export function makePriceProblem(rng: Rng, mark: 1 | 2 | 3): PriceProblem {
  if (mark === 1) {
    return { price: randInt(rng, 7, 19) * 5, coins: COINS.slice(1, 4), showTotal: true };
  }
  if (mark === 2) {
    return { price: 100 + randInt(rng, 1, 19) * 5, coins: COINS.slice(1), showTotal: false };
  }
  return { price: randInt(rng, 101, 199), coins: COINS, showTotal: false };
}

export function coinsTotal(coins: Coin[]): number {
  return coins.reduce((s, c) => s + c.cents, 0);
}
