import { SPECIES, type SpeciesId } from "../data/species";
import { speciesTypes } from "../data/pokedex";
import type { MoveId } from "../data/moves";
import type { MonsterSpecies, Stats } from "../data/types";
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

/** In-game level ceiling (matches the level-coefficient table in smogonCalc). */
export const MAX_LEVEL = 12;

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
  /** Localized name of the held item, if any. The item system isn't built yet. */
  heldItem?: string;
};

// Local id counter. To be replaced by server-assigned ids once the run state is
// server-authoritative (tracked alongside the seeded-RNG follow-up).
let nextInstanceId = 1;

/** Max moves a monster can know at once. */
export const MAX_MOVES = 4;

/**
 * The moves a freshly created monster of `speciesId` knows at `level`: the most
 * recent {@link MAX_MOVES} learnset entries at/under that level (dedup, keeping
 * the latest occurrence). Falls back to `defaultMoves` when the species has no
 * learnset.
 */
export function knownMovesAtLevel(speciesId: SpeciesId, level: number): MoveId[] {
  const species: MonsterSpecies = SPECIES[speciesId];
  if (!species.learnset) {
    return (species.defaultMoves ?? []).slice(0, MAX_MOVES) as MoveId[];
  }
  const ordered: MoveId[] = [];
  for (const entry of species.learnset) {
    if (entry.level > level) continue;
    const moveId = entry.moveId as MoveId;
    // Re-learning bumps the move to the end so the latest 4 win the slot race.
    const existing = ordered.indexOf(moveId);
    if (existing >= 0) ordered.splice(existing, 1);
    ordered.push(moveId);
  }
  return ordered.slice(-MAX_MOVES);
}

type CreateMonsterStateOptions = {
  ivs?: Stats;
  evs?: Stats;
  nature?: string;
  instanceId?: string;
};

export function createMonsterState(speciesId: SpeciesId, level: number, options: CreateMonsterStateOptions = {}): MonsterState {
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
    moves: knownMovesAtLevel(speciesId, level)
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
    types: speciesTypes(state.speciesId),
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

/** XP required to advance from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return level * 12 + 8;
}

function maxHpAt(state: MonsterState): number {
  return computeStats(state.speciesId, toCalcLevel(state.level), state.ivs, state.evs, state.nature).maxHp;
}

export type LevelUpResult = {
  leveledUp: boolean;
  /** Level before applying XP. */
  from: number;
  /** Level after applying XP. */
  to: number;
};

/**
 * Spend accumulated XP to advance levels (capped at {@link MAX_LEVEL}). Stats are
 * derived, so only `level`/`xp` change here; like the original games, `currentHp`
 * gains exactly the amount the max HP grew (so a level-up partially heals rather
 * than just preserving a percentage). A fainted monster stays fainted. Call this
 * *after* the battle's final HP has been written back.
 */
export function applyLevelUps(state: MonsterState): LevelUpResult {
  const from = state.level;
  if (state.level >= MAX_LEVEL) {
    return { leveledUp: false, from, to: from };
  }

  const maxHpBefore = maxHpAt(state);
  while (state.level < MAX_LEVEL && state.xp >= xpToNextLevel(state.level)) {
    state.xp -= xpToNextLevel(state.level);
    state.level += 1;
  }

  const to = state.level;
  if (to > from && state.currentHp > 0) {
    const maxHpAfter = maxHpAt(state);
    state.currentHp = Math.min(maxHpAfter, state.currentHp + (maxHpAfter - maxHpBefore));
  }
  return { leveledUp: to > from, from, to };
}

export type EvolutionResult = {
  evolved: boolean;
  /** Species before evolving (unchanged if `evolved` is false). */
  fromSpeciesId: SpeciesId;
  /** Species after evolving. */
  toSpeciesId: SpeciesId;
};

/**
 * Apply any level-gated evolution the monster now qualifies for. The loop chains
 * through multiple stages if a single level jump crosses several thresholds.
 * Stats/types/name are derived from `speciesId`, so only the id changes here;
 * like the original games, `currentHp` gains exactly the amount the max HP grew.
 * Moves are kept as-is — evolving never overwrites a learned moveset. A fainted
 * monster does not evolve. Item-triggered evolution
 * (`requiredItem`) is handled by the item system, not here. Call this *after*
 * {@link applyLevelUps}.
 */
export function evolveIfReady(state: MonsterState): EvolutionResult {
  const from = state.speciesId;
  if (state.currentHp <= 0) {
    return { evolved: false, fromSpeciesId: from, toSpeciesId: from };
  }

  let evolved = false;
  for (;;) {
    const species: MonsterSpecies = SPECIES[state.speciesId];
    const rule = species.evolutions?.find(
      (evo) => evo.requiredLevel !== undefined && state.level >= evo.requiredLevel
    );
    if (!rule) break;
    const maxHpBefore = maxHpAt(state);
    state.speciesId = rule.targetSpeciesId as SpeciesId;
    const maxHpAfter = maxHpAt(state);
    state.currentHp = Math.min(maxHpAfter, state.currentHp + (maxHpAfter - maxHpBefore));
    evolved = true;
  }

  return { evolved, fromSpeciesId: from, toSpeciesId: state.speciesId };
}

/** A move a monster qualifies to learn but couldn't auto-fit (4 slots full). */
export type PendingLearn = {
  instanceId: string;
  speciesId: SpeciesId;
  moveId: MoveId;
};

export type LearnsetResult = {
  /** Moves auto-learned into a free slot (state already updated). */
  learned: MoveId[];
  /** Moves the monster qualifies for but has no free slot — needs a decision. */
  pending: MoveId[];
};

/**
 * Teach any learnset moves unlocked by a level change from `fromLevel` to the
 * monster's current level (exclusive→inclusive), using the *current* species —
 * so call this *after* {@link applyLevelUps} and {@link evolveIfReady}, with
 * `fromLevel` captured before the level-up. Already-known moves are skipped.
 * Moves that fit a free slot are learned immediately; the rest are returned as
 * `pending` for the player to resolve (replace which move, or skip).
 */
export function applyLearnset(state: MonsterState, fromLevel: number): LearnsetResult {
  const learned: MoveId[] = [];
  const pending: MoveId[] = [];
  const species: MonsterSpecies = SPECIES[state.speciesId];
  if (!species.learnset) {
    return { learned, pending };
  }

  for (const entry of species.learnset) {
    if (entry.level <= fromLevel || entry.level > state.level) continue;
    const moveId = entry.moveId as MoveId;
    if (state.moves.includes(moveId)) continue;
    if (state.moves.length < MAX_MOVES) {
      state.moves.push(moveId);
      learned.push(moveId);
    } else {
      pending.push(moveId);
    }
  }
  return { learned, pending };
}

/**
 * Resolve a pending learn: replace the move at `slotIndex` with `moveId`. A
 * `slotIndex` out of range is treated as "skip" (the move is not learned).
 */
export function learnMoveIntoSlot(state: MonsterState, moveId: MoveId, slotIndex: number): boolean {
  if (state.moves.includes(moveId)) return false;
  if (slotIndex < 0 || slotIndex >= state.moves.length) return false;
  state.moves[slotIndex] = moveId;
  return true;
}
