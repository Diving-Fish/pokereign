import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { adjustColor, categoryColor, PALETTE, pixelText, typeColor, typeLabel } from "./theme";
import { createButton } from "./button";
import { getBattleSpriteUrl } from "../../game/data/art";
import { SPECIES } from "../../game/data/species";
import { MOVES, type MoveId } from "../../game/data/moves";
import { moveMeta } from "../../game/battle/smogonCalc";
import type { MonsterState } from "../../game/state/monster";

// Panel geometry (logical 960x540 space).
const PANEL_W = 600;
const PANEL_H = 470;
const PANEL_X = Math.round((GAME_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.round((GAME_HEIGHT - PANEL_H) / 2);

// Move card grid: the new move sits centered up top; the four current moves
// fill a 2x2 grid the player taps to replace.
const CARD_W = 252;
const CARD_H = 64;
const CARD_GAP_X = 24;
const CARD_GAP_Y = 16;
const GRID_X = Math.round((PANEL_W - (CARD_W * 2 + CARD_GAP_X)) / 2);
const GRID_Y = 250;
const NEW_X = Math.round((PANEL_W - CARD_W) / 2);
const NEW_Y = 150;

const styles = {
  title: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 24, fontWeight: "700", shadow: true })),
  subtitle: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 15, fontWeight: "700", wordWrapWidth: PANEL_W - 64 })),
  section: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 14, fontWeight: "700" })),
  ribbon: new TextStyle(pixelText({ fill: "#1c1622", fontSize: 12, fontWeight: "700" })),
  moveName: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 17, fontWeight: "700", shadow: true })),
  pill: new TextStyle(pixelText({ fill: "#1c1622", fontSize: 11, fontWeight: "700" })),
  power: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 12, fontWeight: "700" })),
  swapHint: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 15, fontWeight: "700", shadow: true })),
  skip: new TextStyle(pixelText({ fill: PALETTE.btnInk, fontSize: 16, fontWeight: "700", shadow: true }))
};

export type MoveLearnCallbacks = {
  /** Replace the current move at `slotIndex` with the new move. */
  onReplace(slotIndex: number): void;
  /** Give up learning the new move; the moveset stays as-is. */
  onSkip(): void;
};

export type MoveLearnView = {
  overlay: Container;
  /** Show the learn-or-replace board for `newMove` on `monster`. */
  open(monster: MonsterState, newMove: MoveId): void;
  close(): void;
  isOpen(): boolean;
};

function applySpriteTexture(sprite: Sprite, url: string): void {
  void Assets.load(url)
    .then((texture: Texture) => {
      sprite.texture = texture;
    })
    .catch(() => undefined);
}

export function createMoveLearnView(callbacks: MoveLearnCallbacks): MoveLearnView {
  const overlay = new Container();
  overlay.visible = false;

  const backdrop = new Graphics();
  backdrop.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: "#05040a", alpha: 0.74 });
  backdrop.eventMode = "static";
  backdrop.cursor = "default";
  overlay.addChild(backdrop);

  const panel = new Container();
  panel.x = PANEL_X;
  panel.y = PANEL_Y;
  overlay.addChild(panel);

  const frame = new Graphics();
  frame.eventMode = "static"; // swallow taps inside the panel
  drawPanelFrame(frame);
  panel.addChild(frame);

  const title = new Text({ text: "要学习新招式吗？", style: styles.title });
  title.x = 32;
  title.y = 24;
  panel.addChild(title);

  const subtitle = new Text({ text: "", style: styles.subtitle });
  subtitle.x = 32;
  subtitle.y = 58;
  panel.addChild(subtitle);

  const sectionLabel = new Text({ text: "点击要遗忘的招式来替换", style: styles.section });
  sectionLabel.x = 32;
  sectionLabel.y = 224;
  panel.addChild(sectionLabel);

  const content = new Container();
  panel.addChild(content);

  const skipButton = createButton({
    width: 240,
    height: 46,
    faceTop: "#4a4254",
    faceBottom: "#2e2838",
    accent: PALETTE.inkSoft,
    onTap: () => callbacks.onSkip()
  });
  skipButton.container.x = Math.round((PANEL_W - 240) / 2);
  skipButton.container.y = 406;
  panel.addChild(skipButton.container);

  const skipLabel = new Text({ text: "", style: styles.skip });
  skipLabel.anchor.set(0.5);
  skipLabel.x = 120;
  skipLabel.y = 23;
  skipButton.content.addChild(skipLabel);

  let open = false;

  function rebuild(monster: MonsterState, newMove: MoveId): void {
    content.removeChildren().forEach((child) => child.destroy({ children: true }));

    const monName = SPECIES[monster.speciesId].name;
    const moveName = MOVES[newMove].name;
    subtitle.text = `${monName} 想要学会 ${moveName}！但已经会了 4 个招式。`;
    skipLabel.text = `放弃学习 ${moveName}`;

    // Monster sprite badge, top-left of the new move card.
    const badge = new Container();
    badge.x = 40;
    badge.y = NEW_Y - 4;
    const sprite = new Sprite(Texture.EMPTY);
    applySpriteTexture(sprite, getBattleSpriteUrl(monster.speciesId, "front"));
    sprite.anchor.set(0.5);
    sprite.x = 28;
    sprite.y = 34;
    sprite.scale.set(0.5);
    badge.addChild(sprite);
    content.addChild(badge);

    // The new move — highlighted.
    content.addChild(buildMoveCard(NEW_X, NEW_Y, newMove, { highlight: true }));

    // The current four moves — tap to replace.
    for (let i = 0; i < monster.moves.length; i += 1) {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = GRID_X + col * (CARD_W + CARD_GAP_X);
      const y = GRID_Y + rowI * (CARD_H + CARD_GAP_Y);
      content.addChild(buildMoveCard(x, y, monster.moves[i], { onTap: () => callbacks.onReplace(i) }));
    }
  }

  return {
    overlay,
    open(monster: MonsterState, newMove: MoveId): void {
      rebuild(monster, newMove);
      overlay.visible = true;
      open = true;
    },
    close(): void {
      overlay.visible = false;
      open = false;
    },
    isOpen: () => open
  };
}

function drawPanelFrame(frame: Graphics): void {
  frame.roundRect(6, 8, PANEL_W, PANEL_H, 16).fill({ color: "#0a0911", alpha: 0.5 });
  frame.roundRect(0, 0, PANEL_W, PANEL_H, 16).fill(PALETTE.panelEdgeDark);
  frame.roundRect(3, 3, PANEL_W - 6, PANEL_H - 6, 14).fill(PALETTE.panelFace);
  frame.roundRect(3, 3, PANEL_W - 6, PANEL_H - 6, 14).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
  frame.roundRect(8, 7, PANEL_W - 16, 4, 3).fill({ color: "#ffffff", alpha: 0.12 });
  frame.rect(32, 52, PANEL_W - 64, 1).fill({ color: PALETTE.gold, alpha: 0.5 });
}

type MoveCardOptions = {
  /** New-move styling: gold border + glow + "新招式" ribbon. */
  highlight?: boolean;
  /** Replace-target styling: tappable with a hover "遗忘" prompt. */
  onTap?: () => void;
};

/**
 * The shared move card used for both the new move and the four current ones:
 * name, type pill, category glyph, and power/PP. `highlight` lights it gold;
 * `onTap` makes it a replace target.
 */
function buildMoveCard(x: number, y: number, moveId: MoveId, opts: MoveCardOptions): Container {
  const card = new Container();
  card.x = x;
  card.y = y;

  const move = MOVES[moveId];
  const meta = moveMeta(moveId);
  const color = typeColor(meta.type);

  if (opts.highlight) {
    const glow = new Graphics();
    for (let i = 3; i >= 1; i -= 1) {
      const pad = i * 5;
      glow.roundRect(-pad, -pad, CARD_W + pad * 2, CARD_H + pad * 2, 10 + pad).fill({ color: PALETTE.gold, alpha: 0.07 });
    }
    card.addChild(glow);
  }

  const bg = new Graphics();
  bg.roundRect(0, 0, CARD_W, CARD_H, 9).fill(PALETTE.panelEdgeDark);
  bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 7).fill(adjustColor(color, -0.42));
  bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 7).stroke({
    color: opts.highlight ? PALETTE.gold : adjustColor(color, 0.2),
    width: opts.highlight ? 2 : 1.5,
    alpha: 0.9
  });
  card.addChild(bg);

  const name = new Text({ text: move.name, style: styles.moveName });
  name.x = 12;
  name.y = 9;
  card.addChild(name);

  drawPill(card, 12, 36, typeLabel(meta.type), color);
  drawCategoryGlyph(card, 70, 45, meta.category);

  const powerText = meta.category === "status" ? "变化" : `威力 ${meta.basePower}`;
  const power = new Text({ text: `${powerText}  PP ${move.pp}`, style: styles.power });
  power.anchor.set(1, 0);
  power.x = CARD_W - 12;
  power.y = 40;
  card.addChild(power);

  if (opts.highlight) {
    const ribbonText = new Text({ text: "新招式", style: styles.ribbon });
    const ribbonW = ribbonText.width + 16;
    const ribbon = new Graphics();
    ribbon.roundRect(-6, -8, ribbonW, 20, 6).fill(PALETTE.gold);
    ribbon.roundRect(-6, -8, ribbonW, 20, 6).stroke({ color: adjustColor(PALETTE.gold, -0.35), width: 1 });
    card.addChild(ribbon);
    ribbonText.x = 2;
    ribbonText.y = -4;
    card.addChild(ribbonText);
  }

  if (opts.onTap) {
    card.eventMode = "static";
    card.cursor = "pointer";

    const hoverBorder = new Graphics();
    card.addChild(hoverBorder);
    const swap = new Text({ text: "遗忘", style: styles.swapHint });
    swap.anchor.set(1, 0.5);
    swap.x = CARD_W - 12;
    swap.y = 18;
    swap.visible = false;
    card.addChild(swap);

    const setHover = (on: boolean) => {
      hoverBorder.clear();
      if (on) {
        hoverBorder.roundRect(2, 2, CARD_W - 4, CARD_H - 4, 8).stroke({ color: PALETTE.hpLow, width: 2.5 });
      }
      swap.visible = on;
    };

    card.on("pointerover", () => setHover(true));
    card.on("pointerout", () => setHover(false));
    card.on("pointertap", opts.onTap);
  }

  return card;
}

function drawPill(content: Container, x: number, y: number, label: string, color: string): void {
  const text = new Text({ text: label, style: styles.pill });
  const width = text.width + 16;
  const pill = new Graphics();
  pill.roundRect(x, y, width, 18, 9).fill(color);
  pill.roundRect(x, y, width, 18, 9).stroke({ color: adjustColor(color, -0.3), width: 1 });
  content.addChild(pill);
  text.x = x + 8;
  text.y = y + 3;
  content.addChild(text);
}

/** Damage-category glyph: physical = diamond, special = ring, status = square. */
function drawCategoryGlyph(content: Container, x: number, y: number, category: string): void {
  const g = new Graphics();
  const color = categoryColor(category);
  if (category === "physical") {
    g.moveTo(x, y - 7).lineTo(x + 7, y).lineTo(x, y + 7).lineTo(x - 7, y).closePath().fill(color);
  } else if (category === "special") {
    g.circle(x, y, 7).stroke({ color, width: 2.5 });
  } else {
    g.roundRect(x - 6, y - 6, 12, 12, 2).fill(color);
  }
  content.addChild(g);
}
