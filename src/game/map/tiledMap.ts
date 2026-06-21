import type { MapObject, TileMapData } from "./types";
import type { TiledManifest, TiledTileLayer } from "./tiledTypes";
import type { SpeciesId } from "../data/species";

// Layers whose non-empty cells block movement. Tunable: add "terrain-river" to
// make water impassable (its banks would also block, so it's left out for now).
const BLOCKING_LAYERS: ReadonlyArray<string> = ["wall", "holes"];

// Layers whose non-empty cells are water. Water is still *walkable* (bridges run
// over it), but spawn + encounters avoid dropping onto open water so the player
// and wild markers read as standing on land.
const WATER_LAYERS: ReadonlyArray<string> = ["terrain-river"];

// Preferred drop point for the player; the loader snaps to the nearest open
// land tile if this exact cell is blocked or water.
const PREFERRED_SPAWN = { x: 8, y: 10 };

/** Deterministic LCG so encounter placement is identical every run. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** OR together the non-empty cells of the named tile layers into a `[y][x]` grid. */
function buildLayerMask(manifest: TiledManifest, layerNames: ReadonlyArray<string>): boolean[][] {
  const { width, height } = manifest;
  const grid: boolean[][] = Array.from({ length: height }, () => new Array<boolean>(width).fill(false));
  const tileLayers = manifest.layers.filter((l): l is TiledTileLayer => l.kind === "tilelayer");

  for (const layer of tileLayers) {
    if (!layerNames.includes(layer.name)) {
      continue;
    }
    for (let i = 0; i < layer.data.length; i += 1) {
      if (layer.data[i] !== 0) {
        grid[Math.floor(i / width)][i % width] = true;
      }
    }
  }
  return grid;
}

/** Nearest tile to `start` satisfying `ok`, by expanding-ring search. */
function nearestTile(
  width: number,
  height: number,
  start: { x: number; y: number },
  ok: (x: number, y: number) => boolean
): { x: number; y: number } {
  if (ok(start.x, start.y)) {
    return { ...start };
  }
  for (let r = 1; r < Math.max(width, height); r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = start.x + dx;
        const y = start.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height && ok(x, y)) {
          return { x, y };
        }
      }
    }
  }
  return { ...start };
}

/** Scatter a handful of encounters + one boss onto open land, away from spawn. */
function generateObjects(
  manifest: TiledManifest,
  isLand: (x: number, y: number) => boolean,
  spawn: { x: number; y: number }
): MapObject[] {
  const species: Array<{ id: SpeciesId; level: number }> = [
    { id: "bulbasaur", level: 2 },
    { id: "squirtle", level: 3 },
    { id: "charmander", level: 2 },
    { id: "charmeleon", level: 4 }
  ];
  const rng = makeRng(0x1234abcd);
  const objects: MapObject[] = [];
  const nearSpawn = (x: number, y: number) => Math.abs(x - spawn.x) <= 2 && Math.abs(y - spawn.y) <= 2;
  const occupied = new Set<string>();

  let attempts = 0;
  while (objects.length < 10 && attempts < 400) {
    attempts += 1;
    const x = Math.floor(rng() * manifest.width);
    const y = Math.floor(rng() * manifest.height);
    const key = `${x},${y}`;
    if (!isLand(x, y) || nearSpawn(x, y) || occupied.has(key)) {
      continue;
    }
    occupied.add(key);
    const pick = species[Math.floor(rng() * species.length)];
    objects.push({ kind: "encounter", id: `wild-${objects.length}`, x, y, speciesId: pick.id, level: pick.level });
  }

  // A fixed boss anchored a few tiles right of spawn (snapped to open land).
  const boss = nearestTile(manifest.width, manifest.height, { x: spawn.x + 6, y: spawn.y }, isLand);
  objects.push({ kind: "encounter", id: "boss-charmeleon", x: boss.x, y: boss.y, speciesId: "charmeleon", level: 6, boss: true });
  return objects;
}

/**
 * Load the authored Tiled scene: fetch its flattened manifest, derive a
 * walkability grid + spawn + encounters, and return both the logic-side
 * {@link TileMapData} (consumed by run state and pathfinding) and the raw
 * {@link TiledManifest} (consumed by the renderer).
 */
export async function loadTiledMap(url: string): Promise<{ map: TileMapData; manifest: TiledManifest }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load Tiled map "${url}": ${response.status}`);
  }
  const manifest = (await response.json()) as TiledManifest;

  const collision = buildLayerMask(manifest, BLOCKING_LAYERS);
  const water = buildLayerMask(manifest, WATER_LAYERS);
  // "Open land" = walkable and not water; used only to seat the player and wild
  // markers (movement itself is governed by `collision`, so bridges stay usable).
  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < manifest.width && y < manifest.height && !collision[y][x] && !water[y][x];

  const spawn = nearestTile(manifest.width, manifest.height, PREFERRED_SPAWN, isLand);
  const objects = generateObjects(manifest, isLand, spawn);

  const map: TileMapData = {
    id: "sample-tiled-field",
    name: "样例地图",
    tileSize: manifest.tilewidth,
    width: manifest.width,
    height: manifest.height,
    spawn,
    layers: { ground: [] },
    collision,
    objects
  };

  return { map, manifest };
}
