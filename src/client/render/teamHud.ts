import { Assets, Container, FederatedPointerEvent, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { adjustColor, hpColors, PALETTE, pixelText, typeColor, typeLabel } from "./theme";
import { getBattleSpriteUrl } from "../../game/data/art";
import { MOVES } from "../../game/data/moves";
import { SPECIES } from "../../game/data/species";
import { speciesTypes } from "../../game/data/pokedex";
import { ITEMS, itemName, type ItemId } from "../../game/data/items";
import { createItemIcon } from "./itemIcon";
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

// Pointer must travel this far before a press on a slot becomes a drag (so a
// plain tap still opens the detail window).
const DRAG_THRESHOLD = 6;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Home x of slot at display position `pos` within the bar. */
function slotHomeX(pos: number): number {
  return PAD + pos * (SQUARE + GAP);
}

/** Top-left x of the single backpack item slot within the bar. */
function itemSlotX(): number {
  return PAD + 3 * SQUARE + 2 * GAP + GAP;
}

/** Whether a bar-local point falls inside the backpack item slot. */
function isOverItemSlot(localX: number, localY: number): boolean {
  const x = itemSlotX();
  const y = PAD + (SQUARE - ITEM) / 2;
  return localX >= x && localX <= x + ITEM && localY >= y && localY <= y + ITEM;
}

// Move grid geometry (the 4 move cells along the bottom of the detail window).
const MOVE_CELL_W = 156;
const MOVE_CELL_H = 64;
const MOVE_CELL_GAP = 8;
const MOVE_CELL_X0 = 28;
const MOVE_CELL_Y = 414;

/** Home x of the move cell at display position `pos` within the detail content. */
function moveCellHomeX(pos: number): number {
  return MOVE_CELL_X0 + pos * (MOVE_CELL_W + MOVE_CELL_GAP);
}
const BAR_W = PAD * 2 + 3 * SQUARE + 2 * GAP + GAP + ITEM;
const BAR_H = PAD * 2 + SQUARE;

// Detail window geometry.
const DETAIL_W = 700;
const DETAIL_H = 492;
const DETAIL_X = Math.round((GAME_WIDTH - DETAIL_W) / 2);
const DETAIL_Y = Math.round((GAME_HEIGHT - DETAIL_H) / 2);

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

function natureLabel(nature: string): string {
  return NATURE_LABELS[nature] ?? nature;
}

/**
 * Assign a battle sprite texture. The sprites stream through the Showdown proxy
 * and may not be in the texture cache yet, so resolve through `Assets.load`
 * (which returns the cached texture immediately once loaded) and assign on
 * resolve; otherwise the slot stays blank.
 */
// Cache the opaque-fit scale factor per sprite URL (pixel scan is one-time).
const opaqueFitCache = new Map<string, number>();

/**
 * Many gen5 PNG sprites carry heavy transparent padding, so the visible body
 * sits small inside the frame. When both the opaque bounding box's width and
 * height are under 70% of the source frame, scale the sprite up so its longer
 * opaque edge reaches 70% of the frame — small-bodied sprites (e.g. 小火龙)
 * then read at a consistent size. Falls back to 1 on any failure.
 */
function opaqueFitFactor(url: string, texture: Texture): number {
  const cached = opaqueFitCache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  let factor = 1;
  try {
    const source = texture.source;
    const resource = source.resource as CanvasImageSource | undefined;
    const w = source.pixelWidth;
    const h = source.pixelHeight;
    if (resource && w && h) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(resource, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= 0) {
          const bw = maxX - minX + 1;
          const bh = maxY - minY + 1;
          if (bw < w * 0.7 && bh < h * 0.7) {
            const longerBbox = Math.max(bw, bh);
            const longerOrig = bw >= bh ? w : h;
            factor = (0.7 * longerOrig) / longerBbox;
          }
        }
      }
    }
  } catch {
    factor = 1;
  }
  opaqueFitCache.set(url, factor);
  return factor;
}

function applySpriteTexture(sprite: Sprite, url: string, baseScale: number): void {
  void Assets.load(url)
    .then((texture: Texture) => {
      sprite.texture = texture;
      sprite.scale.set(baseScale * opaqueFitFactor(url, texture));
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
  /** Bottom-right held-item badge (icon rebuilt per refresh).  */
  badge: Container;
};

export type TeamHudView = {
  /** Bottom-right info bar; toggle `visible` from the scene. */
  bar: Container;
  /** Full-screen modal overlay for the detail window; lives above everything. */
  overlay: Container;
  /** Full-screen layer for the drag-an-item 使用/携带 menu; above the overlay. */
  actionMenu: Container;
  /** Re-read the roster and repaint the slots (+ open detail, if any). */
  refresh(): void;
  /** Hide the bar and close the detail window (used when leaving the map). */
  setVisible(visible: boolean): void;
  /** Close the detail window if it is open. */
  closeDetail(): void;
  isDetailOpen(): boolean;
  /** Whether the drag-item action menu is currently open. */
  isItemMenuOpen(): boolean;
};

/** Hooks the scene supplies so the single backpack item can be dragged onto a monster. */
export type TeamHudOptions = {
  /** Party reorder / move reorder committed; persist + repaint upstream. */
  onReorder?: () => void;
  /** The id of the item currently in the single backpack slot (or undefined). */
  getBackpackItemId?: () => ItemId | undefined;
  /** Would 使用 work on roster member `index` right now? Decides 使用/携带 vs auto-携带. */
  canUseBackpackItemOn?: (monsterIndex: number) => boolean;
  /** The player dropped the backpack item on roster member `index` and chose an action. */
  onApplyBackpackItem?: (monsterIndex: number, action: "use" | "equip") => void;
  /** The player dragged roster member `index` onto the empty backpack slot to unequip its held item. */
  onUnequipHeldItem?: (monsterIndex: number) => void;
};

export function createTeamHud(roster: MonsterState[], options: TeamHudOptions = {}): TeamHudView {
  const { onReorder, getBackpackItemId, canUseBackpackItemOn, onApplyBackpackItem, onUnequipHeldItem } = options;
  const bar = new Container();
  bar.x = GAME_WIDTH - MARGIN - BAR_W;
  bar.y = GAME_HEIGHT - MARGIN - BAR_H;
  // Needed so the bar receives `globalpointermove` while a drag is in flight.
  bar.eventMode = "static";

  drawBarFrame(bar);

  const slots: MonsterSlot[] = [];
  for (let i = 0; i < 3; i += 1) {
    const index = i;
    const slot = createMonsterSlot((event) => beginPress(index, event));
    slot.container.x = slotHomeX(i);
    slot.container.y = PAD;
    bar.addChild(slot.container);
    slots.push(slot);
  }

  const itemSlot = createItemSlot((event) => beginItemPress(event));
  bar.addChild(itemSlot.container);

  // --- Drag-to-reorder the party (decides battle/leadoff order) ---------------
  // `slots[i]` always renders `roster[i]`, so slot index == roster index. While
  // dragging we move slot containers around for feedback, then on drop splice
  // the shared roster array in place (it is `runState.player.team`, so the new
  // lead order persists) and `refresh()` repaints every slot from home.
  let drag: {
    index: number;
    startX: number;
    startY: number;
    grabDX: number;
    started: boolean;
    targetIndex: number;
    lastX: number;
    lastY: number;
  } | null = null;

  function resetSlotPositions(): void {
    for (let i = 0; i < slots.length; i += 1) {
      slots[i].container.x = slotHomeX(i);
      slots[i].container.y = PAD;
      slots[i].container.alpha = 1;
    }
  }

  function beginPress(index: number, event: FederatedPointerEvent): void {
    if (!roster[index]) {
      return;
    }
    const local = bar.toLocal(event.global);
    drag = {
      index,
      startX: local.x,
      startY: local.y,
      grabDX: local.x - slotHomeX(index),
      started: false,
      targetIndex: index,
      lastX: local.x,
      lastY: local.y
    };
  }

  function onDragMove(event: FederatedPointerEvent): void {
    if (!drag) {
      return;
    }
    const local = bar.toLocal(event.global);
    drag.lastX = local.x;
    drag.lastY = local.y;
    const slot = slots[drag.index];

    if (!drag.started) {
      if (Math.hypot(local.x - drag.startX, local.y - drag.startY) < DRAG_THRESHOLD) {
        return;
      }
      drag.started = true;
      bar.setChildIndex(slot.container, bar.children.length - 1);
      slot.container.alpha = 0.92;
      slot.container.cursor = "grabbing";
    }

    // Drop-on-item-slot to unequip: highlight the slot when this monster holds
    // an item and the backpack is free.
    const canUnequip = Boolean(roster[drag.index]?.heldItem) && !getBackpackItemId?.();
    itemSlot.setDropTarget(canUnequip && isOverItemSlot(local.x, local.y));

    const lastPos = roster.length - 1;
    const x = clamp(local.x - drag.grabDX, slotHomeX(0), slotHomeX(lastPos));
    slot.container.x = x;
    slot.container.y = PAD - 5;

    // Insertion point from the dragged slot's center.
    drag.targetIndex = clamp(Math.round((x - slotHomeX(0)) / (SQUARE + GAP)), 0, lastPos);

    // Lay the other slots out around the gap the drag would open.
    const order: number[] = [];
    for (let i = 0; i < roster.length; i += 1) {
      if (i !== drag.index) {
        order.push(i);
      }
    }
    order.splice(drag.targetIndex, 0, drag.index);
    for (let pos = 0; pos < order.length; pos += 1) {
      const si = order[pos];
      if (si !== drag.index) {
        slots[si].container.x = slotHomeX(pos);
      }
    }
  }

  function onDragEnd(): void {
    if (!drag) {
      return;
    }
    const finished = drag;
    drag = null;
    slots[finished.index].container.cursor = "grab";
    itemSlot.setDropTarget(false);

    if (!finished.started) {
      resetSlotPositions();
      openDetail(finished.index);
      return;
    }

    // Dropped on the empty backpack slot while holding an item → unequip it.
    if (
      isOverItemSlot(finished.lastX, finished.lastY) &&
      roster[finished.index]?.heldItem &&
      !getBackpackItemId?.()
    ) {
      onUnequipHeldItem?.(finished.index);
      refresh();
      resetSlotPositions();
      return;
    }

    if (finished.targetIndex !== finished.index) {
      const [moved] = roster.splice(finished.index, 1);
      roster.splice(finished.targetIndex, 0, moved);
      onReorder?.();
    }
    refresh();
    resetSlotPositions();
  }

  bar.on("globalpointermove", onDragMove);
  bar.on("pointerup", onDragEnd);
  bar.on("pointerupoutside", onDragEnd);

  // --- Drag the single backpack item onto a monster ---------------------------
  // The item slot (right of the party squares) shows the backpack item's icon
  // when one is stashed. Press-drag it left onto a party square; on drop, if the
  // item can be 使用 on that monster we pop a 使用 / 携带 menu, otherwise we just
  // 携带 (equip) it — held-only items (type boosters, etc.) are never "used".
  let itemDrag: {
    startX: number;
    startY: number;
    started: boolean;
    ghost: Container | null;
  } | null = null;

  function beginItemPress(event: FederatedPointerEvent): void {
    if (!getBackpackItemId?.()) {
      return;
    }
    const local = bar.toLocal(event.global);
    itemDrag = { startX: local.x, startY: local.y, started: false, ghost: null };
  }

  /** Party-square index under a bar-local point, or -1. */
  function monsterSlotAt(localX: number, localY: number): number {
    if (localY < PAD || localY > PAD + SQUARE) {
      return -1;
    }
    for (let i = 0; i < roster.length; i += 1) {
      if (!roster[i]) {
        continue;
      }
      const x0 = slotHomeX(i);
      if (localX >= x0 && localX <= x0 + SQUARE) {
        return i;
      }
    }
    return -1;
  }

  function onItemDragMove(event: FederatedPointerEvent): void {
    if (!itemDrag) {
      return;
    }
    const itemId = getBackpackItemId?.();
    if (!itemId) {
      cancelItemDrag();
      return;
    }
    const local = bar.toLocal(event.global);

    if (!itemDrag.started) {
      if (Math.hypot(local.x - itemDrag.startX, local.y - itemDrag.startY) < DRAG_THRESHOLD) {
        return;
      }
      itemDrag.started = true;
      itemSlot.setDragging(true);
      const ghost = createItemIcon(itemId, ITEM - 8);
      ghost.alpha = 0.92;
      bar.addChild(ghost);
      itemDrag.ghost = ghost;
    }

    if (itemDrag.ghost) {
      itemDrag.ghost.x = local.x - (ITEM - 8) / 2;
      itemDrag.ghost.y = local.y - (ITEM - 8) / 2;
    }

    const hovered = monsterSlotAt(local.x, local.y);
    for (let i = 0; i < slots.length; i += 1) {
      slots[i].container.alpha = hovered === i ? 0.8 : 1;
    }
  }

  function onItemDragEnd(event: FederatedPointerEvent): void {
    if (!itemDrag) {
      return;
    }
    const started = itemDrag.started;
    const local = bar.toLocal(event.global);
    cancelItemDrag();
    if (!started) {
      return;
    }
    const target = monsterSlotAt(local.x, local.y);
    if (target < 0 || !getBackpackItemId?.()) {
      return;
    }
    if (canUseBackpackItemOn?.(target)) {
      openItemActionMenu(target);
    } else {
      onApplyBackpackItem?.(target, "equip");
    }
  }

  function cancelItemDrag(): void {
    if (itemDrag?.ghost) {
      itemDrag.ghost.destroy({ children: true });
    }
    itemDrag = null;
    itemSlot.setDragging(false);
    for (let i = 0; i < slots.length; i += 1) {
      slots[i].container.alpha = 1;
    }
  }

  bar.on("globalpointermove", onItemDragMove);
  bar.on("pointerup", onItemDragEnd);
  bar.on("pointerupoutside", onItemDragEnd);

  // The 使用 / 携带 popup, raised over everything (its own full-screen layer).
  const actionMenu = new Container();
  actionMenu.visible = false;

  const menuBackdrop = new Graphics();
  menuBackdrop.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: "#05040a", alpha: 0.01 });
  menuBackdrop.eventMode = "static";
  menuBackdrop.cursor = "default";
  menuBackdrop.on("pointertap", () => closeItemMenu());
  actionMenu.addChild(menuBackdrop);

  const menuPanel = new Container();
  actionMenu.addChild(menuPanel);

  function closeItemMenu(): void {
    actionMenu.visible = false;
  }

  function openItemActionMenu(monsterIndex: number): void {
    menuPanel.removeChildren().forEach((child) => child.destroy({ children: true }));

    const MENU_W = 132;
    const BTN_H = 34;
    const PADDING = 8;
    const MENU_H = PADDING * 2 + BTN_H * 2 + 6;

    const frame = new Graphics();
    frame.roundRect(4, 5, MENU_W, MENU_H, 10).fill({ color: "#0a0911", alpha: 0.5 });
    frame.roundRect(0, 0, MENU_W, MENU_H, 10).fill(PALETTE.panelEdgeDark);
    frame.roundRect(2, 2, MENU_W - 4, MENU_H - 4, 9).fill(PALETTE.panelFace);
    frame.roundRect(2, 2, MENU_W - 4, MENU_H - 4, 9).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
    frame.eventMode = "static";
    menuPanel.addChild(frame);

    menuPanel.addChild(
      createMenuButton("使用", PADDING, PADDING, MENU_W - PADDING * 2, BTN_H, () => {
        closeItemMenu();
        onApplyBackpackItem?.(monsterIndex, "use");
      })
    );
    menuPanel.addChild(
      createMenuButton("携带", PADDING, PADDING + BTN_H + 6, MENU_W - PADDING * 2, BTN_H, () => {
        closeItemMenu();
        onApplyBackpackItem?.(monsterIndex, "equip");
      })
    );

    // Anchor above the target party square (bar-local → stage coords).
    const slotCenterX = bar.x + slotHomeX(monsterIndex) + SQUARE / 2;
    const slotTopY = bar.y + PAD;
    menuPanel.x = Math.round(clamp(slotCenterX - MENU_W / 2, 8, GAME_WIDTH - MENU_W - 8));
    menuPanel.y = Math.round(slotTopY - MENU_H - 10);
    actionMenu.visible = true;
  }

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
  // Static so it receives `globalpointermove` while a move cell is dragged.
  detailContent.eventMode = "static";
  detailPanel.addChild(detailContent);

  const closeButton = createCloseButton(() => closeDetail());
  closeButton.x = DETAIL_W - 44;
  closeButton.y = 14;
  detailPanel.addChild(closeButton);

  let openIndex: number | null = null;

  // --- Drag-to-reorder a monster's moves (inside the detail window) ----------
  // Each rebuild registers the freshly-built move cells (index-aligned to
  // `monster.moves`). On drop the moves array is spliced in place — it is part
  // of the persistent `MonsterState`, so the new order carries into battle
  // (Q/W/E/R). Mirrors the party drag above but scoped to the detail content.
  let moveDrag: {
    index: number;
    startX: number;
    startY: number;
    grabDX: number;
    started: boolean;
    targetIndex: number;
  } | null = null;
  let moveCells: Container[] = [];
  let moveMonster: MonsterState | null = null;

  function renderDetail(monster: MonsterState): void {
    moveDrag = null;
    moveMonster = monster;
    moveCells = buildDetailContent(detailContent, monster);
    for (let i = 0; i < moveCells.length; i += 1) {
      if (!monster.moves[i]) {
        continue;
      }
      const index = i;
      const cell = moveCells[i];
      cell.eventMode = "static";
      cell.cursor = "grab";
      cell.on("pointerdown", (event) => beginMovePress(index, event));
    }
  }

  function beginMovePress(index: number, event: FederatedPointerEvent): void {
    if (!moveMonster || !moveMonster.moves[index]) {
      return;
    }
    const local = detailContent.toLocal(event.global);
    moveDrag = {
      index,
      startX: local.x,
      startY: local.y,
      grabDX: local.x - moveCellHomeX(index),
      started: false,
      targetIndex: index
    };
  }

  function onMoveDragMove(event: FederatedPointerEvent): void {
    if (!moveDrag || !moveMonster) {
      return;
    }
    const cell = moveCells[moveDrag.index];
    if (!cell) {
      moveDrag = null;
      return;
    }
    const local = detailContent.toLocal(event.global);

    if (!moveDrag.started) {
      if (Math.hypot(local.x - moveDrag.startX, local.y - moveDrag.startY) < DRAG_THRESHOLD) {
        return;
      }
      moveDrag.started = true;
      detailContent.setChildIndex(cell, detailContent.children.length - 1);
      cell.alpha = 0.92;
      cell.cursor = "grabbing";
    }

    const lastPos = moveMonster.moves.length - 1;
    const x = clamp(local.x - moveDrag.grabDX, moveCellHomeX(0), moveCellHomeX(lastPos));
    cell.x = x;
    cell.y = MOVE_CELL_Y - 6;

    moveDrag.targetIndex = clamp(Math.round((x - moveCellHomeX(0)) / (MOVE_CELL_W + MOVE_CELL_GAP)), 0, lastPos);

    const order: number[] = [];
    for (let i = 0; i < moveMonster.moves.length; i += 1) {
      if (i !== moveDrag.index) {
        order.push(i);
      }
    }
    order.splice(moveDrag.targetIndex, 0, moveDrag.index);
    for (let pos = 0; pos < order.length; pos += 1) {
      const ci = order[pos];
      if (ci !== moveDrag.index && moveCells[ci]) {
        moveCells[ci].x = moveCellHomeX(pos);
        moveCells[ci].y = MOVE_CELL_Y;
      }
    }
  }

  function onMoveDragEnd(): void {
    if (!moveDrag) {
      return;
    }
    const finished = moveDrag;
    const monster = moveMonster;
    moveDrag = null;

    if (!finished.started || !monster) {
      // A plain tap (or lost monster); just snap the cells back home.
      if (monster) {
        renderDetail(monster);
      }
      return;
    }

    if (finished.targetIndex !== finished.index) {
      const [moved] = monster.moves.splice(finished.index, 1);
      monster.moves.splice(finished.targetIndex, 0, moved);
      onReorder?.();
    }
    renderDetail(monster);
  }

  detailContent.on("globalpointermove", onMoveDragMove);
  detailContent.on("pointerup", onMoveDragEnd);
  detailContent.on("pointerupoutside", onMoveDragEnd);

  function openDetail(index: number): void {
    const monster = roster[index];
    if (!monster) {
      return;
    }
    openIndex = index;
    renderDetail(monster);
    overlay.visible = true;
  }

  function closeDetail(): void {
    openIndex = null;
    moveDrag = null;
    overlay.visible = false;
  }

  function refresh(): void {
    for (let i = 0; i < slots.length; i += 1) {
      updateMonsterSlot(slots[i], roster[i]);
    }
    itemSlot.update(getBackpackItemId?.());
    if (openIndex !== null) {
      const monster = roster[openIndex];
      if (monster) {
        renderDetail(monster);
      } else {
        closeDetail();
      }
    }
  }

  function setVisible(visible: boolean): void {
    bar.visible = visible;
    if (!visible) {
      closeDetail();
      closeItemMenu();
    }
  }

  refresh();

  return {
    bar,
    overlay,
    actionMenu,
    refresh,
    setVisible,
    closeDetail,
    isDetailOpen: () => openIndex !== null,
    isItemMenuOpen: () => actionMenu.visible
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

function createMonsterSlot(onPointerDown: (event: FederatedPointerEvent) => void): MonsterSlot {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointerdown", onPointerDown);

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

  // Bottom-right corner badge showing the monster's held item, if any.
  const badge = new Container();
  container.addChild(badge);

  const empty = new Text({ text: "空", style: styles.slotEmpty });
  empty.anchor.set(0.5);
  empty.x = SQUARE / 2;
  empty.y = SQUARE / 2;
  container.addChild(empty);

  return { container, bg, sprite, mask, border, empty, badge };
}

function updateMonsterSlot(slot: MonsterSlot, monster: MonsterState | undefined): void {
  slot.border.clear();
  slot.bg.clear();
  slot.badge.removeChildren().forEach((child) => child.destroy({ children: true }));

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

  const color = typeColor(speciesTypes(monster.speciesId)[0]);
  const fainted = monster.currentHp <= 0;

  slot.container.eventMode = "static";
  slot.container.cursor = "grab";
  slot.empty.visible = false;
  slot.sprite.visible = true;

  slot.bg.roundRect(0, 0, SQUARE, SQUARE, 8).fill(PALETTE.panelEdgeDark);
  slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 6).fill(adjustColor(color, -0.18));
  slot.bg.roundRect(3, 3, SQUARE - 6, SQUARE - 6 * 0.5, 6).fill({ color, alpha: 0.95 });

  applySpriteTexture(slot.sprite, getBattleSpriteUrl(monster.speciesId, "front"), 0.5);
  slot.sprite.alpha = fainted ? 0.45 : 1;

  slot.border.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 7).stroke({ color: adjustColor(color, 0.4), width: 2 });
  if (fainted) {
    slot.border.roundRect(3, 3, SQUARE - 6, SQUARE - 6, 7).fill({ color: "#05040a", alpha: 0.35 });
  }

  // Held-item badge: the item's icon tucked into the bottom-right corner.
  if (monster.heldItem && monster.heldItem in ITEMS) {
    const badgeSize = 22;
    const icon = createItemIcon(monster.heldItem as ItemId, badgeSize);
    icon.x = SQUARE - badgeSize - 2;
    icon.y = SQUARE - badgeSize - 2;
    slot.badge.addChild(icon);
  }
}

type ItemSlotView = {
  container: Container;
  /** Repaint for the current backpack item id (undefined = empty). */
  update(itemId: ItemId | undefined): void;
  /** Dim the slot while its item is being dragged out. */
  setDragging(on: boolean): void;
  /** Glow the slot while a held-item monster hovers over it (drop-to-unequip). */
  setDropTarget(on: boolean): void;
};

/**
 * The single backpack slot at the right of the bar. Empty → a "道具" hint;
 * occupied → the item's icon, draggable onto a party square. `onPointerDown`
 * starts the drag (only fires when an item is present).
 */
function createItemSlot(onPointerDown: (event: FederatedPointerEvent) => void): ItemSlotView {
  const x = PAD + 3 * SQUARE + 2 * GAP + GAP;
  const y = PAD + (SQUARE - ITEM) / 2;

  const container = new Container();
  container.on("pointerdown", onPointerDown);

  const frame = new Graphics();
  frame.roundRect(x, y, ITEM, ITEM, 7).fill(PALETTE.panelEdgeDark);
  frame.roundRect(x + 3, y + 3, ITEM - 6, ITEM - 6, 5).fill({ color: PALETTE.panelBack, alpha: 0.8 });
  frame.roundRect(x + 3, y + 3, ITEM - 6, ITEM - 6, 5).stroke({ color: PALETTE.gold, width: 1, alpha: 0.5 });
  container.addChild(frame);

  // Drop-to-unequip highlight ring (shown only while a held-item monster hovers).
  const dropGlow = new Graphics();
  dropGlow.visible = false;
  dropGlow.roundRect(x - 2, y - 2, ITEM + 4, ITEM + 4, 8).stroke({ color: PALETTE.gold, width: 2.5 });
  container.addChild(dropGlow);

  const hint = new Text({ text: "道具", style: styles.itemHint });
  hint.anchor.set(0.5);
  hint.x = x + ITEM / 2;
  hint.y = y + ITEM / 2;
  container.addChild(hint);

  let icon: Container | null = null;
  let currentId: ItemId | undefined;

  function update(itemId: ItemId | undefined): void {
    if (itemId === currentId) {
      return;
    }
    currentId = itemId;
    if (icon) {
      icon.destroy({ children: true });
      icon = null;
    }
    if (itemId) {
      hint.visible = false;
      icon = createItemIcon(itemId, ITEM - 12);
      icon.x = x + 6;
      icon.y = y + 6;
      container.addChild(icon);
      container.eventMode = "static";
      container.cursor = "grab";
    } else {
      hint.visible = true;
      container.eventMode = "none";
      container.cursor = "default";
    }
  }

  function setDragging(on: boolean): void {
    container.alpha = on ? 0.4 : 1;
  }

  function setDropTarget(on: boolean): void {
    dropGlow.visible = on;
  }

  return { container, update, setDragging, setDropTarget };
}

/** A small flat pixel button for the drag-item action menu. */
function createMenuButton(label: string, x: number, y: number, w: number, h: number, onTap: () => void): Container {
  const container = new Container();
  container.x = x;
  container.y = y;
  container.eventMode = "static";
  container.cursor = "pointer";

  const bg = new Graphics();
  const paint = (hover: boolean) => {
    bg.clear();
    bg.roundRect(0, 0, w, h, 7).fill(PALETTE.panelEdgeDark);
    bg.roundRect(2, 2, w - 4, h - 4, 6).fill(hover ? adjustColor(PALETTE.gold, -0.35) : PALETTE.panelBack);
    bg.roundRect(2, 2, w - 4, h - 4, 6).stroke({ color: PALETTE.gold, width: 1, alpha: hover ? 1 : 0.6 });
  };
  paint(false);
  container.addChild(bg);

  const text = new Text({ text: label, style: styles.value });
  text.anchor.set(0.5);
  text.x = w / 2;
  text.y = h / 2;
  container.addChild(text);

  container.on("pointertap", onTap);
  container.on("pointerover", () => paint(true));
  container.on("pointerout", () => paint(false));
  return container;
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

function buildDetailContent(content: Container, monster: MonsterState): Container[] {
  content.removeChildren().forEach((child) => child.destroy({ children: true }));

  const species = SPECIES[monster.speciesId];
  const calcLevel = toCalcLevel(monster.level);
  const { stats, maxHp } = computeStats(monster.speciesId, calcLevel, monster.ivs, monster.evs, monster.nature);
  const types = speciesTypes(monster.speciesId);
  const primaryColor = typeColor(types[0]);

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
  applySpriteTexture(portraitSprite, getBattleSpriteUrl(monster.speciesId, "front"), 1.25);
  portraitSprite.anchor.set(0.5, 0.5);
  portraitSprite.x = 28 + 70;
  portraitSprite.y = 72 + 70;
  const portraitMask = new Graphics();
  portraitMask.roundRect(31, 75, 134, 134, 10).fill(0xffffff);
  content.addChild(portraitMask);
  portraitSprite.mask = portraitMask;
  content.addChild(portraitSprite);

  // Type pills.
  let pillX = 28;
  for (const type of types) {
    const pillWidth = drawPill(content, pillX, 224, typeLabel(type), typeColor(type));
    pillX += pillWidth + 8;
  }

  // Nature + held item (with its icon when one is equipped).
  addLabelValue(content, 28, 252, "性格", natureLabel(monster.nature));
  addLabelValue(content, 28, 278, "携带", itemName(monster.heldItem));
  if (monster.heldItem && monster.heldItem in ITEMS) {
    const icon = createItemIcon(monster.heldItem as ItemId, 22);
    icon.x = 188;
    icon.y = 276;
    content.addChild(icon);
  }

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

  const movesHint = new Text({ text: "拖动可调整顺序", style: styles.itemHint });
  movesHint.x = 28 + movesTitle.width + 12;
  movesHint.y = 394;
  content.addChild(movesHint);

  const moveCells: Container[] = [];
  for (let i = 0; i < 4; i += 1) {
    const moveId = monster.moves[i];
    moveCells.push(drawMoveCell(content, moveCellHomeX(i), MOVE_CELL_Y, MOVE_CELL_W, MOVE_CELL_H, moveId));
  }
  return moveCells;
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

/**
 * Build one move cell as a self-contained Container positioned at (x, y), with
 * all children laid out in cell-local coordinates so the whole cell can be
 * picked up and moved as a unit during a reorder drag. Returns the container.
 */
function drawMoveCell(
  content: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  moveId: string | undefined
): Container {
  const cell = new Container();
  cell.x = x;
  cell.y = y;
  content.addChild(cell);

  const bg = new Graphics();
  bg.roundRect(0, 0, w, h, 8).fill(PALETTE.panelEdgeDark);
  bg.roundRect(2, 2, w - 4, h - 4, 7).fill(PALETTE.panelBack);
  cell.addChild(bg);

  if (!moveId || !(moveId in MOVES)) {
    const dash = new Text({ text: "—", style: styles.pp });
    dash.anchor.set(0.5);
    dash.x = w / 2;
    dash.y = h / 2;
    cell.addChild(dash);
    return cell;
  }

  const move = MOVES[moveId as keyof typeof MOVES];
  const meta = moveMeta(moveId as keyof typeof MOVES);

  bg.roundRect(2, 2, w - 4, h - 4, 7).stroke({ color: typeColor(meta.type), width: 1.5, alpha: 0.8 });

  const name = new Text({ text: move.name, style: styles.moveName });
  name.x = 10;
  name.y = 9;
  cell.addChild(name);

  drawPill(cell, 10, 34, typeLabel(meta.type), typeColor(meta.type));

  const pp = new Text({ text: `PP ${move.pp}/${move.pp}`, style: styles.pp });
  pp.anchor.set(1, 0);
  pp.x = w - 10;
  pp.y = 38;
  cell.addChild(pp);
  return cell;
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
