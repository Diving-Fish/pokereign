import type { MonsterState } from "./monster";
import { randomSeed } from "./rng";

export type Vec2 = { x: number; y: number };

/** One co-op participant: where they stand and the team they own. */
export type PlayerState = {
  position: Vec2;
  team: MonsterState[];
  /**
   * The single backpack slot (doc §11) — one stashed item id, or undefined. The
   * deliberate 1-slot cap forces an immediate decision on pickup; everything else
   * is either used at once, equipped onto a monster (`MonsterState.heldItem`), or
   * disassembled.
   */
  backpack?: string;
};

/**
 * The full serializable snapshot of a run. This is the unit the server will own
 * and broadcast: everything here is plain data (no class instances, no derived
 * fields) so it round-trips through JSON without loss. Derived battle values are
 * recomputed from `team` via `toBattleMonster`, and the seeded RNG is rebuilt
 * from `seed` — neither is stored here.
 */
export type RunState = {
  seed: number;
  mapId: string;
  /** Encounter ids already defeated; their map markers stay gone on return. */
  clearedEncounterIds: string[];
  player: PlayerState;
};

type CreateRunStateOptions = {
  mapId: string;
  spawn: Vec2;
  team: MonsterState[];
  seed?: number;
  clearedEncounterIds?: string[];
};

export function createRunState(options: CreateRunStateOptions): RunState {
  return {
    seed: options.seed ?? randomSeed(),
    mapId: options.mapId,
    clearedEncounterIds: options.clearedEncounterIds ? [...options.clearedEncounterIds] : [],
    player: {
      position: { x: options.spawn.x, y: options.spawn.y },
      team: options.team
    }
  };
}

export function isEncounterCleared(run: RunState, encounterId: string): boolean {
  return run.clearedEncounterIds.includes(encounterId);
}

export function markEncounterCleared(run: RunState, encounterId: string): void {
  if (!run.clearedEncounterIds.includes(encounterId)) {
    run.clearedEncounterIds.push(encounterId);
  }
}

/** Whether the single backpack slot is occupied. */
export function isBackpackFull(run: RunState): boolean {
  return run.player.backpack !== undefined;
}

/** Stash an item in the backpack; returns false if the slot is already taken. */
export function stashInBackpack(run: RunState, itemId: string): boolean {
  if (run.player.backpack !== undefined) {
    return false;
  }
  run.player.backpack = itemId;
  return true;
}

/** Remove and return the backpack item id, if any. */
export function takeFromBackpack(run: RunState): string | undefined {
  const item = run.player.backpack;
  run.player.backpack = undefined;
  return item;
}
