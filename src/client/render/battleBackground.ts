import { Container, Graphics } from "pixi.js";
import { BATTLE_LAYOUT } from "./battleLayout";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";

export function drawBattleBackground(layer: Container): void {
  const sky = new Graphics();
  sky.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill("#d8d2aa");
  layer.addChild(sky);

  const distantGrass = new Graphics();
  distantGrass.rect(0, 250, GAME_WIDTH, 92).fill("#a5b970");
  layer.addChild(distantGrass);

  const field = new Graphics();
  field.rect(0, 320, GAME_WIDTH, 220).fill("#7da35a");
  layer.addChild(field);

  for (let y = 330; y < GAME_HEIGHT; y += 18) {
    const stripe = new Graphics();
    stripe.moveTo(0, y).lineTo(GAME_WIDTH, y - 28).stroke({ color: "#6c934f", width: 2, alpha: 0.55 });
    layer.addChild(stripe);
  }

  drawBattlePlatform(layer, BATTLE_LAYOUT.player.platform, "#6f8f4f", "#527040");
  drawBattlePlatform(layer, BATTLE_LAYOUT.foe.platform, "#b2bd77", "#829057");
}

function drawBattlePlatform(
  layer: Container,
  platform: { x: number; y: number; width: number; height: number },
  fill: string,
  stroke: string
): void {
  const { x, y, width, height } = platform;
  const shadow = new Graphics();
  shadow.ellipse(x, y + 10, width / 2, height / 2).fill({ color: "#405034", alpha: 0.45 });
  layer.addChild(shadow);

  const platformGraphic = new Graphics();
  platformGraphic.ellipse(x, y, width / 2, height / 2).fill(fill);
  platformGraphic.ellipse(x, y, width / 2, height / 2).stroke({ color: stroke, width: 3 });
  layer.addChild(platformGraphic);

  const highlight = new Graphics();
  highlight.ellipse(x - width * 0.08, y - height * 0.12, width * 0.32, height * 0.16).fill({ color: "#cbd898", alpha: 0.45 });
  layer.addChild(highlight);
}
