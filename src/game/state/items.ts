import { ITEMS, type Item, type ItemId } from "../data/items";
import { SPECIES, type SpeciesId } from "../data/species";
import type { MonsterSpecies } from "../data/types";
import type { MoveId } from "../data/moves";
import { evolveTo, learnMoveIntoSlot, MAX_MOVES, maxHpOf, type MonsterState } from "./monster";

/**
 * Outcome of using a (non-held) item on a monster. `learnChoice` means a TM's
 * move couldn't fit (4 slots full) — the caller opens the move-learn modal and
 * resolves it with {@link learnMoveIntoSlot}. `consumed` says whether the item
 * should be removed from inventory (a no-op use is not consumed).
 */
export type ItemUseResult =
  | { ok: true; consumed: true; kind: "evolved"; fromSpeciesId: SpeciesId; toSpeciesId: SpeciesId }
  | { ok: true; consumed: true; kind: "learned"; moveId: MoveId }
  | { ok: true; consumed: false; kind: "learnChoice"; moveId: MoveId }
  | { ok: true; consumed: true; kind: "healed"; amount: number }
  | { ok: true; consumed: true; kind: "revived"; amount: number }
  | { ok: false; consumed: false; reason: string };

function species(id: SpeciesId): MonsterSpecies {
  return SPECIES[id];
}

/**
 * Use a stone / TM / medicine item on a monster, mutating it in place. Held
 * items are equipped via {@link equipHeldItem}, not used. Returns what happened
 * (and whether the item was consumed).
 */
export function useItemOnMonster(state: MonsterState, itemId: ItemId): ItemUseResult {
  const item: Item = ITEMS[itemId];

  if (item.kind === "stone") {
    const rule = species(state.speciesId).evolutions?.find((e) => e.requiredItem === itemId);
    if (!rule) {
      return { ok: false, consumed: false, reason: "对这只宝可梦没有效果。" };
    }
    if (state.currentHp <= 0) {
      return { ok: false, consumed: false, reason: "倒下的宝可梦无法进化。" };
    }
    const fromSpeciesId = state.speciesId;
    evolveTo(state, rule.targetSpeciesId as SpeciesId);
    return { ok: true, consumed: true, kind: "evolved", fromSpeciesId, toSpeciesId: state.speciesId };
  }

  if (item.kind === "tm" && item.teachesMove) {
    const moveId = item.teachesMove;
    if (state.moves.includes(moveId)) {
      return { ok: false, consumed: false, reason: "已经学会了这个招式。" };
    }
    if (state.moves.length < MAX_MOVES) {
      state.moves.push(moveId);
      return { ok: true, consumed: true, kind: "learned", moveId };
    }
    // 4 slots full — caller opens the move-learn modal.
    return { ok: true, consumed: false, kind: "learnChoice", moveId };
  }

  if (item.kind === "medicine" || item.kind === "berry") {
    if (item.revive !== undefined) {
      if (state.currentHp > 0) {
        return { ok: false, consumed: false, reason: "它还很有精神，不需要复活。" };
      }
      const amount = Math.max(1, Math.round(maxHpOf(state) * item.revive));
      state.currentHp = amount;
      return { ok: true, consumed: true, kind: "revived", amount };
    }
    if (item.healFull || item.heal) {
      if (state.currentHp <= 0) {
        return { ok: false, consumed: false, reason: "倒下的宝可梦需要用活力碎片。" };
      }
      const max = maxHpOf(state);
      if (state.currentHp >= max) {
        return { ok: false, consumed: false, reason: "体力已经全满了。" };
      }
      const before = state.currentHp;
      state.currentHp = item.healFull ? max : Math.min(max, state.currentHp + (item.heal ?? 0));
      return { ok: true, consumed: true, kind: "healed", amount: state.currentHp - before };
    }
  }

  return { ok: false, consumed: false, reason: "现在没办法这样使用它。" };
}

/**
 * Non-mutating check: would {@link useItemOnMonster} succeed on this monster
 * right now? Mirrors the success conditions there. Held items (type boosters,
 * signature items) are never "used" — they are equipped — so they return false.
 * The UI uses this to decide whether to offer a 使用 / 携带 choice or default to
 * just equipping.
 */
export function canUseItemOnMonster(state: MonsterState, itemId: ItemId): boolean {
  const item: Item = ITEMS[itemId];

  if (item.kind === "stone") {
    if (state.currentHp <= 0) {
      return false;
    }
    return species(state.speciesId).evolutions?.some((e) => e.requiredItem === itemId) ?? false;
  }

  if (item.kind === "tm" && item.teachesMove) {
    return !state.moves.includes(item.teachesMove);
  }

  if (item.kind === "medicine" || item.kind === "berry") {
    if (item.revive !== undefined) {
      return state.currentHp <= 0;
    }
    if (item.healFull || item.heal) {
      return state.currentHp > 0 && state.currentHp < maxHpOf(state);
    }
  }

  return false;
}

/** Resolve a TM `learnChoice`: teach `moveId` into slot `index`. */
export function teachTmIntoSlot(state: MonsterState, moveId: MoveId, index: number): boolean {
  return learnMoveIntoSlot(state, moveId, index);
}

/** Equip a held item, returning the item id it replaced (if any). */
export function equipHeldItem(state: MonsterState, itemId: ItemId): string | undefined {
  const prev = state.heldItem;
  state.heldItem = itemId;
  return prev;
}

/** Remove and return the monster's held item id, if any. */
export function unequipHeldItem(state: MonsterState): string | undefined {
  const prev = state.heldItem;
  state.heldItem = undefined;
  return prev;
}
