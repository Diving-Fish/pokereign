import type { BattleStatus } from "../battle/types";
import type { CaptureClass, CaptureProfile } from "../data/types";
import type { Rng } from "./rng";

/** Profile assumed for species that ship without explicit capture config. */
export const DEFAULT_CAPTURE_PROFILE: Required<CaptureProfile> = {
  baseRate: 0.5,
  class: "normal"
};

/**
 * Tier-based rate multiplier. Elite/boss forms are penalized on top of being
 * undirectly-capturable, so even a future special-capture path stays hard.
 * Tunable balance defaults — real numbers come from the config table later.
 */
const CLASS_RATE_MULTIPLIER: Record<CaptureClass, number> = {
  normal: 1,
  elite: 0.5,
  boss: 0.25
};

/**
 * Status catch bonus, original-style: sleep/freeze help the most, the rest are
 * a milder flat bump. Applied multiplicatively to the base chance.
 */
const STATUS_CATCH_MULTIPLIER: Record<BattleStatus, number> = {
  slp: 2.5,
  frz: 2.5,
  par: 1.5,
  brn: 1.5,
  psn: 1.5,
  tox: 1.5
};

/** Everything {@link computeCatchChance} needs, decoupled from `BattleMonster`. */
export type CaptureTarget = {
  currentHp: number;
  maxHp: number;
  status: BattleStatus | null;
  /** The foe species' capture profile (`SPECIES[id].capture`); absent = default. */
  capture?: CaptureProfile;
};

export type CaptureResult =
  | { outcome: "captured"; chance: number }
  | { outcome: "escaped"; chance: number }
  /** Tier forbids direct capture; no roll was consumed. */
  | { outcome: "uncatchable" };

function classOf(profile?: CaptureProfile): CaptureClass {
  return profile?.class ?? DEFAULT_CAPTURE_PROFILE.class;
}

function baseRateOf(profile?: CaptureProfile): number {
  return profile?.baseRate ?? DEFAULT_CAPTURE_PROFILE.baseRate;
}

/** Whether this monster can be captured directly (normal tier only). */
export function isDirectlyCapturable(profile?: CaptureProfile): boolean {
  return classOf(profile) === "normal";
}

/**
 * Final catch chance in [0, 1]. Original-style HP factor (lower HP → higher
 * chance: 1/3 at full HP, up to 1 near 0 HP) times the status bonus times the
 * tier multiplier, on top of the species base rate.
 */
export function computeCatchChance(target: CaptureTarget): number {
  const maxHp = Math.max(1, target.maxHp);
  const currentHp = clamp(target.currentHp, 0, maxHp);
  const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp);
  const statusMult = target.status ? STATUS_CATCH_MULTIPLIER[target.status] : 1;
  const classMult = CLASS_RATE_MULTIPLIER[classOf(target.capture)];
  return clamp(baseRateOf(target.capture) * hpFactor * statusMult * classMult, 0, 1);
}

/**
 * Resolve one capture attempt against the deterministic run RNG. Returns
 * `uncatchable` (without consuming a roll) when the tier forbids direct capture.
 * The "one attempt per battle" rule and post-capture handling (roster insert at
 * team level - 1, XP award) live in the battle flow, not here.
 */
export function attemptCapture(target: CaptureTarget, rng: Rng): CaptureResult {
  if (!isDirectlyCapturable(target.capture)) {
    return { outcome: "uncatchable" };
  }
  const chance = computeCatchChance(target);
  return rng.next() < chance
    ? { outcome: "captured", chance }
    : { outcome: "escaped", chance };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
