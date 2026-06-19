import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { adjustColor, hpColors, PALETTE, pixelText, typeColor } from "./theme";
import { getBattleSpriteUrl } from "../../game/data/art";
import { MOVES } from "../../game/data/moves";
import { SPECIES } from "../../game/data/species";
import { computeStats, moveMeta, toCalcLevel } from "../../game/battle/smogonCalc";
import { MAX_LEVEL, xpToNextLevel, type MonsterState } from "../../game/state/monster";
import type { Stats } from "../../game/data/types";

// XP bar accent (a cool blue, distinct from the green/amber/red HP scale).
const XP_HI = "#6cc6ee";
const XP_LO = "#2f6fb0";

// Bottom-right "main info" bar geometry.
const SQUARE = 56;
const ITEM = 40;
const GAP = 8;
const PAD = 10;
const MARGIN = 14;
const BAR_W = PAD * 2 + 3 * SQUARE + 2 * GAP + GAP + ITEM;
const BAR_H = PAD * 2 + SQUARE;

// Detail window geometry.
const DETAIL_W = 700;
const DETAIL_H = 492;
const DETAIL_X = Math.round((GAME_WIDTH - DETAIL_W) / 2);
const DETAIL_Y = Math.round((GAME_HEIGHT - DETAIL_H) / 2);

const TYPE_LABELS: Record<string, string> = {
  normal: "一般",
  fire: "火",
  water: "水",
  grass: "草",
  electric: "电",
  flying: "飞行",
  rock: "岩石",
  ground: "地面"
};

const NATURE_LABELS: Record<string, string> = {
  Hardy: "勤奋",
  Lonely: "怕寂寞",
  Brave: "勇敢",
  Adamant: "固执",
  Naughty: "顽皮",
  Bold: "大胆",
  Docile: "坦率",
  Relaxed: "悠闲",
  Impish: "淘气",
  Lax: "乐天",
  Timid: "胆小",
  Hasty: "急躁",
  Serious: "认真",
  Jolly: "爽朗",
  Naive: "天真",
  Modest: "内敛",
  Mild: "慢吞吞",
  Quiet: "冷静",
  Bashful: "害羞",
  Rash: "马虎",
  Calm: "温和",
  Gentle: "温顺",
  Sassy: "自大",
  Careful: "慎重",
  Quirky: "浮躁"
};

const STAT_ROWS: { key: keyof Stats; label: string }[] = [
  { key: "hp", label: "体力" },
  { key: "atk", label: "攻击" },
  { key: "def", label: "防御" },
  { key: "spa", label: "特攻" },
  { key: "spd", label: "特防" },
  { key: "spe", label: "速度" }
];

const styles = {
  title: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 26, fontWeight: "700", shadow: true })),
  level: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 18, fontWeight: "700", shadow: true })),
  section: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 15, fontWeight: "700" })),
  label: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 15, fontWeight: "700" })),
  value: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 15, fontWeight: "700" })),
  statHeader: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 13, fontWeight: "700" })),
  statValue: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 14, fontWeight: "700" })),
  moveName: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 14, fontWeight: "700" })),
  pp: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 12, fontWeight: "700" })),
  pill: new TextStyle(pixelText({ fill: "#1c1622", fontSize: 11, fontWeight: "700" })),
  barLabel: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 14, fontWeight: "700" })),
  barValue: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 13, fontWeight: "700" })),
  slotEmpty: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 11, fontWeight: "700" })),
  itemHint: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 10, fontWeight: "700" }))
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function natureLabel(nature: string): string {
  return NATURE_LABELS[nature] ?? nature;
}

/**
 * Assign a battle sprite texture. The sprites stream through the Showdown proxy
 * and may not be in the texture cache yet, so resolve through `Assets.load`
 * (which returns the cached texture immediately once loaded) and assign on
 * resolve; otherwise the slot stays blank.
 */
function applySpriteTexture(sprite: Sprite, url: string): void {
  void Assets.load(url)
    .then((texture: Texture) => {
      sprite.texture = texture;
    })
    .catch(() => undefined);
}

type MonsterSlot = {
  container: Container;
  bg: Graphics;
  sprite: Sprite;
  mask: Graphics;
  border: Graphics;
  empty: Text;
};

export type TeamHudView = {
  /** Bottom-right info bar; toggle `visible` from the scene. */
  bar: Container;
  /** Full-screen modal overlay for the detail window; lives above everything. */
  overlay: Container;
  /** Re-read the roster and repaint the slots (+ open detail, if any). */
  refresh(): void;
  /** Hide the bar and close the detail window (used when leaving the map). */
  setVisible(visible: boolean): void;
  /** Close the detail window if it is open. */
  closeDetail(): void;
  isDetailOpen(): boolean;
};

export function createTeamHud(roster: MonsterState[]): TeamHudView {
  const bar = new Container();
  bar.x = GAME_WIDTH - MARGIN - BAR_W;
  bar.y = GAME_HEIGHT - MARGIN - BAR_H;

  drawBarFrame(bar);

  const slots: MonsterSlot[] = [];
  for (let i = 0; i < 3; i += 1) {
    const slot = createMonsterSlot(() => openDetail(i));
    slot.container.x = PAD + i * (SQUARE + GAP);
    slot.container.y = PAD;
    bar.addChild(slot.container);
    slots.push(slot);
  }

  drawItemSlot(bar);

  // Detail modal.
  const overlay = new Container();
  overlay.visible = false;

  const backdrop = new Graphics();
  backdrop.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: "#05040a", alpha: 0.62 });
  backdrop.eventMode = "static";
  backdrop.cursor = "default";
  backdrop.on("pointertap", () => closeDetail());
  overlay.addChild(backdrop);

  const detailPanel = new Container();
  detailPanel.x = DETAIL_X;
  detailPanel.y = DETAIL_Y;
  overlay.addChild(detailPanel);

  const detailFrame = new Graphics();
  // Swallow clicks inside the panel so they don't reach the backdrop.
  detailFrame.eventMode = "static";
  drawDetailFrame(detailFrame);
  detailPanel.addChild(detailFrame);

  const detailContent = new Container();
  detailPanel.addChild(detailContent);

  const closeButton = createCloseButton(() => closeDetail());
  closeButton.x = DETAIL_W - 44;
  closeButton.y = 14;
  detailPanel.addChild(closeButton);

  let openIndex: number | null = null;

  function openDetail(index: number): void {
    const monster = roster[index];
    if (!monster) {
      return;
    }
    openIndex = index;
    buildDetailContent(detailContent, monster);
    overlay.visible = true;
  }

  function closeDetail(): void {
    openIndex = null;
    overlay.visible = false;
  }

  function refresh(): void {
    for (let i = 0; i < slots.length; i += 1) {
      updateMonsterSlot(slots[i], roster[i]);
    }
    if (openIndex !== null) {
      const monster = roster[openIndex];
      if (monster) {
        buildDetailContent(detailContent, monster);
      } else {
        closeDetail();
      }
    }
  }

  function setVisible(visible: boolean): void {
    bar.visible = visible;
    if (!visible) {
      closeDetail();
    }
  }

  refresh();

  return {
    bar,
    overlay,
    refresh,
    setVisible,
    closeDetail,
    isDetailOpen: () => openIndex !== null
  };
}

function drawBarFrame(bar: Container): void {
  const shadow = new Graphics();
  shadow.roundRect(4, 6, BAR_W, BAR_H, 12).fill({ color: "#0a0911", alpha: 0.4 });
  bar.addChild(shadow);

  const edge = new Graphics();
  edge.roundRect(0, 0, BAR_W, BAR_H, 12).fill(PALETTE.panelEdgeDark);
  bar.addChild(edge);

  const face = new Graphics();
  face.roundRect(2, 2, BAR_W - 4, BAR_H - 4, 11).fill(PALETTE.panelFace);
  face.roundRect(2, 2, BAR_W - 4, BAR_H - 4, 11).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
  // Absorb taps on the bar so they don't fall through to the map (walk-to-tap).
  face.eventMode = "static";
  bar.addChild(face);

  const sheen = new Graphics();
  sheen.roundRect(6, 5, BAR_W - 12, 3, 2).fill({ color: "#ffffff", alpha: 0.14 });
  bar.addChild(sheen);
}

function createMonsterSlot(onTap: () => void): MonsterSlot {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointertap", onTap);

  const bg = new Graphics();
  container.addChild(bg);

  const sprite = new Sprite(Texture.EMPTY);
  sprite.anchor.set(0.5, 0.5);
  sprite.x = SQUARE / 2;
  sprite.y = SQUARE / 2;
  sprite.scale.set(0.5);
  container.addChild(sprite);

  const mask = new Graphics();
  mask.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 7).fill(0xffffff);
  container.addChild(mask);
  sprite.mask = mask;

  const border = new Graphics();
  container.addChild(border);

  const empty = new Text({ text: "空", style: styles.slotEmpty });
  empty.anchor.set(0.5);
  empty.x = SQUARE / 2;
  empty.y = SQUARE / 2;
  container.addChild(empty);

  return { container, bg, sprite, mask, border, empty };
}

function updateMonsterSlot(slot: MonsterSlot, monster: MonsterState | undefined): void {
  slot.border.clear();
  slot.bg.clear();

  if (!monster) {
    slot.container.eventMode = "none";
    slot.container.cursor = "default";
    slot.sprite.visible = false;
    slot.empty.visible = true;
    slot.bg.roundRect(0, 0, SQUARE, SQUARE, 8).fill(PALETTE.panelEdgeDark);
    slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 6).fill({ color: PALETTE.panelBack, alpha: 0.7 });
    slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 6).stroke({ color: PALETTE.panelEdgeLight, width: 1, alpha: 0.4 });
    return;
  }

  const species = SPECIES[monster.speciesId];
  const color = typeColor(species.types[0]);
  const fainted = monster.currentHp <= 0;

  slot.container.eventMode = "static";
  slot.container.cursor = "pointer";
  slot.empty.visible = false;
  slot.sprite.visible = true;

  slot.bg.roundRect(0, 0, SQUARE, SQUARE, 8).fill(PALETTE.panelEdgeDark);
  slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 6).fill(adjustColor(color, -0.18));
  slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6 * 0.5, 6).fill({ color, alpha: 0.95 });

  applySpriteTexture(slot.sprite, getBattleSpriteUrl(monster.speciesId, "front"));
  slot.sprite.alpha = fainted ? 0.45 : 1;

  slot.border.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 7).stroke({ color: adjustColor(color, 0.4), width: 2 });
  if (fainted) {
    slot.border.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 7).fill({ color: "#05040a", alpha: 0.35 });
  }
}

function drawItemSlot(bar: Container): void {
  const x = PAD + 3 * SQUARE + 2 * GAP + GAP;
  const y = PAD + (SQUARE - ITEM) / 2;

  const slot = new Graphics();
  slot.roundRect(x, y, ITEM, ITEM, 7).fill(PALETTE.panelEdgeDark);
  slot.roundRect(x + 3, y + 3, ITEM - 6, ITEM - 6, 5).fill({ color: PALETTE.panelBack, alpha: 0.8 });
  slot.roundRect(x + 3, y + 3, ITEM - 6, ITEM - 6, 5).stroke({ color: PALETTE.gold, width: 1, alpha: 0.5 });
  bar.addChild(slot);

  const hint = new Text({ text: "道具", style: styles.itemHint });
  hint.anchor.set(0.5);
  hint.x = x + ITEM / 2;
  hint.y = y + ITEM / 2;
  bar.addChild(hint);
}

function drawDetailFrame(frame: Graphics): void {
  frame.roundRect(6, 8, DETAIL_W, DETAIL_H, 16).fill({ color: "#0a0911", alpha: 0.5 });
  frame.roundRect(0, 0, DETAIL_W, DETAIL_H, 16).fill(PALETTE.panelEdgeDark);
  frame.roundRect(3, 3, DETAIL_W - 6, DETAIL_H - 6, 14).fill(PALETTE.panelFace);
  frame.roundRect(3, 3, DETAIL_W - 6, DETAIL_H - 6, 14).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
  frame.roundRect(8, 7, DETAIL_W - 16, 4, 3).fill({ color: "#ffffff", alpha: 0.12 });
  frame.rect(24, 56, DETAIL_W - 48, 1).fill({ color: PALETTE.gold, alpha: 0.5 });
}

function createCloseButton(onTap: () => void): Container {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";

  const SIZE = 30;
  const cx = SIZE / 2;

  const bg = new Graphics();
  const paintBg = (border: number, alpha: number) => {
    bg.clear();
    bg.roundRect(0, 0, SIZE, SIZE, 8).fill(PALETTE.panelEdgeDark);
    bg.roundRect(2, 2, SIZE - 4, SIZE - 4, 7).fill(PALETTE.panelBack);
    bg.roundRect(2, 2, SIZE - 4, SIZE - 4, 7).stroke({ color: PALETTE.gold, width: border, alpha });
  };
  paintBg(1.5, 0.7);
  container.addChild(bg);

  // Draw the cross as geometry so it sits dead-center regardless of font metrics.
  const arm = 6;
  const mark = new Graphics();
  mark
    .moveTo(cx - arm, cx - arm)
    .lineTo(cx + arm, cx + arm)
    .moveTo(cx + arm, cx - arm)
    .lineTo(cx - arm, cx + arm)
    .stroke({ color: PALETTE.ink, width: 2.5, cap: "round" });
  container.addChild(mark);

  container.on("pointertap", onTap);
  container.on("pointerover", () => paintBg(2, 1));
  container.on("pointerout", () => paintBg(1.5, 0.7));
  return container;
}

function buildDetailContent(content: Container, monster: MonsterState): void {
  content.removeChildren().forEach((child) => child.destroy({ children: true }));

  const species = SPECIES[monster.speciesId];
  const calcLevel = toCalcLevel(monster.level);
  const { stats, maxHp } = computeStats(monster.speciesId, calcLevel, monster.ivs, monster.evs, monster.nature);
  const primaryColor = typeColor(species.types[0]);

  // Header.
  const title = new Text({ text: species.name, style: styles.title });
  title.x = 28;
  title.y = 18;
  content.addChild(title);

  const level = new Text({ text: `Lv.${monster.level}`, style: styles.level });
  level.x = 28 + title.width + 14;
  level.y = 26;
  content.addChild(level);

  // Left column: type-colored portrait square.
  const portrait = new Graphics();
  portrait.roundRect(28, 72, 140, 140, 12).fill(PALETTE.panelEdgeDark);
  portrait.roundRect(31, 75, 134, 134, 10).fill(adjustColor(primaryColor, -0.15));
  portrait.roundRect(31, 75, 134, 67, 10).fill({ color: primaryColor, alpha: 0.95 });
  portrait.roundRect(31, 75, 134, 134, 10).stroke({ color: adjustColor(primaryColor, 0.4), width: 2 });
  content.addChild(portrait);

  const portraitSprite = new Sprite(Texture.EMPTY);
  applySpriteTexture(portraitSprite, getBattleSpriteUrl(monster.speciesId, "front"));
  portraitSprite.anchor.set(0.5, 0.5);
  portraitSprite.x = 28 + 70;
  portraitSprite.y = 72 + 70;
  portraitSprite.scale.set(1.25);
  const portraitMask = new Graphics();
  portraitMask.roundRect(31, 75, 134, 134, 10).fill(0xffffff);
  content.addChild(portraitMask);
  portraitSprite.mask = portraitMask;
  content.addChild(portraitSprite);

  // Type pills.
  let pillX = 28;
  for (const type of species.types) {
    const pillWidth = drawPill(content, pillX, 224, typeLabel(type), typeColor(type));
    pillX += pillWidth + 8;
  }

  // Nature + held item.
  addLabelValue(content, 28, 252, "性格", natureLabel(monster.nature));
  addLabelValue(content, 28, 278, "携带", monster.heldItem ?? "无");

  // HP + XP as bars spanning the left column.
  const barW = 156;
  const hp = Math.max(0, monster.currentHp);
  const hpRatio = maxHp > 0 ? hp / maxHp : 0;
  const { hi: hpHi, lo: hpLo } = hpColors(hpRatio);
  drawStatBar(content, 28, 306, barW, "体力", `${hp} / ${maxHp}`, hpRatio, hpHi, hpLo);

  const atMaxLevel = monster.level >= MAX_LEVEL;
  const xpNeed = xpToNextLevel(monster.level);
  const xpRatio = atMaxLevel ? 1 : xpNeed > 0 ? monster.xp / xpNeed : 0;
  const xpValue = atMaxLevel ? "MAX" : `${monster.xp} / ${xpNeed}`;
  drawStatBar(
    content,
    28,
    344,
    barW,
    "经验",
    xpValue,
    xpRatio,
    atMaxLevel ? PALETTE.gold : XP_HI,
    atMaxLevel ? adjustColor(PALETTE.gold, -0.3) : XP_LO
  );

  // Stats table.
  const tableX = 200;
  const colActual = 380;
  const colIv = 470;
  const colEv = 560;
  const headerY = 72;

  const tableTitle = new Text({ text: "能力值", style: styles.section });
  tableTitle.x = tableX;
  tableTitle.y = headerY;
  content.addChild(tableTitle);

  addRight(content, colActual, headerY, "实数", styles.statHeader);
  addRight(content, colIv, headerY, "个体", styles.statHeader);
  addRight(content, colEv, headerY, "努力", styles.statHeader);

  STAT_ROWS.forEach((row, i) => {
    const rowY = headerY + 28 + i * 28;
    const name = new Text({ text: row.label, style: styles.label });
    name.x = tableX;
    name.y = rowY;
    content.addChild(name);

    const actual = row.key === "hp" ? maxHp : stats[row.key];
    addRight(content, colActual, rowY, `${actual}`, styles.statValue);
    addRight(content, colIv, rowY, `${monster.ivs[row.key]}`, styles.statValue);
    addRight(content, colEv, rowY, `${monster.evs[row.key]}`, styles.statValue);
  });

  // Moves.
  const movesTitle = new Text({ text: "招式", style: styles.section });
  movesTitle.x = 28;
  movesTitle.y = 390;
  content.addChild(movesTitle);

  const cellW = 156;
  const cellH = 64;
  const cellGap = 8;
  const cellY = 414;
  for (let i = 0; i < 4; i += 1) {
    const cellX = 28 + i * (cellW + cellGap);
    const moveId = monster.moves[i];
    drawMoveCell(content, cellX, cellY, cellW, cellH, moveId);
  }
}

/**
 * Horizontal stat bar: label on the left, value on the right, a rounded track
 * underneath with a two-tone fill (matching the battle HP bar treatment).
 */
function drawStatBar(
  content: Container,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  ratio: number,
  hi: string,
  lo: string
): void {
  const labelText = new Text({ text: label, style: styles.barLabel });
  labelText.x = x;
  labelText.y = y;
  content.addChild(labelText);

  const valueText = new Text({ text: value, style: styles.barValue });
  valueText.anchor.set(1, 0);
  valueText.x = x + w;
  valueText.y = y + 1;
  content.addChild(valueText);

  const barY = y + 18;
  const barH = 8;
  const track = new Graphics();
  track.roundRect(x, barY, w, barH, barH / 2).fill(PALETTE.hpTrack);
  track.roundRect(x, barY, w, barH, barH / 2).stroke({ color: PALETTE.panelEdgeDark, width: 1, alpha: 0.6 });
  content.addChild(track);

  const fillW = Math.max(0, Math.min(1, ratio)) * w;
  if (fillW > 1) {
    const fill = new Graphics();
    fill.roundRect(x, barY, fillW, barH, barH / 2).fill(lo);
    fill.roundRect(x, barY, fillW, barH * 0.5, barH / 2).fill(hi);
    content.addChild(fill);
  }
}

function drawMoveCell(content: Container, x: number, y: number, w: number, h: number, moveId: string | undefined): void {
  const cell = new Graphics();
  cell.roundRect(x, y, w, h, 8).fill(PALETTE.panelEdgeDark);
  cell.roundRect(x + 2, y + 2, w - 4, h - 4, 7).fill(PALETTE.panelBack);
  content.addChild(cell);

  if (!moveId || !(moveId in MOVES)) {
    const dash = new Text({ text: "—", style: styles.pp });
    dash.anchor.set(0.5);
    dash.x = x + w / 2;
    dash.y = y + h / 2;
    content.addChild(dash);
    return;
  }

  const move = MOVES[moveId as keyof typeof MOVES];
  const meta = moveMeta(moveId as keyof typeof MOVES);

  cell.roundRect(x + 2, y + 2, w - 4, h - 4, 7).stroke({ color: typeColor(meta.type), width: 1.5, alpha: 0.8 });

  const name = new Text({ text: move.name, style: styles.moveName });
  name.x = x + 10;
  name.y = y + 9;
  content.addChild(name);

  drawPill(content, x + 10, y + 34, typeLabel(meta.type), typeColor(meta.type));

  const pp = new Text({ text: `PP ${move.pp}/${move.pp}`, style: styles.pp });
  pp.anchor.set(1, 0);
  pp.x = x + w - 10;
  pp.y = y + 38;
  content.addChild(pp);
}

function drawPill(content: Container, x: number, y: number, label: string, color: string): number {
  const text = new Text({ text: label, style: styles.pill });
  const width = text.width + 16;
  const pill = new Graphics();
  pill.roundRect(x, y, width, 18, 9).fill(color);
  pill.roundRect(x, y, width, 18, 9).stroke({ color: adjustColor(color, -0.3), width: 1 });
  content.addChild(pill);
  text.x = x + 8;
  text.y = y + 3;
  content.addChild(text);
  return width;
}

function addLabelValue(content: Container, x: number, y: number, label: string, value: string): void {
  const labelText = new Text({ text: `${label}`, style: styles.label });
  labelText.x = x;
  labelText.y = y;
  content.addChild(labelText);

  const valueText = new Text({ text: value, style: styles.value });
  valueText.x = x + 48;
  valueText.y = y;
  content.addChild(valueText);
}

function addRight(content: Container, rightX: number, y: number, value: string, style: TextStyle): void {
  const text = new Text({ text: value, style });
  text.anchor.set(1, 0);
  text.x = rightX;
  text.y = y;
  content.addChild(text);
}
