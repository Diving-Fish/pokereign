import type { ElementType, Stats } from "../data/types";
import type { MoveId } from "../data/moves";
import type { SpeciesId } from "../data/species";

export type BattleSide = "player" | "foe";

/** Non-volatile status conditions understood by @smogon/calc. */
export type BattleStatus = "brn" | "par" | "psn" | "tox" | "slp" | "frz";

export type BattleWeather = "Sun" | "Rain" | "Sand" | "Snow" | "Hail";
export type BattleTerrain = "Electric" | "Grassy" | "Misty" | "Psychic";

export type BattleFieldState = {
  weather?: BattleWeather;
  terrain?: BattleTerrain;
};

export type BattleMonster = {
  instanceId: string;
  side: BattleSide;
  speciesId: SpeciesId;
  name: string;
  types: ElementType[];
  /** In-game level (1-12), used for display and evolution. */
  level: number;
  /** Actual 1-100 level fed to @smogon/calc (level coefficient × 50). */
  calcLevel: number;
  ivs: Stats;
  evs: Stats;
  nature: string;
  status: BattleStatus | null;
  maxHp: number;
  currentHp: number;
  stats: Stats;
  moves: MoveId[];
  statStages: {
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
    accuracy: number;
  };
};

export type BattleTeamView = {
  activeIndex: number;
  active: BattleMonster;
  roster: BattleMonster[];
};

export type BattleStateView = {
  player: BattleTeamView;
  opponent: BattleTeamView;
};

export type BattleCommand =
  | { type: "move"; moveId: MoveId }
  | { type: "switch"; targetIndex: number };

export type BattleOutcome = "ongoing" | "player" | "opponent";

export type BattleMoveEvent = {
  type: "move";
  userId: string;
  targetId: string;
  userSide: BattleSide;
  targetSide: BattleSide;
  userName: string;
  targetName: string;
  moveId: MoveId;
  moveName: string;
  animation: "contact" | "projectile" | "status";
};

export type BattleDamageEvent = {
  type: "damage";
  targetId: string;
  targetName: string;
  damage: number;
  hpBefore: number;
  hpAfter: number;
  effectiveness: number;
  fainted: boolean;
};

export type BattleMessageEvent = {
  type: "message";
  text: string;
};

export type BattleEvent = BattleMoveEvent | BattleDamageEvent | BattleMessageEvent;

export type BattleTurnResult = {
  log: string[];
  events: BattleEvent[];
  outcome: BattleOutcome;
};
