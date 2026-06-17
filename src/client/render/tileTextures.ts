import { Application, CanvasSource, Graphics, Rectangle, Texture } from "pixi.js";
import type { TileId } from "../../game/map/types";

export type TileTextureMap = Record<TileId, Texture>;

const TILE_DRAWERS: Array<[TileId, (graphics: Graphics, tileSize: number) => void]> = [
  ["grass", drawGrassTile],
  ["long_grass", drawLongGrassTile],
  ["wall", drawWallTile],
  ["dirt", drawDirtTile],
  ["center", drawCenterTile],
  ["boss", drawBossTile]
];

/**
 * Bake every tile into a single horizontal canvas atlas so all tile Textures
 * share one source. `@pixi/tilemap` samples uploaded image/canvas sources
 * reliably, whereas a per-tile `generateTexture` RenderTexture renders black
 * through the tilemap shader. One base texture also keeps the whole map to a
 * single draw call.
 */
export function createTileTextures(app: Application, tileSize: number): TileTextureMap {
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = tileSize * TILE_DRAWERS.length;
  atlasCanvas.height = tileSize;
  const ctx = atlasCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context for tile atlas.");
  }

  TILE_DRAWERS.forEach(([, draw], index) => {
    const graphics = new Graphics();
    draw(graphics, tileSize);
    const tileCanvas = app.renderer.extract.canvas({
      target: graphics,
      frame: new Rectangle(0, 0, tileSize, tileSize)
    });
    ctx.drawImage(tileCanvas as CanvasImageSource, index * tileSize, 0);
    graphics.destroy();
  });

  const source = new CanvasSource({ resource: atlasCanvas, scaleMode: "nearest" });
  const textures = {} as TileTextureMap;
  TILE_DRAWERS.forEach(([id], index) => {
    textures[id] = new Texture({ source, frame: new Rectangle(index * tileSize, 0, tileSize, tileSize) });
  });
  return textures;
}

function drawGrassTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#78ad58");
  drawPixels(graphics, [
    [4, 6, "#8dc66b"],
    [18, 4, "#5f9344"],
    [10, 20, "#6ca34d"],
    [25, 18, "#91c96b"],
    [3, 28, "#5d8f42"]
  ]);
  drawBorder(graphics, tileSize, "#5f8547");
}

function drawLongGrassTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#2f7a3c");
  for (let x = 3; x < tileSize; x += 6) {
    graphics.moveTo(x, 26).lineTo(x + 3, 10).stroke({ color: "#74bc64", width: 2 });
    graphics.moveTo(x + 2, 27).lineTo(x - 2, 15).stroke({ color: "#1f5f31", width: 2 });
  }
  drawPixels(graphics, [
    [7, 7, "#45984e"],
    [22, 6, "#7ac96e"],
    [15, 22, "#236431"]
  ]);
  drawBorder(graphics, tileSize, "#1f4f2b");
}

function drawWallTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#4a4d43");
  const stones = [
    [1, 2, 14, 8, "#595d52"],
    [16, 1, 15, 9, "#3f423a"],
    [0, 12, 10, 8, "#55594e"],
    [12, 11, 20, 9, "#484b42"],
    [2, 22, 16, 8, "#3f4239"],
    [20, 22, 10, 8, "#5d6056"]
  ] as const;

  for (const [x, y, width, height, color] of stones) {
    graphics.rect(x, y, width, height).fill(color);
  }

  graphics
    .moveTo(0, 10)
    .lineTo(tileSize, 10)
    .moveTo(0, 21)
    .lineTo(tileSize, 21)
    .stroke({ color: "#2b2d28", width: 1 });
  drawBorder(graphics, tileSize, "#282a25");
}

function drawDirtTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#8a6138");
  drawPixels(graphics, [
    [4, 6, "#a87945"],
    [16, 9, "#6c4829"],
    [25, 5, "#9c7141"],
    [8, 24, "#6f4b2c"],
    [22, 22, "#b07f4a"]
  ]);
  graphics.moveTo(2, 17).lineTo(30, 13).stroke({ color: "#76512f", width: 2 });
  drawBorder(graphics, tileSize, "#694729");
}

function drawCenterTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#d8d0bd");
  graphics.rect(2, 2, 28, 28).stroke({ color: "#a59c88", width: 2 });
  graphics.rect(13, 7, 6, 18).fill("#c85555");
  graphics.rect(7, 13, 18, 6).fill("#c85555");
  drawPixels(graphics, [
    [4, 4, "#eee6d3"],
    [24, 24, "#bdb39c"]
  ]);
}

function drawBossTile(graphics: Graphics, tileSize: number): void {
  graphics.rect(0, 0, tileSize, tileSize).fill("#6b3444");
  graphics.rect(4, 4, 24, 24).stroke({ color: "#a34b5b", width: 2 });
  graphics.moveTo(16, 5).lineTo(27, 16).lineTo(16, 27).lineTo(5, 16).lineTo(16, 5).fill("#7d203a");
  graphics.circle(16, 16, 4).fill("#e0b653");
  drawBorder(graphics, tileSize, "#391a25");
}

function drawPixels(graphics: Graphics, pixels: Array<[number, number, string]>): void {
  for (const [x, y, color] of pixels) {
    graphics.rect(x, y, 3, 3).fill(color);
  }
}

function drawBorder(graphics: Graphics, tileSize: number, color: string): void {
  graphics.rect(0, 0, tileSize, tileSize).stroke({ color, width: 1 });
}
