import type { SpeciesId } from "../data/species";

export type TileId = "grass" | "long_grass" | "wall" | "dirt" | "center" | "boss";

export type TileDefinition = {
  id: TileId;
  label: string;
  color: string;
  edgeColor: string;
  blocksMovement: boolean;
};

export type MapEncounterObject = {
  kind: "encounter";
  id: string;
  x: number;
  y: number;
  speciesId: SpeciesId;
  level: number;
  boss?: boolean;
};

export type MapObject = MapEncounterObject;

export type TileMapData = {
  id: string;
  name: string;
  tileSize: number;
  width: number;
  height: number;
  spawn: {
    x: number;
    y: number;
  };
  layers: {
    ground: TileId[][];
  };
  /**
   * Optional explicit walkability grid (`true` = blocked), indexed `[y][x]`. When
   * present (e.g. the Tiled map derives it from its wall/holes/water layers),
   * pathfinding uses it directly instead of the `TileId` vocabulary. The
   * procedural prototype map omits it and falls back to per-tile `blocksMovement`.
   */
  collision?: boolean[][];
  objects: MapObject[];
};
