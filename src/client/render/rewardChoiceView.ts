import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { adjustColor, PALETTE, pixelText } from "./theme";
import { ITEMS, type ItemId } from "../../game/data/items";
import { createItemIcon } from "./itemIcon";

// Panel geometry (logical 960x540 space).
const PANEL_W = 640;
const PANEL_H = 340;
const PANEL_X = Math.round((GAME_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.round((GAME_HEIGHT - PANEL_H) / 2);

// Three item cards in a row.
const CARD_W = 188;
const CARD_H = 222;
const CARD_GAP = 20;
const GRID_Y = 92;
const ICON_SIZE = 64;
const DESC_PAD = 16;
const DESC_WIDTH = CARD_W - DESC_PAD * 2;

const styles = {
  title: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 24, fontWeight: "700", shadow: true })),
  subtitle: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 15, fontWeight: "700" })),
  name: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 17, fontWeight: "700", shadow: true })),
  // Centered for ≤2 lines; a left-aligned variant kicks in for longer blurbs.
  descCenter: new TextStyle(
    pixelText({ fill: PALETTE.inkSoft, fontSize: 12, fontWeight: "700", wordWrapWidth: DESC_WIDTH, breakWords: true, align: "center" })
  ),
  descLeft: new TextStyle(
    pixelText({ fill: PALETTE.inkSoft, fontSize: 12, fontWeight: "700", wordWrapWidth: DESC_WIDTH, breakWords: true, align: "left" })
  ),
  pick: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 13, fontWeight: "700" }))
};

export type RewardChoiceCallbacks = {
  /** The player chose option `index` from the offered items. */
  onChoose(index: number): void;
};

export type RewardChoiceView = {
  overlay: Container;
  /** Show the 3-choose-1 board for `itemIds`. */
  open(itemIds: ItemId[]): void;
  close(): void;
  isOpen(): boolean;
};

export function createRewardChoiceView(callbacks: RewardChoiceCallbacks): RewardChoiceView {
  const overlay = new Container();
  overlay.visible = false;

  const backdrop = new Graphics();
  backdrop.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: "#05040a", alpha: 0.74 });
  backdrop.eventMode = "static"; // mandatory choice — no tap-outside dismiss
  backdrop.cursor = "default";
  overlay.addChild(backdrop);

  const panel = new Container();
  panel.x = PANEL_X;
  panel.y = PANEL_Y;
  overlay.addChild(panel);

  const frame = new Graphics();
  frame.eventMode = "static";
  drawPanelFrame(frame);
  panel.addChild(frame);

  const title = new Text({ text: "战斗奖励 · 三选一", style: styles.title });
  title.x = 32;
  title.y = 24;
  panel.addChild(title);

  const subtitle = new Text({ text: "选择一件物品，随后决定如何处理它。", style: styles.subtitle });
  subtitle.x = 32;
  subtitle.y = 58;
  panel.addChild(subtitle);

  const content = new Container();
  panel.addChild(content);

  let open = false;

  function rebuild(itemIds: ItemId[]): void {
    content.removeChildren().forEach((child) => child.destroy({ children: true }));
    const total = itemIds.length * CARD_W + (itemIds.length - 1) * CARD_GAP;
    const startX = Math.round((PANEL_W - total) / 2);
    itemIds.forEach((itemId, i) => {
      content.addChild(buildItemCard(startX + i * (CARD_W + CARD_GAP), GRID_Y, itemId, () => callbacks.onChoose(i)));
    });
  }

  return {
    overlay,
    open(itemIds: ItemId[]): void {
      rebuild(itemIds);
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

/** One tappable reward card: icon, name, description, and a hover "选择" prompt. */
function buildItemCard(x: number, y: number, itemId: ItemId, onTap: () => void): Container {
  const card = new Container();
  card.x = x;
  card.y = y;
  card.eventMode = "static";
  card.cursor = "pointer";

  const item = ITEMS[itemId];

  const bg = new Graphics();
  const paint = (hover: boolean) => {
    bg.clear();
    bg.roundRect(0, 0, CARD_W, CARD_H, 11).fill(PALETTE.panelEdgeDark);
    bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 9).fill(hover ? adjustColor(PALETTE.panelFace, 0.12) : PALETTE.panelBack);
    bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 9).stroke({
      color: hover ? PALETTE.gold : PALETTE.panelEdgeLight,
      width: hover ? 2.5 : 1.5,
      alpha: 0.9
    });
  };
  paint(false);
  card.addChild(bg);

  const iconWrap = new Container();
  const iconBg = new Graphics();
  iconBg.roundRect(0, 0, ICON_SIZE + 12, ICON_SIZE + 12, 9).fill({ color: PALETTE.panelEdgeDark, alpha: 0.6 });
  iconWrap.addChild(iconBg);
  const icon = createItemIcon(itemId, ICON_SIZE);
  icon.x = 6;
  icon.y = 6;
  iconWrap.addChild(icon);
  iconWrap.x = Math.round((CARD_W - (ICON_SIZE + 12)) / 2);
  iconWrap.y = 18;
  card.addChild(iconWrap);

  const name = new Text({ text: item.name, style: styles.name });
  name.anchor.set(0.5, 0);
  name.x = CARD_W / 2;
  name.y = ICON_SIZE + 36;
  card.addChild(name);

  // Wrap (breakWords handles CJK); left-align once it spills past two lines so
  // ragged long blurbs read cleanly, but keep short ones centered.
  const multiline = CanvasTextMetrics.measureText(item.desc, styles.descLeft).lines.length > 2;
  const desc = new Text({ text: item.desc, style: multiline ? styles.descLeft : styles.descCenter });
  desc.y = ICON_SIZE + 64;
  if (multiline) {
    desc.anchor.set(0, 0);
    desc.x = DESC_PAD;
  } else {
    desc.anchor.set(0.5, 0);
    desc.x = CARD_W / 2;
  }
  card.addChild(desc);

  const pick = new Text({ text: "▶ 选择", style: styles.pick });
  pick.anchor.set(0.5, 1);
  pick.x = CARD_W / 2;
  pick.y = CARD_H - 12;
  pick.visible = false;
  card.addChild(pick);

  card.on("pointerover", () => {
    paint(true);
    pick.visible = true;
  });
  card.on("pointerout", () => {
    paint(false);
    pick.visible = false;
  });
  card.on("pointertap", onTap);

  return card;
}
