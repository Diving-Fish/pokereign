import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "./screen";
import { adjustColor, hpColors, PALETTE, pixelText, typeColor } from "./theme";
import { createButton } from "./button";
import { getBattleSpriteUrl } from "../../game/data/art";
import { SPECIES } from "../../game/data/species";
import { computeStats, toCalcLevel } from "../../game/battle/smogonCalc";
import type { MonsterState } from "../../game/state/monster";

// Panel geometry (logical 960x540 space).
const PANEL_W = 620;
const PANEL_H = 492;
const PANEL_X = Math.round((GAME_WIDTH - PANEL_W) / 2);
const PANEL_Y = Math.round((GAME_HEIGHT - PANEL_H) / 2);

// One shared card shape for both the new catch and the bench members, sized so
// three sit in a row across the panel's inner width.
const CARD_W = 172;
const CARD_H = 132;
const CARD_GAP = 20;
const ROW_X = 32;
const ROW_Y = 272;

const HERO_X = Math.round((PANEL_W - CARD_W) / 2);
const HERO_Y = 96;

const styles = {
  title: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 24, fontWeight: "700", shadow: true })),
  subtitle: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 15, fontWeight: "700", wordWrapWidth: PANEL_W - 64 })),
  section: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 14, fontWeight: "700" })),
  ribbon: new TextStyle(pixelText({ fill: "#1c1622", fontSize: 12, fontWeight: "700" })),
  cardName: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 15, fontWeight: "700", shadow: true })),
  cardLevel: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 13, fontWeight: "700", shadow: true })),
  hpValue: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 11, fontWeight: "700" })),
  swapHint: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 16, fontWeight: "700", shadow: true })),
  release: new TextStyle(pixelText({ fill: PALETTE.btnInk, fontSize: 16, fontWeight: "700", shadow: true }))
};

export type CaptureReplaceCallbacks = {
  /** The player chose to swap out the roster member at `index` for the catch. */
  onReplace(index: number): void;
  /** The player let the newly caught monster go and kept the team intact. */
  onRelease(): void;
};

export type CaptureReplaceView = {
  /** Full-screen modal overlay; add to the UI layer above everything. */
  overlay: Container;
  /** Show the decision board for a freshly caught monster against the team. */
  open(caught: MonsterState, roster: MonsterState[]): void;
  close(): void;
  isOpen(): boolean;
};

type CardOptions = {
  /** New catch styling: gold border, catch glow, and a "新捕获" ribbon. */
  highlight?: boolean;
  /** Bench styling: tappable to swap this member out for the catch. */
  onTap?: () => void;
};

function applySpriteTexture(sprite: Sprite, url: string): void {
  void Assets.load(url)
    .then((texture: Texture) => {
      sprite.texture = texture;
    })
    .catch(() => undefined);
}

function maxHpOf(monster: MonsterState): number {
  return computeStats(monster.speciesId, toCalcLevel(monster.level), monster.ivs, monster.evs, monster.nature).maxHp;
}

export function createCaptureReplaceView(callbacks: CaptureReplaceCallbacks): CaptureReplaceView {
  const overlay = new Container();
  overlay.visible = false;

  // Heavier backdrop than the detail modal: this is a one-way roguelite decision.
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

  const title = new Text({ text: "队伍已满", style: styles.title });
  title.x = 32;
  title.y = 24;
  panel.addChild(title);

  const subtitle = new Text({ text: "", style: styles.subtitle });
  subtitle.x = 32;
  subtitle.y = 58;
  panel.addChild(subtitle);

  const sectionLabel = new Text({ text: "点击队员替换，或放生新同伴", style: styles.section });
  sectionLabel.x = 32;
  sectionLabel.y = 244;
  panel.addChild(sectionLabel);

  // Content rebuilt per open().
  const content = new Container();
  panel.addChild(content);

  const releaseButton = createButton({
    width: 220,
    height: 46,
    faceTop: "#5a3242",
    faceBottom: "#3d2030",
    accent: PALETTE.hpLow,
    onTap: () => callbacks.onRelease()
  });
  releaseButton.container.x = Math.round((PANEL_W - 220) / 2);
  releaseButton.container.y = 430;
  panel.addChild(releaseButton.container);

  const releaseLabel = new Text({ text: "", style: styles.release });
  releaseLabel.anchor.set(0.5);
  releaseLabel.x = 110;
  releaseLabel.y = 23;
  releaseButton.content.addChild(releaseLabel);

  let open = false;

  function rebuild(caught: MonsterState, roster: MonsterState[]): void {
    content.removeChildren().forEach((child) => child.destroy({ children: true }));

    const caughtName = SPECIES[caught.speciesId].name;
    subtitle.text = `捕捉到了 ${caughtName}！队伍已有三名同伴，要让谁腾出位置？`;
    releaseLabel.text = `放生 ${caughtName}`;

    // The new catch — same card, centered and lit.
    content.addChild(buildMonsterCard(HERO_X, HERO_Y, caught, { highlight: true }));

    // The bench — tap any member to swap it out for the catch.
    for (let i = 0; i < roster.length; i += 1) {
      const cardX = ROW_X + i * (CARD_W + CARD_GAP);
      content.addChild(buildMonsterCard(cardX, ROW_Y, roster[i], { onTap: () => callbacks.onReplace(i) }));
    }
  }

  return {
    overlay,
    open(caught: MonsterState, roster: MonsterState[]): void {
      rebuild(caught, roster);
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

/**
 * The single card used for both the new catch and the bench members, so they
 * share one layout: sprite on the left, name/level on the right, HP bar across
 * the bottom. `highlight` adds the catch glow + ribbon + gold border; `onTap`
 * makes it a swap target with a hover "替换" prompt.
 */
function buildMonsterCard(x: number, y: number, monster: MonsterState, opts: CardOptions): Container {
  const card = new Container();
  card.x = x;
  card.y = y;

  const species = SPECIES[monster.speciesId];
  const color = typeColor(species.types[0]);
  const fainted = monster.currentHp <= 0;

  // Catch glow: soft concentric gold halo behind the frame.
  if (opts.highlight) {
    const glow = new Graphics();
    for (let i = 4; i >= 1; i -= 1) {
      const pad = i * 6;
      glow.roundRect(-pad, -pad, CARD_W + pad * 2, CARD_H + pad * 2, 12 + pad).fill({ color: PALETTE.gold, alpha: 0.06 });
    }
    card.addChild(glow);
  }

  // Frame.
  const bg = new Graphics();
  bg.roundRect(0, 0, CARD_W, CARD_H, 10).fill(PALETTE.panelEdgeDark);
  bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 8).fill(adjustColor(color, -0.2));
  bg.roundRect(3, 3, CARD_W - 6, (CARD_H - 6) * 0.5, 8).fill({ color, alpha: 0.92 });
  bg.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 8).stroke({
    color: opts.highlight ? PALETTE.gold : adjustColor(color, 0.4),
    width: opts.highlight ? 2 : 1.5
  });
  card.addChild(bg);

  const sprite = new Sprite(Texture.EMPTY);
  applySpriteTexture(sprite, getBattleSpriteUrl(monster.speciesId, "front"));
  sprite.anchor.set(0.5, 0.5);
  sprite.x = 46;
  sprite.y = 54;
  sprite.scale.set(0.62);
  sprite.alpha = fainted ? 0.5 : 1;
  const mask = new Graphics();
  mask.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 8).fill(0xffffff);
  card.addChild(mask);
  sprite.mask = mask;
  card.addChild(sprite);

  const name = new Text({ text: species.name, style: styles.cardName });
  name.x = 86;
  name.y = 20;
  card.addChild(name);

  const level = new Text({ text: `Lv.${monster.level}`, style: styles.cardLevel });
  level.x = 86;
  level.y = 46;
  card.addChild(level);

  drawHpBar(card, 14, 108, CARD_W - 28, monster.currentHp, maxHpOf(monster));

  // New-catch ribbon, top-left, overhanging the frame.
  if (opts.highlight) {
    const ribbonText = new Text({ text: "新捕获", style: styles.ribbon });
    const ribbonW = ribbonText.width + 16;
    const ribbon = new Graphics();
    ribbon.roundRect(-6, -8, ribbonW, 20, 6).fill(PALETTE.gold);
    ribbon.roundRect(-6, -8, ribbonW, 20, 6).stroke({ color: adjustColor(PALETTE.gold, -0.35), width: 1 });
    card.addChild(ribbon);
    ribbonText.x = 2;
    ribbonText.y = -4;
    card.addChild(ribbonText);
  }

  // Swap interactivity (bench cards only).
  if (opts.onTap) {
    card.eventMode = "static";
    card.cursor = "pointer";

    const hoverBorder = new Graphics();
    card.addChild(hoverBorder);
    const hoverVeil = new Graphics();
    hoverVeil.roundRect(3, 3, CARD_W - 6, CARD_H - 6, 8).fill({ color: "#05040a", alpha: 0.5 });
    hoverVeil.visible = false;
    card.addChild(hoverVeil);
    const swap = new Text({ text: "替换", style: styles.swapHint });
    swap.anchor.set(0.5);
    swap.x = CARD_W / 2;
    swap.y = CARD_H / 2;
    swap.visible = false;
    card.addChild(swap);

    const setHover = (on: boolean) => {
      hoverBorder.clear();
      if (on) {
        hoverBorder.roundRect(2, 2, CARD_W - 4, CARD_H - 4, 9).stroke({ color: PALETTE.gold, width: 2.5 });
      }
      hoverVeil.visible = on;
      swap.visible = on;
    };

    card.on("pointerover", () => setHover(true));
    card.on("pointerout", () => setHover(false));
    card.on("pointertap", opts.onTap);
  }

  return card;
}

function drawHpBar(parent: Container, x: number, y: number, w: number, hp: number, maxHp: number): void {
  const current = Math.max(0, hp);
  const ratio = maxHp > 0 ? current / maxHp : 0;
  const { hi, lo } = hpColors(ratio);

  const value = new Text({ text: `${current}/${maxHp}`, style: styles.hpValue });
  value.anchor.set(1, 1);
  value.x = x + w;
  value.y = y - 1;
  parent.addChild(value);

  const barY = y + 2;
  const barH = 8;
  const track = new Graphics();
  track.roundRect(x, barY, w, barH, barH / 2).fill(PALETTE.hpTrack);
  track.roundRect(x, barY, w, barH, barH / 2).stroke({ color: PALETTE.panelEdgeDark, width: 1, alpha: 0.6 });
  parent.addChild(track);

  const fillW = Math.max(0, Math.min(1, ratio)) * w;
  if (fillW > 1) {
    const fill = new Graphics();
    fill.roundRect(x, barY, fillW, barH, barH / 2).fill(lo);
    fill.roundRect(x, barY, fillW, barH * 0.5, barH / 2).fill(hi);
    parent.addChild(fill);
  }
}
