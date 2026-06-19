import { Generations, toID } from "@smogon/calc";
import { SPECIES, type SpeciesId } from "./species";
import type { ElementType, MonsterSpecies, Stats } from "./types";

/**
 * Thin wrapper over `@smogon/calc`'s gen-9 Pokédex: base stats, types, and the
 * primary ability are *sourced from calc* (keyed by species id), so a new
 * species entry only needs its zh name / sprite / learnset / evolutions, never a
 * hand-copied stat block. A `MonsterSpecies` may still override any of these.
 */
const GEN = Generations.get(9);

const TYPES_CACHE = new Map<SpeciesId, ElementType[]>();
const ABILITY_CACHE = new Map<SpeciesId, string>();
const STATS_CACHE = new Map<SpeciesId, Stats>();

/** The species' element types (calc-sourced, lowercased), or the local override. */
export function speciesTypes(id: SpeciesId): ElementType[] {
  const override = (SPECIES[id] as MonsterSpecies).types;
  if (override) return override;
  let cached = TYPES_CACHE.get(id);
  if (!cached) {
    const dex = GEN.species.get(toID(id));
    cached = (dex?.types ?? ["Normal"]).map((t) => t.toLowerCase() as ElementType);
    TYPES_CACHE.set(id, cached);
  }
  return cached;
}

/** The species' primary ability (calc slot 0), or the local override. */
export function speciesAbility(id: SpeciesId): string {
  const override = (SPECIES[id] as MonsterSpecies).ability;
  if (override) return override;
  let cached = ABILITY_CACHE.get(id);
  if (!cached) {
    const dex = GEN.species.get(toID(id));
    cached = dex?.abilities?.[0] ?? "";
    ABILITY_CACHE.set(id, cached);
  }
  return cached;
}

/** The species' base stats (calc-sourced), or the local override. */
export function speciesBaseStats(id: SpeciesId): Stats {
  const override = (SPECIES[id] as MonsterSpecies).baseStats;
  if (override) return override;
  let cached = STATS_CACHE.get(id);
  if (!cached) {
    const dex = GEN.species.get(toID(id));
    const bs = dex?.baseStats ?? { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    cached = { hp: bs.hp, atk: bs.atk, def: bs.def, spa: bs.spa, spd: bs.spd, spe: bs.spe };
    STATS_CACHE.set(id, cached);
  }
  return cached;
}
