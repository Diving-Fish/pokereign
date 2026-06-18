import type { SpeciesId } from "./species";
import { SPECIES } from "./species";

const SHOWDOWN_SPRITE_PROXY_BASE_URL = "/pokemon-sprites";

export function getBattleSpriteUrl(speciesId: SpeciesId, facing: "front" | "back"): string {
  const spriteSlug = SPECIES[speciesId].spriteSlug;
  const folder = facing === "front" ? "gen5" : "gen5-back";
  return `${SHOWDOWN_SPRITE_PROXY_BASE_URL}/${folder}/${spriteSlug}.png`;
}

/**
 * Gen6 (X/Y) animated battle sprites. These are variable-size GIFs drawn at
 * near-native resolution (relative body size is baked into the dimensions), in
 * contrast to the fixed 96×96 gen5 stills. Served as `.gif` through the same
 * dev proxy.
 */
export function getAnimatedBattleSpriteUrl(speciesId: SpeciesId, facing: "front" | "back"): string {
  const spriteSlug = SPECIES[speciesId].spriteSlug;
  const folder = facing === "front" ? "ani" : "ani-back";
  return `${SHOWDOWN_SPRITE_PROXY_BASE_URL}/${folder}/${spriteSlug}.gif`;
}

export function getAllBattleSpriteUrls(): string[] {
  return Object.keys(SPECIES).flatMap((speciesId) => [
    getBattleSpriteUrl(speciesId as SpeciesId, "front"),
    getBattleSpriteUrl(speciesId as SpeciesId, "back")
  ]);
}

export function getAllAnimatedBattleSpriteUrls(): string[] {
  return Object.keys(SPECIES).flatMap((speciesId) => [
    getAnimatedBattleSpriteUrl(speciesId as SpeciesId, "front"),
    getAnimatedBattleSpriteUrl(speciesId as SpeciesId, "back")
  ]);
}
