import type { Application } from "pixi.js";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/**
 * Keep the logical coordinate space fixed at GAME_WIDTH×GAME_HEIGHT (all layout
 * math stays in these units) while matching the renderer's backbuffer
 * resolution to the actual on-screen pixel density. Vector graphics and text
 * then rasterize crisp at native pixels instead of being drawn at 960×540 and
 * CSS-upscaled. Pixel-art sprites and tiles keep their `nearest` scaleMode, so
 * they stay sharp pixel art rather than turning blurry.
 *
 * Pixi's `resize(..., resolution)` emits the `resolutionChange` runner, which
 * marks every auto-resolution Text dirty so labels re-rasterize crisp after a
 * window resize — no manual re-render needed.
 */
export function fitRendererToWindow(app: Application): void {
  const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const dpr = window.devicePixelRatio || 1;
  app.renderer.resize(GAME_WIDTH, GAME_HEIGHT, scale * dpr);
  app.canvas.style.width = `${Math.round(GAME_WIDTH * scale)}px`;
  app.canvas.style.height = `${Math.round(GAME_HEIGHT * scale)}px`;
}
