import type { SpeciesId } from "./species";
import { SPECIES } from "./species";

const SHOWDOWN_SPRITE_PROXY_BASE_URL = "/pokemon-sprites";

export function getBattleSpriteUrl(speciesId: SpeciesId, facing: "front" | "back"): string {
  const spriteSlug = SPECIES[speciesId].spriteSlug;
  const folder = facing === "front" ? "gen5" : "gen5-back";
  return `${SHOWDOWN_SPRITE_PROXY_BASE_URL}/${folder}/${spriteSlug}.png`;
}

export function getAllBattleSpriteUrls(): string[] {
  return Object.keys(SPECIES).flatMap((speciesId) => [
    getBattleSpriteUrl(speciesId as SpeciesId, "front"),
    getBattleSpriteUrl(speciesId as SpeciesId, "back")
  ]);
}
