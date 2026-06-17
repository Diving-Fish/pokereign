import { Graphics, type EventSystem } from "pixi.js";
import { CompositeTilemap, settings as tilemapSettings } from "@pixi/tilemap";
import { Viewport } from "pixi-viewport";

// A single Tilemap uses one shared quad index buffer. With 16-bit indices it
// caps at ~16K tiles (65536 / 4 verts); our 200x200 map has 40K, which silently
// overflows and renders only the first ~16K tiles. 32-bit indices lift the cap
// (WebGL2 / WebGPU both support them). Must be set before the pipe builds.
tilemapSettings.use32bitIndex = true;
import type { TileMapData, TileId } from "../../game/map/types";
import type { TileTextureMap } from "./tileTextures";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";

export type MapRenderView = {
  /** The viewport itself; add this to the scene graph and toggle its `visible`. */
  container: Viewport;
  viewport: Viewport;
  playerMarker: Graphics;
  /** Live encounter markers keyed by encounter id, so cleared ones can be removed. */
  encounterMarkers: Map<string, Graphics>;
};

/**
 * Build the persistent map render objects once. The tilemap is static (tiles
 * never change at runtime), so it is filled a single time here and only the
 * camera + player marker move per frame. Tiles are batched by `@pixi/tilemap`
 * into a handful of draw calls regardless of map size, so this scales to the
 * target 200x200 maps where a per-tile `Sprite` loop would not.
 */
export function createMapRenderView(
  map: TileMapData,
  tileTextures: TileTextureMap,
  events: EventSystem,
  clearedEncounterIds: ReadonlySet<string> = new Set()
): MapRenderView {
  const worldWidth = map.width * map.tileSize;
  const worldHeight = map.height * map.tileSize;

  const viewport = new Viewport({
    screenWidth: GAME_WIDTH,
    screenHeight: GAME_HEIGHT,
    worldWidth,
    worldHeight,
    events
  });
  // Keep the camera inside the map; if the map is smaller than the screen it is
  // centered instead of revealing void around it.
  viewport.clamp({ direction: "all", underflow: "center" });

  const tilemap = new CompositeTilemap();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tileId: TileId = map.layers.ground[y]?.[x] ?? "wall";
      tilemap.tile(tileTextures[tileId], x * map.tileSize, y * map.tileSize);
    }
  }
  viewport.addChild(tilemap);

  const encounterMarkers = new Map<string, Graphics>();
  for (const encounter of map.objects.filter((object) => object.kind === "encounter")) {
    if (clearedEncounterIds.has(encounter.id)) {
      continue;
    }
    const marker = new Graphics();
    marker.rect(encounter.x * map.tileSize + 8, encounter.y * map.tileSize + 8, 16, 16);
    marker.fill(encounter.boss ? "#b32f42" : "#f4c542");
    marker.stroke({ color: "#321a1a", width: 2 });
    viewport.addChild(marker);
    encounterMarkers.set(encounter.id, marker);
  }

  const playerMarker = new Graphics();
  playerMarker.rect(8, 4, 16, 24);
  playerMarker.fill("#3157a4");
  playerMarker.stroke({ color: "#f1e0b8", width: 2 });
  viewport.addChild(playerMarker);

  return { container: viewport, viewport, playerMarker, encounterMarkers };
}

/** Remove a defeated encounter's marker so it stays gone on the map. */
export function removeEncounterMarker(view: MapRenderView, encounterId: string): void {
  const marker = view.encounterMarkers.get(encounterId);
  if (!marker) {
    return;
  }
  view.viewport.removeChild(marker);
  marker.destroy();
  view.encounterMarkers.delete(encounterId);
}

/**
 * Per frame: place the player marker and follow it with the camera. `pos` is a
 * continuous (fractional) tile coordinate that is interpolated between tiles by
 * the caller, so both the marker and the camera glide instead of snapping.
 */
export function updateMapRenderView(view: MapRenderView, map: TileMapData, pos: { x: number; y: number }): void {
  view.playerMarker.x = pos.x * map.tileSize;
  view.playerMarker.y = pos.y * map.tileSize;
  view.viewport.moveCenter((pos.x + 0.5) * map.tileSize, (pos.y + 0.5) * map.tileSize);
}
