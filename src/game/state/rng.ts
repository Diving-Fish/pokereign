const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;

/** Advance a 32-bit LCG state once. Pure: same input always yields same output. */
export function nextRngState(state: number): number {
  return (Math.imul(state >>> 0, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
}

/**
 * Mutable cursor over a deterministic LCG stream. Only `state` carries meaning:
 * persist it (and rebuild with `new Rng(state)`) to resume the exact same
 * sequence. Server-authoritative sync will lean on this so every client that
 * starts from the same seed produces identical rolls.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = nextRngState(this.state);
    return this.state / 0x100000000;
  }

  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Pick a random element from a non-empty list. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

/** A fresh 32-bit seed for a brand-new run (until the server hands them out). */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}
