import type { MonsterState } from "./monster";
import { randomSeed } from "./rng";

export type Vec2 = { x: number; y: number };

/** One co-op participant: where they stand and the team they own. */
export type PlayerState = {
  position: Vec2;
  team: MonsterState[];
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
