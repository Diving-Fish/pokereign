export type ElementType =
  | "normal"
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "flying"
  | "rock"
  | "ground";

export type Stats = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type MonsterSpecies = {
  id: string;
  dexNumber: number;
  spriteSlug: string;
  spriteAnchors?: Partial<Record<"front" | "back", SpriteAnchorTuning>>;
  name: string;
  types: ElementType[];
  baseStats: Stats;
  /** Canonical (@smogon/calc) ability name, e.g. "Blaze". */
  ability: string;
  defaultMoves: string[];
  evolutions?: EvolutionRule[];
  /** Capture metadata. Absent = treated as the default normal-tier profile. */
  capture?: CaptureProfile;
};

/**
 * Capture tier. `normal` wild monsters can be captured directly; `elite` and
 * `boss` forms cannot be captured directly and additionally carry a lower rate
 * for any future special-capture path (e.g. after breaking a shield).
 */
export type CaptureClass = "normal" | "elite" | "boss";

export type CaptureProfile = {
  /**
   * Base catch chance at full HP with no status, before any modifier (0..1).
   * Lower = rarer / harder; fully-evolved and rare species sit lower. Tuned
   * later via the species config table.
   */
  baseRate: number;
  /** Capture tier; defaults to `normal` when omitted. */
  class?: CaptureClass;
};

export type SpriteAnchorTuning = {
  scale?: number;
  footOffset?: number;
};

export type EvolutionRule = {
  targetSpeciesId: string;
  /** Auto-evolves the instant the monster reaches this in-game level. */
  requiredLevel?: number;
  /**
   * Evolves when this item is used on the monster. The item system isn't built
   * yet, so item-triggered evolution is defined here but not wired up.
   */
  requiredItem?: string;
};

export type Move = {
  id: string;
  /** Localized display name. */
  name: string;
  /** Visual animation style; not modeled by @smogon/calc. */
  animation: "contact" | "projectile" | "status";
  /** Hit chance (%); @smogon/calc does not model accuracy, so it stays local. */
  accuracy: number;
  /** Canonical (@smogon/calc) move name, e.g. "Flame Burst". Source of type/category/power. */
  calcName: string;
  /** Maximum PP (move uses). Consumption isn't tracked yet, so the UI shows it as full. */
  pp: number;
};
