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
  name: string;
  type: ElementType;
  category: "physical" | "special" | "status";
  animation: "contact" | "projectile" | "status";
  power: number;
  accuracy: number;
};
