import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { ITEM_SPRITENUM, ITEMS, type ItemId } from "../../game/data/items";
import { adjustColor, PALETTE } from "./theme";

/**
 * Item icons. Items present in Showdown's battle data get their real 24×24 icon
 * cropped from `itemicons-sheet.png` (16-column grid: `left=(n%16)*24,
 * top=⌊n/16⌋*24`); the rest (bag medicines, TMs, the linking cord) get a small
 * drawn placeholder keyed by item kind. Served through the dev sprite proxy.
 */
const SHEET_URL = "/pokemon-sprites/itemicons-sheet.png";
const CELL = 24;

let sheetPromise: Promise<Texture> | null = null;

function loadSheet(): Promise<Texture> {
  if (!sheetPromise) {
    sheetPromise = Assets.load<Texture>(SHEET_URL).then((tex) => {
      // Pixel-art sheet: keep it crisp when scaled.
      tex.source.scaleMode = "nearest";
      return tex;
    });
  }
  return sheetPromise;
}

const KIND_COLOR: Record<string, string> = {
  medicine: "#e0617a",
  tm: "#5f8fd6",
  berry: "#6fb24e",
  stone: "#c1a460",
  held: "#b8b393"
};

/**
 * Build an item icon display object sized to `size` (default 24). For sheet
 * items the cropped sprite swaps in once the sheet loads; otherwise a placeholder
 * is drawn immediately.
 */
export function createItemIcon(itemId: ItemId, size = CELL): Container {
  const container = new Container();
  const spritenum = ITEM_SPRITENUM[itemId];

  if (spritenum !== undefined) {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.setSize(size);
    container.addChild(sprite);
    void loadSheet().then((sheet) => {
      const x = (spritenum % 16) * CELL;
      const y = Math.floor(spritenum / 16) * CELL;
      sprite.texture = new Texture({ source: sheet.source, frame: new Rectangle(x, y, CELL, CELL) });
      sprite.setSize(size);
    });
    return container;
  }

  container.addChild(drawPlaceholder(itemId, size));
  return container;
}

function drawPlaceholder(itemId: ItemId, size: number): Graphics {
  const kind = ITEMS[itemId]?.kind ?? "held";
  const color = KIND_COLOR[kind] ?? KIND_COLOR.held;
  const g = new Graphics();
  const r = size * 0.22;

  g.roundRect(1, 1, size - 2, size - 2, r).fill(adjustColor(color, -0.25));
  g.roundRect(2, 2, size - 4, (size - 4) * 0.5, r).fill({ color, alpha: 0.95 });
  g.roundRect(1, 1, size - 2, size - 2, r).stroke({ color: adjustColor(color, 0.35), width: 1 });

  const cx = size / 2;
  const cy = size / 2;
  if (kind === "medicine") {
    // White cross.
    const t = size * 0.12;
    const arm = size * 0.32;
    g.rect(cx - t / 2, cy - arm / 2, t, arm).fill(0xffffff);
    g.rect(cx - arm / 2, cy - t / 2, arm, t).fill(0xffffff);
  } else if (kind === "tm") {
    // Disc with a gold rim — generic technical machine.
    g.circle(cx, cy, size * 0.26).fill(adjustColor(color, -0.15));
    g.circle(cx, cy, size * 0.26).stroke({ color: PALETTE.gold, width: 1.5 });
    g.circle(cx, cy, size * 0.08).fill(PALETTE.gold);
  } else {
    g.circle(cx, cy, size * 0.12).fill({ color: 0xffffff, alpha: 0.85 });
  }
  return g;
}
