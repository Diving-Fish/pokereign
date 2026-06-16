import type { ElementType } from "../data/types";

const CHART: Partial<Record<ElementType, Partial<Record<ElementType, number>>>> = {
  fire: {
    grass: 2,
    water: 0.5,
    fire: 0.5,
    rock: 0.5
  },
  water: {
    fire: 2,
    rock: 2,
    ground: 2,
    water: 0.5,
    grass: 0.5
  },
  grass: {
    water: 2,
    rock: 2,
    ground: 2,
    fire: 0.5,
    grass: 0.5,
    flying: 0.5
  },
  flying: {
    grass: 2,
    rock: 0.5,
    electric: 0.5
  },
  rock: {
    fire: 2,
    flying: 2,
    ground: 0.5
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    flying: 0
  },
  electric: {
    water: 2,
    flying: 2,
    grass: 0.5,
    electric: 0.5,
    ground: 0
  }
};

export function typeEffectiveness(moveType: ElementType, targetTypes: ElementType[]): number {
  return targetTypes.reduce((multiplier, targetType) => multiplier * (CHART[moveType]?.[targetType] ?? 1), 1);
}
