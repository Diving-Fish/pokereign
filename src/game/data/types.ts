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
};

export type SpriteAnchorTuning = {
  scale?: number;
  footOffset?: number;
};

export type EvolutionRule = {
  targetSpeciesId: string;
  requiredLevel: number;
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
};
