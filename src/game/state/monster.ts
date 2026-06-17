import { SPECIES, type SpeciesId } from "../data/species";
import type { MoveId } from "../data/moves";
import type { Stats } from "../data/types";
import type { BattleMonster, BattleSide, BattleStatus } from "../battle/types";
import { computeStats, toCalcLevel } from "../battle/smogonCalc";

export const DEFAULT_IVS: Stats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
/**
 * EVs are currently a flat 85 across the board, but they are stored per-monster
 * (and synced) so a future EV system can vary them without touching the battle
 * or calc plumbing.
 */
export const DEFAULT_EVS: Stats = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
export const DEFAULT_NATURE = "Hardy";

/**
 * Authoritative, serializable form of a monster: only source-of-truth fields
 * that the server will own. Derived values (stats, maxHp, calcLevel, types,
 * name) are intentionally NOT stored — they are recomputed by `toBattleMonster`
 * so they never desync and stay out of the sync payload.
 */
export type MonsterState = {
  instanceId: string;
  speciesId: SpeciesId;
  /** In-game level (1-12). */
  level: number;
  /** Experience accumulated toward the next level (used from a later slice). */
  xp: number;
  ivs: Stats;
  evs: Stats;
  nature: string;
  status: BattleStatus | null;
  currentHp: number;
  moves: MoveId[];
};

// Local id counter. To be replaced by server-assigned ids once the run state is
// server-authoritative (tracked alongside the seeded-RNG follow-up).
let nextInstanceId = 1;

type CreateMonsterStateOptions = {
  ivs?: Stats;
  evs?: Stats;
  nature?: string;
  instanceId?: string;
};

export function createMonsterState(speciesId: SpeciesId, level: number, options: CreateMonsterStateOptions = {}): MonsterState {
  const species = SPECIES[speciesId];
  const ivs = options.ivs ?? DEFAULT_IVS;
  const evs = options.evs ?? DEFAULT_EVS;
  const nature = options.nature ?? DEFAULT_NATURE;
  const { maxHp } = computeStats(speciesId, toCalcLevel(level), ivs, evs, nature);

  return {
    instanceId: options.instanceId ?? `m-${nextInstanceId++}`,
    speciesId,
    level,
    xp: 0,
    ivs,
    evs,
    nature,
    status: null,
    currentHp: maxHp,
    moves: species.defaultMoves.slice(0, 4) as MoveId[]
  };
}

/** Materialize a battle-ready monster (with derived stats) from persistent state. */
export function toBattleMonster(state: MonsterState, side: BattleSide): BattleMonster {
  const species = SPECIES[state.speciesId];
  const calcLevel = toCalcLevel(state.level);
  const { stats, maxHp } = computeStats(state.speciesId, calcLevel, state.ivs, state.evs, state.nature);

  return {
    instanceId: state.instanceId,
    side,
    speciesId: state.speciesId,
    name: species.name,
    types: species.types,
    level: state.level,
    calcLevel,
    ivs: state.ivs,
    evs: state.evs,
    nature: state.nature,
    status: state.status,
    maxHp,
    currentHp: Math.min(state.currentHp, maxHp),
    stats,
    moves: state.moves,
    statStages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0 }
  };
}

/** Write volatile battle outcome (HP, status) back onto persistent state. */
export function syncMonsterStateFromBattle(state: MonsterState, battle: BattleMonster): void {
  state.currentHp = battle.currentHp;
  state.status = battle.status;
}

/** XP the team earns for defeating a foe of the given in-game level (1-12). */
export function xpRewardForDefeating(foeLevel: number): number {
  return foeLevel * 6 + 6;
}
