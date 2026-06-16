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
  objects: MapObject[];
};
