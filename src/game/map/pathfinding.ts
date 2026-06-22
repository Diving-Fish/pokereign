import type { TileMapData } from "./types";
import { TILE_DEFINITIONS } from "./tiles";

export type TileCoord = { x: number; y: number };

/**
 * Upper bound on tiles expanded by a single path search. The overworld is up to
 * 200x200 (40K tiles), so an unbounded BFS to an unreachable click could scan
 * the whole map every tap. Capping the expansion keeps clicks cheap: faraway or
 * walled-off targets simply return `null` (no movement) instead of stalling.
 */
export const MAX_PATH_SEARCH_NODES = 6000;

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

function isWalkable(map: TileMapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return false;
  }
  // An explicit collision grid (Tiled map) wins; otherwise derive from the tile.
  if (map.collision) {
    return !map.collision[y]?.[x];
  }
  const tile = map.layers.ground[y]?.[x] ?? "wall";
  return !TILE_DEFINITIONS[tile].blocksMovement;
}

/**
 * Breadth-first search for the shortest 4-directional walkable path from `start`
 * to `goal`. Returns the ordered list of tiles to step onto (excluding `start`,
 * including `goal`), an empty array when already at the goal, or `null` when the
 * goal is unreachable, blocked, or beyond {@link MAX_PATH_SEARCH_NODES}.
 */
export function findPath(
  map: TileMapData,
  start: TileCoord,
  goal: TileCoord,
  maxNodes: number = MAX_PATH_SEARCH_NODES
): TileCoord[] | null {
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }
  if (!isWalkable(map, goal.x, goal.y)) {
    return null;
  }

  const key = (x: number, y: number) => y * map.width + x;
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);

  const cameFrom = new Map<number, number>();
  const visited = new Set<number>([startKey]);
  const queue: TileCoord[] = [start];
  let head = 0;
  let expanded = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    expanded += 1;
    if (expanded > maxNodes) {
      return null;
    }

    for (const [dx, dy] of DIRECTIONS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (visited.has(nk) || !isWalkable(map, nx, ny)) {
        continue;
      }
      visited.add(nk);
      cameFrom.set(nk, key(current.x, current.y));
      if (nk === goalKey) {
        return reconstruct(cameFrom, map.width, startKey, goalKey);
      }
      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}

function reconstruct(cameFrom: Map<number, number>, width: number, startKey: number, goalKey: number): TileCoord[] {
  const path: TileCoord[] = [];
  let current = goalKey;
  while (current !== startKey) {
    path.push({ x: current % width, y: Math.floor(current / width) });
    const previous = cameFrom.get(current);
    if (previous === undefined) {
      break;
    }
    current = previous;
  }
  path.reverse();
  return path;
}

/**
 * Check whether the straight line between two world-pixel positions passes
 * entirely through walkable tiles. Samples at quarter-tile intervals so even
 * a wall the line merely grazes is reliably detected.
 */
export function raycastClear(
  map: TileMapData,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) {
    return true;
  }
  const steps = Math.ceil(dist / (map.tileSize * 0.25));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const tx = Math.floor((x0 + dx * t) / map.tileSize);
    const ty = Math.floor((y0 + dy * t) / map.tileSize);
    if (!isWalkable(map, tx, ty)) {
      return false;
    }
  }
  return true;
}
