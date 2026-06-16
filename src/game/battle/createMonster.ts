import { SPECIES, type SpeciesId } from "../data/species";
import type { MoveId } from "../data/moves";
import type { Stats } from "../data/types";
import type { BattleMonster, BattleSide } from "./types";

const LEVEL_MULTIPLIER: Record<number, number> = {
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

let nextInstanceId = 1;

export function createMonster(speciesId: SpeciesId, level: number, side: BattleSide = "player"): BattleMonster {
  const species = SPECIES[speciesId];
  const stats = calculateStats(species.baseStats, level);

  return {
    instanceId: `${side}-${speciesId}-${nextInstanceId++}`,
    side,
    speciesId,
    name: species.name,
    types: species.types,
    level,
    maxHp: stats.hp,
    currentHp: stats.hp,
    stats,
    moves: species.defaultMoves.slice(0, 4) as MoveId[],
    statStages: {
      atk: 0,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 0,
      accuracy: 0
    }
  };
}

function calculateStats(baseStats: Stats, level: number): Stats {
  const multiplier = LEVEL_MULTIPLIER[level] ?? LEVEL_MULTIPLIER[12];
  return {
    hp: Math.round((65.5 + baseStats.hp) * multiplier + 5),
    atk: calculateNonHp(baseStats.atk, multiplier),
    def: calculateNonHp(baseStats.def, multiplier),
    spa: calculateNonHp(baseStats.spa, multiplier),
    spd: calculateNonHp(baseStats.spd, multiplier),
    spe: calculateNonHp(baseStats.spe, multiplier)
  };
}

function calculateNonHp(base: number, multiplier: number): number {
  return Math.round((15.5 + base) * multiplier + 5);
}
