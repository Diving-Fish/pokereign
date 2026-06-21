import { Graphics, Rectangle, type EventSystem, type FederatedPointerEvent } from "pixi.js";
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
  /** Click-to-walk path line + destination marker, drawn under the player. */
  pathOverlay: Graphics;
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
  clearedEncounterIds: ReadonlySet<string> = new Set(),
  onTileTap?: (tileX: number, tileY: number) => void
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

  // Click/tap-to-walk: the viewport is the hit target for the whole world. A
  // world-sized hit area keeps taps working regardless of the camera transform
  // (`toWorld` undoes it). Pointer events unify mouse + touch for PC/mobile.
  if (onTileTap) {
    viewport.eventMode = "static";
    viewport.hitArea = new Rectangle(0, 0, worldWidth, worldHeight);
    viewport.on("pointertap", (event: FederatedPointerEvent) => {
      const world = viewport.toWorld(event.global);
      const tileX = Math.floor(world.x / map.tileSize);
      const tileY = Math.floor(world.y / map.tileSize);
      onTileTap(tileX, tileY);
    });
  }

  const tilemap = new CompositeTilemap();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tileId: TileId = map.layers.ground[y]?.[x] ?? "wall";
      tilemap.tile(tileTextures[tileId], x * map.tileSize, y * map.tileSize);
    }
  }
  viewport.addChild(tilemap);

  // Walk-path overlay sits above the ground tiles but below the encounter
  // markers and player so the destination dot never hides the sprite.
  const pathOverlay = new Graphics();
  viewport.addChild(pathOverlay);

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

  return { container: viewport, viewport, playerMarker, pathOverlay, encounterMarkers };
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
  // Baseline (feet) depth so the Tiled view can y-sort the player among props it
  // walks behind/in front of. Harmless for the prototype view (not sortable).
  view.playerMarker.zIndex = (pos.y + 1) * map.tileSize;
  view.viewport.moveCenter((pos.x + 0.5) * map.tileSize, (pos.y + 0.5) * map.tileSize);
}

/**
 * Draw the active click-to-walk path: a dashed-dot trail from the player's
 * current (fractional) position through each queued tile, ending in a pulsing
 * destination ring. Pass an empty path to clear the overlay. `elapsed` (seconds)
 * drives the destination pulse so it gently breathes.
 */
export function updateMapPathOverlay(
  view: MapRenderView,
  map: TileMapData,
  pos: { x: number; y: number },
  path: ReadonlyArray<{ x: number; y: number }>,
  elapsed: number
): void {
  const overlay = view.pathOverlay;
  overlay.clear();
  if (path.length === 0) {
    return;
  }

  const half = map.tileSize / 2;
  const center = (tile: { x: number; y: number }) => ({
    x: tile.x * map.tileSize + half,
    y: tile.y * map.tileSize + half
  });

  // Trail line from the player through every remaining waypoint.
  const points = [center(pos), ...path.map(center)];
  overlay.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    overlay.lineTo(points[i].x, points[i].y);
  }
  overlay.stroke({ color: "#f1e0b8", width: 3, alpha: 0.55 });

  // Waypoint dots (skip the final tile; it gets the destination ring instead).
  for (let i = 0; i < path.length - 1; i += 1) {
    const p = center(path[i]);
    overlay.circle(p.x, p.y, 3).fill({ color: "#f4c542", alpha: 0.85 });
  }

  // Destination: a pulsing ring + filled core on the goal tile.
  const goal = center(path[path.length - 1]);
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5);
  overlay.circle(goal.x, goal.y, 9 + pulse * 4).stroke({ color: "#f4c542", width: 2, alpha: 0.4 + 0.4 * pulse });
  overlay.circle(goal.x, goal.y, 6).fill({ color: "#f4c542", alpha: 0.9 });
  overlay.circle(goal.x, goal.y, 6).stroke({ color: "#321a1a", width: 2 });
}
