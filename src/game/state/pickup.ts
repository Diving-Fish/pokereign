import { ITEMS, type ItemId } from "../data/items";
import { canUseItemOnMonster } from "./items";
import { isBackpackFull, type RunState } from "./runState";

/**
 * The pickup decision (doc §11.1). When an item is picked up the player must
 * immediately choose one of four things to do with it — the deliberate "no
 * hoarding" pressure of the single backpack slot. This module is the pure logic
 * for that decision: which choices are even available for a given item + run
 * state, and the disassembly (分解 → coins) payoff. The actual modal lives in the render layer;
 * use/equip/stash reuse the existing primitives (`useItemOnMonster`,
 * `equipHeldItem`, `stashInBackpack`), and 分解 resolves through {@link scrapItem}.
 */
export type PickupActionKind = "use" | "equip" | "stash" | "scrap";

export type PickupOptions = {
  itemId: ItemId;
  /** 立即使用: usable right now on at least one team member. */
  canUse: boolean;
  /** Team indices the item can be used on right now (a subset for the picker). */
  useTargets: number[];
  /** 携带: can be equipped (held items + berries; any member can hold it). */
  canEquip: boolean;
  /** Team indices that can be given the item to hold (all members, if equippable). */
  equipTargets: number[];
  /** 进背包: the single backpack slot is free. */
  canStash: boolean;
  /** 分解: always available — the coins it would yield. */
  scrapValue: number;
};

/**
 * Only held items and berries do anything when carried (held items hit battle
 * via calc; berries auto-trigger later). Stones / TMs / medicine are never
 * "held" — they are used, stashed, or scrapped — so 携带 isn't offered for them.
 */
export function canEquipItem(itemId: ItemId): boolean {
  const kind = ITEMS[itemId].kind;
  return kind === "held" || kind === "berry";
}

/**
 * Coins from disassembling an item — a placeholder economy (doc §11). Rarer/key
 * items (stones, TMs) are worth more than consumables. Values are tuning
 * placeholders pending the shop / crafting sink.
 */
export function scrapValueOf(itemId: ItemId): number {
  switch (ITEMS[itemId].kind) {
    case "stone":
    case "tm":
      return 3;
    case "held":
      return 2;
    case "medicine":
    case "berry":
      return 1;
    default:
      return 1;
  }
}

/** Compute which of the four pickup choices to offer for `itemId` right now. */
export function pickupOptions(run: RunState, itemId: ItemId): PickupOptions {
  const team = run.player.team;
  const useTargets: number[] = [];
  team.forEach((mon, i) => {
    if (canUseItemOnMonster(mon, itemId)) {
      useTargets.push(i);
    }
  });
  const equip = canEquipItem(itemId);
  return {
    itemId,
    canUse: useTargets.length > 0,
    useTargets,
    canEquip: equip && team.length > 0,
    equipTargets: equip ? team.map((_, i) => i) : [],
    canStash: !isBackpackFull(run),
    scrapValue: scrapValueOf(itemId)
  };
}

/** Disassemble the item, crediting its coin value to the run. Returns the gain. */
export function scrapItem(run: RunState, itemId: ItemId): number {
  const value = scrapValueOf(itemId);
  run.player.coins = (run.player.coins ?? 0) + value;
  return value;
}
