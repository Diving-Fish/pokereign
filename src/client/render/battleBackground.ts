import { Container, Graphics } from "pixi.js";
import { BATTLE_LAYOUT } from "./battleLayout";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { PALETTE } from "./theme";

/**
 * Layered golden-hour battlefield: gradient dusk sky, a low sun with a soft
 * halo, two parallax hill silhouettes, a lit grass field with perspective
 * stripes, and two crafted platforms with rim light + grounded shadow.
 * `time` (seconds) drives a subtle shimmer so the scene never feels static.
 */
export function drawBattleBackground(layer: Container, time = 0): void {
  drawGradient(layer, 0, 0, GAME_WIDTH, 270, PALETTE.skyTop, PALETTE.skyMid);
  drawGradient(layer, 0, 200, GAME_WIDTH, 130, PALETTE.skyMid, PALETTE.skyHorizon);

  drawSun(layer, time);
  drawHills(layer);
  drawField(layer, time);

  drawPlatform(layer, BATTLE_LAYOUT.player.platform, PALETTE.field, "#9fbe6a", "#4f6a39");
  drawPlatform(layer, BATTLE_LAYOUT.foe.platform, "#b6c07b", "#cdd69a", "#79865a");
}

function drawGradient(
  layer: Container,
  x: number,
  y: number,
  width: number,
  height: number,
  top: string,
  bottom: string
): void {
  const bands = 24;
  const bandH = height / bands;
  const g = new Graphics();
  for (let i = 0; i < bands; i += 1) {
    g.rect(x, y + i * bandH, width, bandH + 1).fill({ color: mix(top, bottom, i / (bands - 1)) });
  }
  layer.addChild(g);
}

function drawSun(layer: Container, time: number): void {
  const cx = 720;
  const cy = 196;
  const breathe = 1 + Math.sin(time * 0.8) * 0.04;
  const halo = new Graphics();
  for (let r = 96; r > 0; r -= 12) {
    halo.circle(cx, cy, r * breathe).fill({ color: PALETTE.sun, alpha: 0.06 });
  }
  layer.addChild(halo);

  const disc = new Graphics();
  disc.circle(cx, cy, 34).fill({ color: "#fff0c4" });
  disc.circle(cx, cy, 34).stroke({ color: PALETTE.sun, width: 4, alpha: 0.6 });
  layer.addChild(disc);
}

function drawHills(layer: Container): void {
  const far = new Graphics();
  far.moveTo(0, 250);
  far.bezierCurveTo(220, 196, 420, 244, 640, 214);
  far.bezierCurveTo(800, 196, 900, 234, GAME_WIDTH, 220);
  far.lineTo(GAME_WIDTH, 330).lineTo(0, 330).fill({ color: PALETTE.hillFar, alpha: 0.85 });
  layer.addChild(far);

  const near = new Graphics();
  near.moveTo(0, 286);
  near.bezierCurveTo(180, 250, 380, 296, 560, 270);
  near.bezierCurveTo(760, 244, 880, 290, GAME_WIDTH, 268);
  near.lineTo(GAME_WIDTH, 360).lineTo(0, 360).fill({ color: PALETTE.hillNear });
  layer.addChild(near);
}

function drawField(layer: Container, time: number): void {
  const field = new Graphics();
  field.rect(0, 318, GAME_WIDTH, GAME_HEIGHT - 318).fill(PALETTE.field);
  layer.addChild(field);

  // Perspective stripes fanning toward the horizon, with a slow light sweep.
  const stripes = new Graphics();
  const sweep = (Math.sin(time * 0.5) + 1) / 2;
  for (let i = 0; i < 26; i += 1) {
    const y = 326 + i * 9;
    const skew = (i + 1) * 1.6;
    const alpha = 0.18 + 0.16 * Math.abs(Math.sin(i * 0.6 + sweep * 2));
    stripes
      .moveTo(-skew * 6, y)
      .lineTo(GAME_WIDTH + skew * 6, y - skew)
      .stroke({ color: PALETTE.fieldStripe, width: 2, alpha });
  }
  layer.addChild(stripes);
}

function drawPlatform(
  layer: Container,
  platform: { x: number; y: number; width: number; height: number },
  topColor: string,
  rimColor: string,
  sideColor: string
): void {
  const { x, y, width, height } = platform;
  const rx = width / 2;
  const ry = height / 2;

  // Grounded contact shadow.
  const shadow = new Graphics();
  shadow.ellipse(x, y + 14, rx * 1.04, ry * 0.95).fill({ color: "#2a3322", alpha: 0.38 });
  layer.addChild(shadow);

  // Soil side wall (gives the disc thickness).
  const side = new Graphics();
  side.ellipse(x, y + 9, rx, ry).fill(sideColor);
  layer.addChild(side);

  // Top face.
  const top = new Graphics();
  top.ellipse(x, y, rx, ry).fill(topColor);
  layer.addChild(top);

  // Rim light along the upper edge.
  const rim = new Graphics();
  rim.ellipse(x, y - 1, rx - 2, ry - 1).stroke({ color: rimColor, width: 3, alpha: 0.9 });
  layer.addChild(rim);

  // Soft top highlight.
  const highlight = new Graphics();
  highlight.ellipse(x - width * 0.1, y - height * 0.16, rx * 0.34, ry * 0.34).fill({ color: "#f2f6d2", alpha: 0.32 });
  layer.addChild(highlight);
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace("#", "");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  };
}
