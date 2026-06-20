import { type ItemId } from "../data/items";
import type { Rng } from "./rng";

/**
 * Post-battle reward generation. Every won battle offers a 3-choose-1 of items;
 * the chosen one drops into the doc §11.1 pickup decision (使用/携带/收起/分解).
 *
 * TODO(drop-pool): replace the flat placeholder pool below with a real weighted
 * drop pool keyed by encounter tier / biome / boss flag (doc §12 奖励分层) — rarer
 * items from tougher foes, type-themed drops by biome, guaranteed key items from
 * bosses, etc. The roll API (seeded `Rng` in, distinct `ItemId[]` out) is meant
 * to stay; only the source pool / weighting changes.
 */

/** Placeholder pool — a spread across kinds so the choice is varied for now. */
const PLACEHOLDER_POOL: ItemId[] = [
  "potion",
  "superPotion",
  "revive",
  "rareCandy",
  "charcoal",
  "mysticWater",
  "miracleSeed",
  "magnet",
  "lifeOrb",
  "leftovers",
  "choiceBand",
  "assaultVest",
  "fireStone",
  "waterStone",
  "thunderStone",
  "leafStone",
  "tmFlamethrower",
  "tmThunderbolt",
  "tmIceBeam",
  "tmEarthquake",
  "sitrusBerry",
  "lumBerry"
];

export const BATTLE_REWARD_CHOICES = 3;

/**
 * Roll the post-battle reward options: {@link BATTLE_REWARD_CHOICES} distinct
 * items the player picks one of. Uses the seeded run `Rng` so the roll is
 * deterministic and server-reproducible.
 */
export function rollBattleRewards(rng: Rng, count = BATTLE_REWARD_CHOICES): ItemId[] {
  const pool = [...PLACEHOLDER_POOL];
  const out: ItemId[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const idx = rng.int(pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1); // keep choices distinct
  }
  return out;
}
