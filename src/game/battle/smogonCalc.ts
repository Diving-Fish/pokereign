import { Generations, Pokemon, Move, Field, calculate } from "@smogon/calc";
import { type SpeciesId } from "../data/species";
import { speciesAbility } from "../data/pokedex";
import { MOVES, type MoveId } from "../data/moves";
import type { Stats } from "../data/types";
import type { BattleFieldState, BattleMonster } from "./types";

const GEN = Generations.get(9);

/**
 * In-game level (1-12) → level coefficient. The coefficient maps onto a real
 * 1-100 level via `coefficient × 50` (e.g. 1.2 → level 60).
 */
const LEVEL_COEFFICIENT: Record<number, number> = {
  1: 0.55,
  2: 0.6,
  3: 0.66,
  4: 0.72,
  5: 0.78,
  6: 0.84,
  7: 0.9,
  8: 0.96,
  9: 1.02,
  10: 1.08,
  11: 1.14,
  12: 1.2
};

export function levelCoefficient(gameLevel: number): number {
  return LEVEL_COEFFICIENT[gameLevel] ?? LEVEL_COEFFICIENT[12];
}

export function toCalcLevel(gameLevel: number): number {
  return Math.max(1, Math.min(100, Math.round(levelCoefficient(gameLevel) * 50)));
}

export type MoveMeta = {
  category: "physical" | "special" | "status";
  type: string;
  accuracy: number;
  basePower: number;
};

const META_CACHE = new Map<MoveId, MoveMeta>();

/** Type/category/power/accuracy pulled (and cached) from @smogon/calc data. */
export function moveMeta(moveId: MoveId): MoveMeta {
  let meta = META_CACHE.get(moveId);
  if (!meta) {
    const lib = new Move(GEN, MOVES[moveId].calcName);
    meta = {
      category: String(lib.category).toLowerCase() as MoveMeta["category"],
      type: String(lib.type).toLowerCase(),
      accuracy: MOVES[moveId].accuracy,
      basePower: lib.bp ?? 0
    };
    META_CACHE.set(moveId, meta);
  }
  return meta;
}

/** Final stats + max HP for a freshly created battler, computed by @smogon/calc. */
export function computeStats(
  speciesId: SpeciesId,
  calcLevel: number,
  ivs: Stats,
  evs: Stats,
  nature: string
): { stats: Stats; maxHp: number } {
  const mon = new Pokemon(GEN, speciesId, {
    level: calcLevel,
    nature,
    ivs,
    evs,
    ability: speciesAbility(speciesId)
  });
  return {
    stats: {
      hp: mon.stats.hp,
      atk: mon.stats.atk,
      def: mon.stats.def,
      spa: mon.stats.spa,
      spd: mon.stats.spd,
      spe: mon.stats.spe
    },
    maxHp: mon.maxHP()
  };
}

function toPokemon(monster: BattleMonster): Pokemon {
  return new Pokemon(GEN, monster.speciesId, {
    level: monster.calcLevel,
    nature: monster.nature,
    ivs: monster.ivs,
    evs: monster.evs,
    ability: speciesAbility(monster.speciesId),
    boosts: {
      atk: monster.statStages.atk,
      def: monster.statStages.def,
      spa: monster.statStages.spa,
      spd: monster.statStages.spd,
      spe: monster.statStages.spe
    },
    status: monster.status ?? "",
    curHP: monster.currentHp
  });
}

function toField(field?: BattleFieldState): Field {
  if (!field || (!field.weather && !field.terrain)) {
    return new Field();
  }
  return new Field({ weather: field.weather, terrain: field.terrain });
}

/** Pick one random roll out of @smogon/calc's 16-element damage spread. */
function pickRoll(damage: number | number[] | number[][]): number {
  if (typeof damage === "number") {
    return damage;
  }
  if (damage.length === 0) {
    return 0;
  }
  if (Array.isArray(damage[0])) {
    // Multi-hit: roll each hit independently and sum.
    return (damage as number[][]).reduce(
      (sum, rolls) => sum + rolls[Math.floor(Math.random() * rolls.length)],
      0
    );
  }
  const rolls = damage as number[];
  return rolls[Math.floor(Math.random() * rolls.length)];
}

/** Simulate a damaging move and return a single randomly-rolled damage value. */
export function simulateDamage(
  user: BattleMonster,
  target: BattleMonster,
  moveId: MoveId,
  field?: BattleFieldState
): number {
  const result = calculate(
    GEN,
    toPokemon(user),
    toPokemon(target),
    new Move(GEN, MOVES[moveId].calcName),
    toField(field)
  );
  return pickRoll(result.damage);
}
