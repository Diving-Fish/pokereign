import type { TileId, TileMapData } from "./types";

const LEGEND: Record<string, TileId> = {
  "#": "wall",
  ".": "grass",
  "g": "long_grass",
  "h": "dirt",
  "c": "center",
  "b": "boss"
};

const rows = [
  "####################",
  "#......g......h....#",
  "#..ggggg...........#",
  "#..g....g..........#",
  "#.......g..........#",
  "#.......g....######",
  "#............#....#",
  "#....####....#....#",
  "#............#....#",
  "#..h.........#....#",
  "#............#....#",
  "#......c..........#",
  "#............g....#",
  "#................b#",
  "####################"
];

export const PROTOTYPE_MAP: TileMapData = {
  id: "prototype-field",
  name: "原型草地",
  tileSize: 32,
  width: 20,
  height: 15,
  spawn: { x: 2, y: 2 },
  layers: {
    ground: rows.map((row) => row.split("").map((token) => LEGEND[token] ?? "grass"))
  },
  objects: [
    { kind: "encounter", id: "wild-bulbasaur", x: 8, y: 3, speciesId: "bulbasaur", level: 2 },
    { kind: "encounter", id: "wild-squirtle", x: 14, y: 9, speciesId: "squirtle", level: 3 },
    { kind: "encounter", id: "boss-squirtle", x: 18, y: 13, speciesId: "squirtle", level: 4, boss: true }
  ]
};
