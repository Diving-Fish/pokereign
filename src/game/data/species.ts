import type { MonsterSpecies } from "./types";

export const SPECIES = {
  charmander: {
    id: "charmander",
    dexNumber: 4,
    spriteSlug: "charmander",
    spriteAnchors: {
      back: { footOffset: 34, scale: 2.9 },
      front: { footOffset: 30, scale: 2.55 }
    },
    name: "小火龙",
    types: ["fire"],
    baseStats: { hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 },
    defaultMoves: ["scratch", "ember", "smokescreen"],
    evolutions: [{ targetSpeciesId: "charmeleon", requiredLevel: 4 }]
  },
  charmeleon: {
    id: "charmeleon",
    dexNumber: 5,
    spriteSlug: "charmeleon",
    spriteAnchors: {
      back: { footOffset: 34, scale: 2.8 },
      front: { footOffset: 30, scale: 2.5 }
    },
    name: "火恐龙",
    types: ["fire"],
    baseStats: { hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80 },
    defaultMoves: ["scratch", "ember", "flameBurst"]
  },
  bulbasaur: {
    id: "bulbasaur",
    dexNumber: 1,
    spriteSlug: "bulbasaur",
    spriteAnchors: {
      back: { footOffset: 38, scale: 2.85 },
      front: { footOffset: 62, scale: 2.65 }
    },
    name: "妙蛙种子",
    types: ["grass"],
    baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
    defaultMoves: ["tackle", "vineWhip", "growl"]
  },
  squirtle: {
    id: "squirtle",
    dexNumber: 7,
    spriteSlug: "squirtle",
    spriteAnchors: {
      back: { footOffset: 36, scale: 2.85 },
      front: { footOffset: 38, scale: 2.6 }
    },
    name: "杰尼龟",
    types: ["water"],
    baseStats: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 },
    defaultMoves: ["tackle", "waterGun", "withdraw"]
  }
} satisfies Record<string, MonsterSpecies>;

export type SpeciesId = keyof typeof SPECIES;
