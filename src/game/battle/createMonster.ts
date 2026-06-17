import { SPECIES, type SpeciesId } from "../data/species";
import type { MoveId } from "../data/moves";
import type { Stats } from "../data/types";
import type { BattleMonster, BattleSide } from "./types";
import { computeStats, toCalcLevel } from "./smogonCalc";

const DEFAULT_IVS: Stats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const DEFAULT_NATURE = "Hardy";

type CreateMonsterOptions = {
  ivs?: Stats;
  nature?: string;
};

let nextInstanceId = 1;

export function createMonster(
  speciesId: SpeciesId,
  level: number,
  side: BattleSide = "player",
  options: CreateMonsterOptions = {}
): BattleMonster {
  const species = SPECIES[speciesId];
  const ivs = options.ivs ?? DEFAULT_IVS;
  const nature = options.nature ?? DEFAULT_NATURE;
  const calcLevel = toCalcLevel(level);
  const { stats, maxHp } = computeStats(speciesId, calcLevel, ivs, nature);

  return {
    instanceId: `${side}-${speciesId}-${nextInstanceId++}`,
    side,
    speciesId,
    name: species.name,
    types: species.types,
    level,
    calcLevel,
    ivs,
    nature,
    status: null,
    maxHp,
    currentHp: maxHp,
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
