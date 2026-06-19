import { Generations, toID } from "@smogon/calc";
import type { ElementType } from "../data/types";

const GEN = Generations.get(9);

/**
 * @smogon/calc keys its type-effectiveness map by capitalized type name
 * ("Grass", "Fire", ...), while our `ElementType` is lowercase. Cache the
 * lowercase→multiplier lookup per attacking type so the full 18-type chart is
 * sourced from calc (the project's single数值真理源) rather than hand-maintained.
 */
const CHART_CACHE = new Map<ElementType, Record<string, number>>();

function chartFor(moveType: ElementType): Record<string, number> {
  let row = CHART_CACHE.get(moveType);
  if (!row) {
    const calcType = GEN.types.get(toID(moveType));
    row = {};
    if (calcType?.effectiveness) {
      for (const [defType, mult] of Object.entries(calcType.effectiveness)) {
        row[defType.toLowerCase()] = mult as number;
      }
    }
    CHART_CACHE.set(moveType, row);
  }
  return row;
}

export function typeEffectiveness(moveType: ElementType, targetTypes: ElementType[]): number {
  const row = chartFor(moveType);
  return targetTypes.reduce((multiplier, targetType) => multiplier * (row[targetType] ?? 1), 1);
}
