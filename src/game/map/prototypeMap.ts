import type { MapObject, TileId, TileMapData } from "./types";

const WIDTH = 200;
const HEIGHT = 200;
const TILE_SIZE = 32;
const SPAWN = { x: 100, y: 100 };

/** Deterministic LCG so the generated field is identical every run. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Keep the spawn pocket walkable so the player never starts stuck in a wall. */
function nearSpawn(x: number, y: number): boolean {
  return Math.abs(x - SPAWN.x) <= 3 && Math.abs(y - SPAWN.y) <= 3;
}

function generateGround(): TileId[][] {
  const rng = makeRng(0x9e3779b1);
  const ground: TileId[][] = [];

  for (let y = 0; y < HEIGHT; y += 1) {
    const row: TileId[] = [];
    for (let x = 0; x < WIDTH; x += 1) {
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) {
        row.push("wall");
        continue;
      }

      if (nearSpawn(x, y)) {
        row.push("grass");
        continue;
      }

      const roll = rng();
      if (roll < 0.06) {
        row.push("wall");
      } else if (roll < 0.22) {
        row.push("long_grass");
      } else if (roll < 0.27) {
        row.push("dirt");
      } else {
        row.push("grass");
      }
    }
    ground.push(row);
  }

  // A pair of orthogonal dirt roads through spawn make scrolling easy to read.
  for (let x = 1; x < WIDTH - 1; x += 1) {
    ground[SPAWN.y][x] = "dirt";
  }
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    ground[y][SPAWN.x] = "dirt";
  }

  return ground;
}

const ground = generateGround();

/** Scatter a handful of visible encounters on walkable tiles across the field. */
function generateObjects(): MapObject[] {
  const species: Array<{ id: "bulbasaur" | "squirtle" | "charmander" | "charmeleon"; level: number }> = [
    { id: "bulbasaur", level: 2 },
    { id: "squirtle", level: 3 },
    { id: "charmander", level: 2 },
    { id: "charmeleon", level: 4 }
  ];
  const rng = makeRng(0x1234abcd);
  const objects: MapObject[] = [];

  for (let i = 0; i < 60; i += 1) {
    const x = 2 + Math.floor(rng() * (WIDTH - 4));
    const y = 2 + Math.floor(rng() * (HEIGHT - 4));
    if (nearSpawn(x, y) || ground[y][x] === "wall") {
      continue;
    }
    const pick = species[Math.floor(rng() * species.length)];
    objects.push({ kind: "encounter", id: `wild-${i}`, x, y, speciesId: pick.id, level: pick.level });
  }

  objects.push({ kind: "encounter", id: "boss-charmeleon", x: SPAWN.x + 12, y: SPAWN.y, speciesId: "charmeleon", level: 5, boss: true });
  return objects;
}

export const PROTOTYPE_MAP: TileMapData = {
  id: "prototype-field",
  name: "原型草原",
  tileSize: TILE_SIZE,
  width: WIDTH,
  height: HEIGHT,
  spawn: { ...SPAWN },
  layers: {
    ground
  },
  objects: generateObjects()
};
