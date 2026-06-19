import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { createButton, type Button } from "./button";
import { adjustColor, categoryColor, hpColors, PALETTE, pixelText, typeColor, typeLabel } from "./theme";
import { moveMeta } from "../../game/battle/smogonCalc";
import { MOVES } from "../../game/data/moves";
import type { BattleStateView } from "../../game/battle/types";

const MOVE_HOTKEYS = ["Q", "W", "E", "R"] as const;
const SWITCH_HOTKEYS = ["1", "2", "3"] as const;

// Geometry inside the command box (x=32, y=414, w=GAME_WIDTH-64, h=110).
const INNER_LEFT = 44;
const MOVE_ROW_Y = 422;
const MOVE_BTN_W = 210;
const MOVE_BTN_H = 50;
const MOVE_GAP = 10;
const POKE_ROW_Y = 478;
const POKE_BTN_W = 241;
const POKE_BTN_H = 36;
const POKE_GAP = 10;
const CAPTURE_BTN_W = 118;

const styles = {
  moveName: new TextStyle(pixelText({ fill: PALETTE.btnInk, fontSize: 18, fontWeight: "700", shadow: true })),
  typeLabel: new TextStyle(pixelText({ fill: "#1c1622", fontSize: 12, fontWeight: "700" })),
  hotkey: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 12, fontWeight: "700" })),
  pokeName: new TextStyle(pixelText({ fill: PALETTE.btnInk, fontSize: 15, fontWeight: "700", shadow: true })),
  pokeHp: new TextStyle(pixelText({ fill: PALETTE.btnInkSoft, fontSize: 11, fontWeight: "700" })),
  pokeTag: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 11, fontWeight: "700" })),
  capture: new TextStyle(pixelText({ fill: PALETTE.btnInk, fontSize: 16, fontWeight: "700", shadow: true })),
  prompt: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 18, fontWeight: "700", shadow: true }))
};

export type BattleControlsCallbacks = {
  onMove: (index: number) => void;
  onSwitch: (index: number) => void;
  onCapture: () => void;
};

type MoveButton = {
  button: Button;
  name: Text;
  hotkey: Text;
  pill: Graphics;
  pillLabel: Text;
  categoryIcon: Graphics;
  appliedKey: string;
};

type PokeButton = {
  button: Button;
  name: Text;
  hotkey: Text;
  hpTrack: Graphics;
  hpFill: Graphics;
  hpText: Text;
  tag: Text;
  appliedKey: string;
};

export type BattleControlsView = {
  container: Container;
  /**
   * `forceSwitch` is the post-faint replacement mode: moves and capture are
   * disabled so only a benched party pick is possible.
   */
  update(view: BattleStateView, getHp: (instanceId: string, fallback: number) => number, forceSwitch?: boolean): void;
};

/**
 * The clickable battle control bar: a top row of four move buttons and a bottom
 * row of three party buttons plus a (placeholder) capture button. Built on the
 * reusable {@link createButton} component, so every control is pointer-driven
 * (mouse + touch) and the caller wires hotkeys to the same callbacks.
 */
export function createBattleControls(callbacks: BattleControlsCallbacks): BattleControlsView {
  const container = new Container();

  const moveButtons: MoveButton[] = [];
  for (let index = 0; index < 4; index += 1) {
    const button = createButton({
      width: MOVE_BTN_W,
      height: MOVE_BTN_H,
      onTap: () => callbacks.onMove(index)
    });
    button.container.x = INNER_LEFT + index * (MOVE_BTN_W + MOVE_GAP);
    button.container.y = MOVE_ROW_Y;

    const name = new Text({ text: "", style: styles.moveName });
    name.x = 16;
    name.y = 8;
    const hotkey = new Text({ text: MOVE_HOTKEYS[index], style: styles.hotkey });
    hotkey.anchor.set(1, 0);
    hotkey.x = MOVE_BTN_W - 12;
    hotkey.y = 7;
    const pill = new Graphics();
    const pillLabel = new Text({ text: "", style: styles.typeLabel });
    pillLabel.x = 22;
    pillLabel.y = 31;
    const categoryIcon = new Graphics();
    button.content.addChild(pill, name, hotkey, pillLabel, categoryIcon);

    container.addChild(button.container);
    moveButtons.push({ button, name, hotkey, pill, pillLabel, categoryIcon, appliedKey: "" });
  }

  const pokeButtons: PokeButton[] = [];
  for (let index = 0; index < 3; index += 1) {
    const button = createButton({
      width: POKE_BTN_W,
      height: POKE_BTN_H,
      accent: PALETTE.gold,
      onTap: () => callbacks.onSwitch(index)
    });
    button.container.x = INNER_LEFT + index * (POKE_BTN_W + POKE_GAP);
    button.container.y = POKE_ROW_Y;

    const name = new Text({ text: "", style: styles.pokeName });
    name.x = 14;
    name.y = 5;
    const hotkey = new Text({ text: SWITCH_HOTKEYS[index], style: styles.hotkey });
    hotkey.anchor.set(1, 0);
    hotkey.x = POKE_BTN_W - 12;
    hotkey.y = 6;
    const hpTrack = new Graphics();
    hpTrack.roundRect(14, 24, 150, 6, 3).fill(PALETTE.hpTrack);
    const hpFill = new Graphics();
    const hpText = new Text({ text: "", style: styles.pokeHp });
    hpText.x = 170;
    hpText.y = 21;
    const tag = new Text({ text: "", style: styles.pokeTag });
    tag.anchor.set(1, 0);
    tag.x = POKE_BTN_W - 12;
    tag.y = 21;
    button.content.addChild(hpTrack, hpFill, name, hotkey, hpText, tag);

    container.addChild(button.container);
    pokeButtons.push({ button, name, hotkey, hpTrack, hpFill, hpText, tag, appliedKey: "" });
  }

  // Capture (Poké Ball) button — present as a placeholder; capture is not yet
  // implemented, so tapping it just surfaces a message via the callback.
  const captureButton = createButton({
    width: CAPTURE_BTN_W,
    height: POKE_BTN_H,
    faceTop: "#b8444a",
    faceBottom: "#7d2a30",
    accent: "#f2f2f2",
    onTap: () => callbacks.onCapture()
  });
  captureButton.container.x = INNER_LEFT + 3 * (POKE_BTN_W + POKE_GAP);
  captureButton.container.y = POKE_ROW_Y;
  drawPokeball(captureButton.content, 26, POKE_BTN_H / 2, 11);
  const captureLabel = new Text({ text: "捕捉", style: styles.capture });
  captureLabel.anchor.set(0, 0.5);
  captureLabel.x = 44;
  captureLabel.y = POKE_BTN_H / 2;
  captureButton.content.addChild(captureLabel);
  container.addChild(captureButton.container);

  // Shown only in the post-faint replacement mode, in place of the move row.
  const prompt = new Text({ text: "倒下了！选择下一只出战精灵", style: styles.prompt });
  prompt.anchor.set(0.5, 0.5);
  prompt.x = INNER_LEFT + (4 * MOVE_BTN_W + 3 * MOVE_GAP) / 2;
  prompt.y = MOVE_ROW_Y + MOVE_BTN_H / 2;
  prompt.visible = false;
  container.addChild(prompt);

  function update(view: BattleStateView, getHp: (instanceId: string, fallback: number) => number, forceSwitch = false): void {
    updateMoveButtons(moveButtons, view, forceSwitch);
    updatePokeButtons(pokeButtons, view, getHp);
    captureButton.setEnabled(!forceSwitch);
    prompt.visible = forceSwitch;
  }

  return { container, update };
}

function updateMoveButtons(buttons: MoveButton[], view: BattleStateView, forceSwitch: boolean): void {
  const moves = view.player.active.moves;
  for (let index = 0; index < buttons.length; index += 1) {
    const entry = buttons[index];
    const moveId = moves[index];
    const exists = moveId !== undefined;
    // In replacement mode the move row is replaced by the pick prompt.
    entry.button.container.visible = exists && !forceSwitch;
    entry.button.setEnabled(exists && !forceSwitch);
    if (!exists) {
      entry.appliedKey = "";
      continue;
    }

    if (entry.appliedKey === moveId) {
      continue;
    }
    entry.appliedKey = moveId;

    const meta = moveMeta(moveId);
    const accent = typeColor(meta.type);
    entry.button.setStyle({
      accent,
      faceTop: adjustColor(accent, -0.5),
      faceBottom: adjustColor(accent, -0.68)
    });
    entry.name.text = MOVES[moveId].name;

    // Type pill sized to its label.
    const label = typeLabel(meta.type);
    entry.pillLabel.text = label;
    const pillWidth = entry.pillLabel.width + 12;
    entry.pill.clear();
    entry.pill.roundRect(16, 29, pillWidth, 16, 4).fill(accent);
    entry.pill.roundRect(16, 29, pillWidth, 16, 4).stroke({ color: "#1c1622", width: 1, alpha: 0.5 });

    // Category glyph after the pill.
    const catX = 16 + pillWidth + 14;
    drawCategoryIcon(entry.categoryIcon, meta.category, catX, 37, 6);
  }
}

function updatePokeButtons(
  buttons: PokeButton[],
  view: BattleStateView,
  getHp: (instanceId: string, fallback: number) => number
): void {
  for (let index = 0; index < buttons.length; index += 1) {
    const entry = buttons[index];
    const monster = view.player.roster[index];
    const exists = monster !== undefined;
    entry.button.container.visible = exists;
    if (!exists) {
      entry.appliedKey = "";
      continue;
    }

    const isActive = index === view.player.activeIndex;
    const fainted = monster.currentHp <= 0;
    const hp = getHp(monster.instanceId, monster.currentHp);
    entry.button.setEnabled(!isActive && !fainted);

    // Static-ish content keyed on what actually changed identity/state.
    const key = `${monster.instanceId}:${monster.level}:${isActive ? "a" : fainted ? "f" : "n"}`;
    if (entry.appliedKey !== key) {
      entry.appliedKey = key;
      entry.name.text = `${monster.name} Lv.${monster.level}`;
      entry.tag.text = isActive ? "出战" : fainted ? "倒下" : "";
      entry.button.setStyle(
        fainted
          ? { accent: "#6b6450", faceTop: "#3a3548", faceBottom: "#272336" }
          : isActive
            ? { accent: PALETTE.gold, faceTop: "#4a4566", faceBottom: "#332f4a" }
            : { accent: PALETTE.gold, faceTop: PALETTE.btnFaceTop, faceBottom: PALETTE.btnFaceBottom }
      );
    }

    // HP bar tweens every frame, so redraw it each update.
    const ratio = Math.max(0, Math.min(1, hp / monster.maxHp));
    const { hi, lo } = hpColors(ratio);
    const fillW = Math.max(0, 150 * ratio);
    entry.hpFill.clear();
    if (fillW > 0) {
      entry.hpFill.roundRect(14, 24, fillW, 6, 3).fill(lo);
      entry.hpFill.roundRect(14, 24, fillW, 3, 3).fill(hi);
    }
    entry.hpText.text = `${Math.max(0, hp)}/${monster.maxHp}`;
  }
}

function drawCategoryIcon(g: Graphics, category: string, cx: number, cy: number, r: number): void {
  const color = categoryColor(category);
  g.clear();
  if (category === "physical") {
    g.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]).fill(color);
    g.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]).stroke({ color: "#1c1622", width: 1, alpha: 0.5 });
  } else if (category === "special") {
    g.circle(cx, cy, r).stroke({ color, width: 2.5 });
    g.circle(cx, cy, r * 0.35).fill(color);
  } else {
    g.roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, 2).fill(color);
    g.roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, 2).stroke({ color: "#1c1622", width: 1, alpha: 0.5 });
  }
}

function drawPokeball(parent: Container, cx: number, cy: number, r: number): void {
  const ball = new Graphics();
  ball.circle(cx, cy, r).fill("#f2f2f2");
  ball.arc(cx, cy, r, Math.PI, Math.PI * 2).fill("#d63a3a");
  ball.rect(cx - r, cy - 1.5, r * 2, 3).fill("#1c1622");
  ball.circle(cx, cy, 3.2).fill("#f2f2f2");
  ball.circle(cx, cy, 3.2).stroke({ color: "#1c1622", width: 1.5 });
  ball.circle(cx, cy, r).stroke({ color: "#1c1622", width: 1.5 });
  parent.addChild(ball);
}
