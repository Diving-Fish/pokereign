// Shape of the self-contained manifest produced by `scripts/build-map-assets.mjs`
// from `Sample map.tmj`. Pure data — both the logic loader (`tiledMap.ts`) and the
// Pixi renderer (`tiledMapView.ts`) read it. Image paths are relative to the
// manifest (served from `/assets/map/`).

export type TiledSheetTileset = {
  firstgid: number;
  kind: "sheet";
  image: string;
  imagewidth: number;
  imageheight: number;
  columns: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
};

export type TiledCollectionTile = { image: string; width: number; height: number };

export type TiledCollectionTileset = {
  firstgid: number;
  kind: "collection";
  tilewidth: number;
  tileheight: number;
  /** localId (gid - firstgid) -> image. Only map-referenced tiles are present. */
  tiles: Record<string, TiledCollectionTile>;
};

export type TiledTileset = TiledSheetTileset | TiledCollectionTileset;

export type TiledTileLayer = { kind: "tilelayer"; name: string; data: number[] };

export type TiledObject = { gid: number; x: number; y: number; width: number; height: number };

export type TiledObjectGroup = {
  kind: "objectgroup";
  name: string;
  draworder: "topdown" | "index";
  objects: TiledObject[];
};

export type TiledLayer = TiledTileLayer | TiledObjectGroup;

export type TiledManifest = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  tilesets: TiledTileset[];
  layers: TiledLayer[];
};

// Tiled packs per-tile flip state into the top 3 gid bits.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

export type ResolvedGid = {
  tileset: TiledTileset;
  /** Tile index within its tileset (gid - firstgid, flip bits removed). */
  localId: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
};

/**
 * Map a raw gid (possibly carrying flip bits) to its tileset + local tile id.
 * Returns `null` for gid 0 (empty) or any gid outside the manifest's tilesets.
 * `tilesets` must be sorted ascending by `firstgid` (the build script guarantees it).
 */
export function resolveGid(tilesets: TiledTileset[], rawGid: number): ResolvedGid | null {
  const gid = rawGid & GID_MASK;
  if (gid === 0) {
    return null;
  }
  let chosen: TiledTileset | undefined;
  for (const ts of tilesets) {
    if (ts.firstgid <= gid) {
      chosen = ts;
    } else {
      break;
    }
  }
  if (!chosen) {
    return null;
  }
  return {
    tileset: chosen,
    localId: gid - chosen.firstgid,
    flipH: (rawGid & FLIP_H) !== 0,
    flipV: (rawGid & FLIP_V) !== 0,
    flipD: (rawGid & FLIP_D) !== 0
  };
}
