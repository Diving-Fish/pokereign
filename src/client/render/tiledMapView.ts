import { Assets, Container, Graphics, Rectangle, Sprite, Texture, type EventSystem, type FederatedPointerEvent } from "pixi.js";
import { CompositeTilemap } from "@pixi/tilemap";
import { Viewport } from "pixi-viewport";
import type { TileMapData } from "../../game/map/types";
import type { TiledManifest, TiledSheetTileset } from "../../game/map/tiledTypes";
import { resolveGid } from "../../game/map/tiledTypes";
// Reuse the generic camera/marker/overlay helpers (importing also runs mapView's
// `tilemapSettings.use32bitIndex = true` side effect).
import type { MapRenderView } from "./mapView";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";

/** Load every image the manifest references, as nearest-sampled textures keyed by url. */
async function loadTextures(manifest: TiledManifest, assetBase: string): Promise<Map<string, Texture>> {
  const urls = new Set<string>();
  for (const ts of manifest.tilesets) {
    if (ts.kind === "sheet") {
      urls.add(ts.image);
    } else {
      for (const tile of Object.values(ts.tiles)) {
        urls.add(tile.image);
      }
    }
  }

  const byUrl = new Map<string, Texture>();
  await Promise.all(
    [...urls].map(async (rel) => {
      const texture = await Assets.load<Texture>(assetBase + rel);
      // Pixel-art tilesets must not bleed/blur when the camera scales.
      texture.source.scaleMode = "nearest";
      byUrl.set(rel, texture);
    })
  );
  return byUrl;
}

/**
 * Build a `rawGid -> Texture` resolver. Sheet tiles become cached sub-textures
 * (a frame into the shared sheet source); collection tiles map straight to their
 * member image. Returns `null` for empty/out-of-range gids.
 */
function makeGidResolver(manifest: TiledManifest, textures: Map<string, Texture>): (rawGid: number) => Texture | null {
  const sheetCache = new Map<number, Texture>();

  const sheetFrame = (ts: TiledSheetTileset, localId: number): Rectangle => {
    const col = localId % ts.columns;
    const row = Math.floor(localId / ts.columns);
    return new Rectangle(
      ts.margin + col * (ts.tilewidth + ts.spacing),
      ts.margin + row * (ts.tileheight + ts.spacing),
      ts.tilewidth,
      ts.tileheight
    );
  };

  return (rawGid: number) => {
    const resolved = resolveGid(manifest.tilesets, rawGid);
    if (!resolved) {
      return null;
    }
    const { tileset, localId } = resolved;
    if (tileset.kind === "collection") {
      const tile = tileset.tiles[localId];
      return tile ? textures.get(tile.image) ?? null : null;
    }
    const cached = sheetCache.get(rawGid & 0x1fffffff);
    if (cached) {
      return cached;
    }
    const base = textures.get(tileset.image);
    if (!base) {
      return null;
    }
    const sub = new Texture({ source: base.source, frame: sheetFrame(tileset, localId) });
    sheetCache.set(rawGid & 0x1fffffff, sub);
    return sub;
  };
}

/** Place an object-layer tile sprite, honouring Tiled's bottom-left anchor + flip flags. */
function placeObjectSprite(texture: Texture, obj: { x: number; y: number; width: number; height: number }, flipH: boolean, flipV: boolean): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0, 1); // Tiled tile objects are anchored at their bottom-left.
  sprite.scale.set(obj.width / texture.width, obj.height / texture.height);
  sprite.position.set(obj.x, obj.y);
  // Mirror around the anchored edge, then shift so the footprint stays in place.
  if (flipH) {
    sprite.scale.x = -sprite.scale.x;
    sprite.x = obj.x + obj.width;
  }
  if (flipV) {
    sprite.scale.y = -sprite.scale.y;
    sprite.y = obj.y - obj.height;
  }
  return sprite;
}

/**
 * Build the render view for the authored Tiled map. Mirrors `createMapRenderView`'s
 * {@link MapRenderView} contract so `main.ts` and the per-frame update helpers in
 * `mapView.ts` work unchanged — only the tile/object drawing differs. Async because
 * the tileset PNGs are fetched up front.
 */
export async function createTiledMapRenderView(
  map: TileMapData,
  manifest: TiledManifest,
  assetBase: string,
  events: EventSystem,
  clearedEncounterIds: ReadonlySet<string> = new Set(),
  onWorldTap?: (worldX: number, worldY: number) => void
): Promise<MapRenderView> {
  const ts = map.tileSize;
  const worldWidth = manifest.width * ts;
  const worldHeight = manifest.height * ts;

  const textures = await loadTextures(manifest, assetBase);
  const textureForGid = makeGidResolver(manifest, textures);

  const viewport = new Viewport({ screenWidth: GAME_WIDTH, screenHeight: GAME_HEIGHT, worldWidth, worldHeight, events });
  viewport.clamp({ direction: "all", underflow: "center" });

  if (onWorldTap) {
    viewport.eventMode = "static";
    viewport.hitArea = new Rectangle(0, 0, worldWidth, worldHeight);
    viewport.on("pointertap", (event: FederatedPointerEvent) => {
      const world = viewport.toWorld(event.global);
      onWorldTap(world.x, world.y);
    });
  }

  // The props and the player share one y-sorted container so the player is
  // occluded by trees/structures it stands behind (and draws over those below
  // it). Terrain/wall tile layers and tree-shadow decals stay flat beneath it;
  // encounter markers stay above. `sortableChildren` re-sorts by `zIndex` each
  // frame, so updating the player's `zIndex` as it walks is enough.
  const entityLayer = new Container();
  entityLayer.sortableChildren = true;
  // Walk-path trail sits at the bottom of the entity layer — over the ground/wall
  // tiles, under every prop and the player.
  const pathOverlay = new Graphics();
  pathOverlay.zIndex = -1e9;
  entityLayer.addChild(pathOverlay);

  let entityLayerAttached = false;
  const attachEntityLayer = () => {
    if (!entityLayerAttached) {
      viewport.addChild(entityLayer);
      entityLayerAttached = true;
    }
  };

  // Draw layers in manifest order (Tiled lists them bottom-to-top).
  manifest.layers.forEach((layer, layerIndex) => {
    if (layer.kind === "tilelayer") {
      const tilemap = new CompositeTilemap();
      for (let i = 0; i < layer.data.length; i += 1) {
        const texture = textureForGid(layer.data[i]);
        if (!texture) {
          continue;
        }
        tilemap.tile(texture, (i % manifest.width) * ts, Math.floor(i / manifest.width) * ts);
      }
      viewport.addChild(tilemap);
      return;
    }

    // "props*" object layers are sortable entities that occlude the player; other
    // object layers (e.g. tree shadows) stay flat in their authored order.
    if (layer.name.startsWith("props")) {
      attachEntityLayer();
      for (const obj of layer.objects) {
        const resolved = resolveGid(manifest.tilesets, obj.gid);
        const texture = textureForGid(obj.gid);
        if (!resolved || !texture) {
          continue;
        }
        const sprite = placeObjectSprite(texture, obj, resolved.flipH, resolved.flipV);
        // Sort by the sprite's baseline (Tiled object y = its bottom edge). The
        // tiny per-layer bias keeps props2 over props1 over props0 on exact ties.
        sprite.zIndex = obj.y + layerIndex * 1e-3;
        entityLayer.addChild(sprite);
      }
      return;
    }

    const group = new Container();
    const objects = layer.draworder === "topdown" ? [...layer.objects].sort((a, b) => a.y - b.y) : layer.objects;
    for (const obj of objects) {
      const resolved = resolveGid(manifest.tilesets, obj.gid);
      const texture = textureForGid(obj.gid);
      if (!resolved || !texture) {
        continue;
      }
      group.addChild(placeObjectSprite(texture, obj, resolved.flipH, resolved.flipV));
    }
    viewport.addChild(group);
  });
  attachEntityLayer(); // ensure it exists (and is above the tiles) even with no prop layers

  // Encounter markers sit above the entity layer so they're never hidden by props.
  const encounterMarkers = new Map<string, Graphics>();
  for (const encounter of map.objects.filter((object) => object.kind === "encounter")) {
    if (clearedEncounterIds.has(encounter.id)) {
      continue;
    }
    const marker = new Graphics();
    marker.rect(encounter.x * ts + 8, encounter.y * ts + 8, 16, 16);
    marker.fill(encounter.boss ? "#b32f42" : "#f4c542");
    marker.stroke({ color: "#321a1a", width: 2 });
    viewport.addChild(marker);
    encounterMarkers.set(encounter.id, marker);
  }

  const playerMarker = new Graphics();
  playerMarker.rect(8, 4, 16, 24);
  playerMarker.fill("#3157a4");
  playerMarker.stroke({ color: "#f1e0b8", width: 2 });
  // Seed its baseline; `updateMapRenderView` keeps it in sync as the player walks.
  playerMarker.zIndex = (map.spawn.y + 1) * ts;
  entityLayer.addChild(playerMarker);

  return { container: viewport, viewport, playerMarker, pathOverlay, encounterMarkers };
}
