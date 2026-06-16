import type { TileDefinition, TileId } from "./types";

export const TILE_DEFINITIONS: Record<TileId, TileDefinition> = {
  grass: {
    id: "grass",
    label: "短草地",
    color: "#7aaa57",
    edgeColor: "#1b2319",
    blocksMovement: false
  },
  long_grass: {
    id: "long_grass",
    label: "长草丛",
    color: "#286b37",
    edgeColor: "#16391f",
    blocksMovement: false
  },
  wall: {
    id: "wall",
    label: "岩壁",
    color: "#3b3f36",
    edgeColor: "#1b1d19",
    blocksMovement: true
  },
  dirt: {
    id: "dirt",
    label: "土路",
    color: "#7a5632",
    edgeColor: "#3c2a18",
    blocksMovement: false
  },
  center: {
    id: "center",
    label: "中心遗迹",
    color: "#d9d4c7",
    edgeColor: "#8c8677",
    blocksMovement: false
  },
  boss: {
    id: "boss",
    label: "Boss 点",
    color: "#713848",
    edgeColor: "#351923",
    blocksMovement: false
  }
};
