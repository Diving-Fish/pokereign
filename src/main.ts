import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import "./styles.css";
import { drawBattleBackground } from "./client/render/battleBackground";
import { BATTLE_LAYOUT, getSpriteFootPosition } from "./client/render/battleLayout";
import { fitCanvasToWindow, GAME_HEIGHT, GAME_WIDTH } from "./client/render/screen";
import { hpColors, PALETTE, pixelText } from "./client/render/theme";
import { BattleEngine } from "./game/battle/BattleEngine";
import { createTileTextures, type TileTextureMap } from "./client/render/tileTextures";
import { createMonster } from "./game/battle/createMonster";
import { getAllBattleSpriteUrls, getBattleSpriteUrl } from "./game/data/art";
import { MOVES, type MoveId } from "./game/data/moves";
import { SPECIES } from "./game/data/species";
import { PROTOTYPE_MAP } from "./game/map/prototypeMap";
import type { BattleCommand, BattleEvent, BattleMoveEvent, BattleOutcome, BattleSide, BattleStateView } from "./game/battle/types";
import type { SpeciesId } from "./game/data/species";
import type { MapEncounterObject, TileId } from "./game/map/types";
import { TILE_DEFINITIONS } from "./game/map/tiles";

type SceneMode = "map" | "battle";
type BattleMenuMode = "fight" | "pokemon";
type BattleSpriteAnimation = {
  event: BattleMoveEvent;
  elapsed: number;
  duration: number;
};
type HpTween = {
  targetId: string;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
};
type PlaybackStep =
  | { kind: "text"; text: string; duration: number; elapsed: number }
  | { kind: "move"; event: BattleMoveEvent; duration: number; elapsed: number }
  | { kind: "hp"; tween: HpTween };

const activeMap = PROTOTYPE_MAP;

const app = new Application();
await app.init({
  background: "#14121e",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  antialias: false
});

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) {
  throw new Error("Missing #app host element.");
}
host.appendChild(app.canvas);
fitCanvasToWindow(app.canvas);
window.addEventListener("resize", () => fitCanvasToWindow(app.canvas));

void Assets.load(getAllBattleSpriteUrls()).catch((error: unknown) => {
  console.warn("Failed to preload battle sprites.", error);
});

// Trigger the pixel font fetch now; canvas text picks it up once ready.
void document.fonts?.load('16px "Zpix"').catch(() => undefined);

const tileTextures: TileTextureMap = createTileTextures(app, activeMap.tileSize);

const root = new Container();
app.stage.addChild(root);

const mapLayer = new Container();
const uiLayer = new Container();
root.addChild(mapLayer, uiLayer);

const keys = new Set<string>();
let mode: SceneMode = "map";
let playerTile = { ...activeMap.spawn };
let battle: BattleEngine | null = null;
let battleView: BattleStateView | null = null;
let message = "方向键/WASD 移动，碰到明雷进入 1v1 战斗。";
let selectedMoveIndex = 0;
let selectedPokemonIndex = 0;
let battleMenuMode: BattleMenuMode = "fight";
let playbackSteps: PlaybackStep[] = [];
let currentPlaybackStep: PlaybackStep | null = null;
let spriteAnimation: BattleSpriteAnimation | null = null;
let hpTween: HpTween | null = null;
let pendingOutcome: BattleOutcome = "ongoing";
const displayedHp = new Map<string, number>();

// Global animation clock (seconds) for ambient motion: idle breathing,
// caret bob, background shimmer, and timed entrance transitions.
let elapsed = 0;
let battleIntroStart = 0;
let shakeUntil = 0;
let shakeMag = 0;

const playerRoster = [
  createMonster("charmander", 3),
  createMonster("bulbasaur", 3),
  createMonster("squirtle", 3)
];

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());

  if (mode === "battle") {
    handleBattleKey(event);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function tileAt(x: number, y: number): TileId {
  return activeMap.layers.ground[y]?.[x] ?? "wall";
}

function isBlocked(x: number, y: number): boolean {
  return TILE_DEFINITIONS[tileAt(x, y)].blocksMovement;
}

function drawMap(): void {
  mapLayer.removeChildren();

  const world = new Container();
  mapLayer.addChild(world);

  for (let y = 0; y < activeMap.height; y += 1) {
    for (let x = 0; x < activeMap.width; x += 1) {
      drawTile(world, tileAt(x, y), x, y);
    }
  }

  for (const encounter of activeMap.objects.filter((object) => object.kind === "encounter")) {
    const marker = new Graphics();
    marker.rect(encounter.x * activeMap.tileSize + 8, encounter.y * activeMap.tileSize + 8, 16, 16);
    marker.fill(encounter.boss ? "#b32f42" : "#f4c542");
    marker.stroke({ color: "#321a1a", width: 2 });
    world.addChild(marker);
  }

  const trainer = new Graphics();
  trainer.rect(playerTile.x * activeMap.tileSize + 8, playerTile.y * activeMap.tileSize + 4, 16, 24);
  trainer.fill("#3157a4");
  trainer.stroke({ color: "#f1e0b8", width: 2 });
  world.addChild(trainer);

  world.x = Math.floor(GAME_WIDTH / 2 - playerTile.x * activeMap.tileSize - activeMap.tileSize / 2);
  world.y = Math.floor(GAME_HEIGHT / 2 - playerTile.y * activeMap.tileSize - activeMap.tileSize / 2);
}

function drawTile(world: Container, tileId: TileId, x: number, y: number): void {
  const tileSize = activeMap.tileSize;
  const tile = new Sprite(tileTextures[tileId]);
  tile.x = x * tileSize;
  tile.y = y * tileSize;
  world.addChild(tile);
}

let moveCooldown = 0;

function updateMap(deltaMs: number): void {
  moveCooldown -= deltaMs;
  if (moveCooldown > 0) {
    return;
  }

  const dx = keys.has("arrowleft") || keys.has("a") ? -1 : keys.has("arrowright") || keys.has("d") ? 1 : 0;
  const dy = keys.has("arrowup") || keys.has("w") ? -1 : keys.has("arrowdown") || keys.has("s") ? 1 : 0;
  if (dx === 0 && dy === 0) {
    return;
  }

  const next = { x: playerTile.x + dx, y: playerTile.y + dy };
  if (!isBlocked(next.x, next.y)) {
    playerTile = next;
    moveCooldown = 140;

    const encounter = activeMap.objects.find((item) => item.kind === "encounter" && item.x === playerTile.x && item.y === playerTile.y);
    if (encounter) {
      startBattle(encounter);
    }
  }
}

function startBattle(encounter: MapEncounterObject): void {
  mode = "battle";
  selectedMoveIndex = 0;
  selectedPokemonIndex = 0;
  battleMenuMode = "fight";
  playbackSteps = [];
  currentPlaybackStep = null;
  spriteAnimation = null;
  hpTween = null;
  pendingOutcome = "ongoing";
  displayedHp.clear();
  battleIntroStart = elapsed;
  const foe = createMonster(encounter.speciesId, encounter.level, "foe");
  battle = new BattleEngine({
    playerRoster,
    opponentRoster: [foe]
  });
  battleView = battle.view();
  message = `${foe.name} 出现了！选择技能或按 Tab 换人。`;
}

function handleBattleKey(event: KeyboardEvent): void {
  if (!battle || !battleView) {
    return;
  }

  if (isPlaybackActive()) {
    return;
  }

  const key = event.key;
  const optionCount = battleMenuMode === "fight" ? battleView.player.active.moves.length : battleView.player.roster.length;

  if (key === "ArrowUp" || key.toLowerCase() === "w") {
    updateSelectedOption(Math.max(0, selectedOptionIndex() - 1), optionCount);
  }
  if (key === "ArrowDown" || key.toLowerCase() === "s") {
    updateSelectedOption(Math.min(optionCount - 1, selectedOptionIndex() + 1), optionCount);
  }
  if (key === "Tab") {
    battleMenuMode = battleMenuMode === "fight" ? "pokemon" : "fight";
    message = battleMenuMode === "fight" ? "要使用哪个招式？" : "要换上哪只宝可梦？";
    event.preventDefault();
  }
  if (key === "Enter" || key === " ") {
    if (battleMenuMode === "fight") {
      runBattleTurn({ type: "move", moveId: battleView.player.active.moves[selectedMoveIndex] });
    } else {
      runBattleTurn({ type: "switch", targetIndex: selectedPokemonIndex });
    }
  }
}

function runBattleTurn(command: BattleCommand): void {
  if (!battle || !battleView || isPlaybackActive()) {
    return;
  }

  captureDisplayedHp(battleView);
  const result = battle.runTurn(command);
  battleView = battle.view();
  queueBattlePlayback(result.events, result.outcome);
}

function selectedOptionIndex(): number {
  return battleMenuMode === "fight" ? selectedMoveIndex : selectedPokemonIndex;
}

function updateSelectedOption(index: number, optionCount: number): void {
  const nextIndex = Math.max(0, Math.min(optionCount - 1, index));
  if (battleMenuMode === "fight") {
    selectedMoveIndex = nextIndex;
  } else {
    selectedPokemonIndex = nextIndex;
  }
}

function isPlaybackActive(): boolean {
  return currentPlaybackStep !== null || playbackSteps.length > 0 || spriteAnimation !== null || hpTween !== null;
}

function captureDisplayedHp(view: BattleStateView): void {
  for (const monster of [...view.player.roster, ...view.opponent.roster]) {
    displayedHp.set(monster.instanceId, monster.currentHp);
  }
}

function queueBattlePlayback(events: BattleEvent[], outcome: BattleOutcome): void {
  pendingOutcome = outcome;
  playbackSteps = events.flatMap((event) => eventToPlaybackSteps(event));

  if (outcome === "player") {
    playbackSteps.push({ kind: "text", text: "战斗胜利！", duration: 700, elapsed: 0 });
  }

  if (outcome === "opponent") {
    playbackSteps.push({ kind: "text", text: "队伍全灭，原型中会回到地图继续测试。", duration: 900, elapsed: 0 });
  }
}

function eventToPlaybackSteps(event: BattleEvent): PlaybackStep[] {
  if (event.type === "move") {
    return [
      { kind: "text", text: `${event.userName} 使用了 ${event.moveName}！`, duration: 520, elapsed: 0 },
      { kind: "move", event, duration: 360, elapsed: 0 }
    ];
  }

  if (event.type === "damage") {
    const steps: PlaybackStep[] = [];
    const effectivenessText = getEffectivenessText(event.effectiveness);
    if (effectivenessText) {
      steps.push({ kind: "text", text: effectivenessText, duration: 560, elapsed: 0 });
    }
    steps.push({
      kind: "hp",
      tween: {
        targetId: event.targetId,
        from: event.hpBefore,
        to: event.hpAfter,
        elapsed: 0,
        duration: 520
      }
    });
    if (event.fainted) {
      steps.push({ kind: "text", text: `${event.targetName} 倒下了。`, duration: 620, elapsed: 0 });
    }
    return steps;
  }

  return [{ kind: "text", text: event.text, duration: 620, elapsed: 0 }];
}

function getEffectivenessText(effectiveness: number): string | null {
  if (effectiveness > 1) {
    return "效果绝佳！";
  }

  if (effectiveness > 0 && effectiveness < 1) {
    return "效果不好。";
  }

  if (effectiveness === 0) {
    return "没有效果。";
  }

  return null;
}

function updateBattlePlayback(deltaMs: number): void {
  if (!currentPlaybackStep && playbackSteps.length > 0) {
    startPlaybackStep(playbackSteps.shift()!);
  }

  if (!currentPlaybackStep) {
    finishBattlePlaybackIfNeeded();
    return;
  }

  if (currentPlaybackStep.kind === "text") {
    currentPlaybackStep.elapsed += deltaMs;
    if (currentPlaybackStep.elapsed >= currentPlaybackStep.duration) {
      currentPlaybackStep = null;
    }
    return;
  }

  if (currentPlaybackStep.kind === "move") {
    currentPlaybackStep.elapsed += deltaMs;
    if (spriteAnimation) {
      spriteAnimation.elapsed = currentPlaybackStep.elapsed;
    }
    if (currentPlaybackStep.elapsed >= currentPlaybackStep.duration) {
      spriteAnimation = null;
      currentPlaybackStep = null;
    }
    return;
  }

  hpTween = currentPlaybackStep.tween;
  hpTween.elapsed += deltaMs;
  const progress = Math.min(1, hpTween.elapsed / hpTween.duration);
  displayedHp.set(hpTween.targetId, Math.round(lerp(hpTween.from, hpTween.to, easeOutCubic(progress))));
  if (progress >= 1) {
    displayedHp.set(hpTween.targetId, hpTween.to);
    hpTween = null;
    currentPlaybackStep = null;
  }
}

function startPlaybackStep(step: PlaybackStep): void {
  currentPlaybackStep = step;
  if (step.kind === "text") {
    message = step.text;
  }
  if (step.kind === "move") {
    spriteAnimation = { event: step.event, elapsed: 0, duration: step.duration };
  }
  if (step.kind === "hp") {
    const lost = step.tween.from - step.tween.to;
    if (lost > 0) {
      const fraction = lost / Math.max(1, step.tween.from);
      triggerShake(0.22, 6 + fraction * 22);
    }
  }
}

function finishBattlePlaybackIfNeeded(): void {
  if (pendingOutcome === "ongoing") {
    return;
  }

  if (pendingOutcome === "player" || pendingOutcome === "opponent") {
    mode = "map";
    battle = null;
    battleView = null;
    displayedHp.clear();
    message = "方向键/WASD 移动，碰到明雷进入 1v1 战斗。";
    pendingOutcome = "ongoing";
  }
}

function drawBattle(): void {
  mapLayer.removeChildren();
  if (!battleView) {
    return;
  }

  drawBattleBackground(mapLayer, elapsed);

  const player = battleView.player.active;
  const foe = battleView.opponent.active;

  const playerSprite = getSpriteRenderTuning(player.speciesId, "back", "player");
  const foeSprite = getSpriteRenderTuning(foe.speciesId, "front", "foe");
  drawBattleSprite(player.speciesId, "back", "player", playerSprite.x, playerSprite.y, playerSprite.scale);
  drawBattleSprite(foe.speciesId, "front", "foe", foeSprite.x, foeSprite.y, foeSprite.scale);
  drawMoveAnimation();

  drawMonsterPanel(BATTLE_LAYOUT.foe.panel.x, BATTLE_LAYOUT.foe.panel.y, foe.name, foe.level, getDisplayedHp(foe.instanceId, foe.currentHp), foe.maxHp, false);
  drawMonsterPanel(BATTLE_LAYOUT.player.panel.x, BATTLE_LAYOUT.player.panel.y, player.name, player.level, getDisplayedHp(player.instanceId, player.currentHp), player.maxHp, true);
  drawBattleDialog();
}

function drawBattleDialog(): void {
  if (!battleView) {
    return;
  }

  drawFramedBox(32, 414, GAME_WIDTH - 64, 110);

  const divider = new Graphics();
  divider.moveTo(688, 424).lineTo(688, 514).stroke({ color: PALETTE.boxEdge, width: 2, alpha: 0.6 });
  divider.moveTo(690, 424).lineTo(690, 514).stroke({ color: PALETTE.gold, width: 1, alpha: 0.7 });
  mapLayer.addChild(divider);

  if (isPlaybackActive()) {
    drawDialogText(message);
  } else if (battleMenuMode === "fight") {
    drawMoveOptions();
  } else {
    drawPokemonOptions();
  }

  drawBattleMenu();
}

// Reusable parchment box: dark frame, warm face, gold inner rule, top sheen.
function drawFramedBox(x: number, y: number, width: number, height: number): void {
  const frame = new Graphics();
  frame.roundRect(x, y, width, height, 9).fill(PALETTE.boxEdge);
  mapLayer.addChild(frame);

  const face = new Graphics();
  face.roundRect(x + 4, y + 4, width - 8, height - 8, 7).fill(PALETTE.boxFace);
  face.roundRect(x + 4, y + height - 22, width - 8, 18, 7).fill(PALETTE.boxFaceLow);
  face.roundRect(x + 4, y + 4, width - 8, height - 8, 7).stroke({ color: PALETTE.gold, width: 1.5, alpha: 0.7 });
  mapLayer.addChild(face);

  const sheen = new Graphics();
  sheen.roundRect(x + 7, y + 6, width - 14, 4, 3).fill({ color: "#ffffff", alpha: 0.4 });
  mapLayer.addChild(sheen);
}

// Right-pointing caret that bobs to mark the active selection.
function drawCaret(x: number, y: number): void {
  const bob = Math.sin(elapsed * 7) * 2.5 + 2.5;
  const caret = new Graphics();
  caret.moveTo(x + bob, y).lineTo(x + bob + 9, y + 5).lineTo(x + bob, y + 10).fill(PALETTE.select);
  caret.stroke({ color: PALETTE.selectGlow, width: 1, alpha: 0.8 });
  mapLayer.addChild(caret);
}

function drawMoveOptions(): void {
  if (!battleView) {
    return;
  }

  battleView.player.active.moves.forEach((moveId, index) => {
    const move = MOVES[moveId];
    const selected = index === selectedMoveIndex;
    const col = index % 2;
    const rowX = 64 + col * 308;
    const rowY = 438 + Math.floor(index / 2) * 36;

    if (selected) {
      drawCaret(rowX - 18, rowY + 6);
    }

    const name = new Text({
      text: move.name,
      style: pixelText({ fill: selected ? PALETTE.select : PALETTE.boxInk, fontSize: 19, fontWeight: selected ? "700" : "400" })
    });
    name.x = rowX;
    name.y = rowY;
    mapLayer.addChild(name);

    const meta = new Text({
      text: `${move.type}·${move.category}`,
      style: pixelText({ fill: PALETTE.boxInkSoft, fontSize: 12 })
    });
    meta.x = rowX + 150;
    meta.y = rowY + 5;
    mapLayer.addChild(meta);
  });
}

function drawPokemonOptions(): void {
  if (!battleView) {
    return;
  }

  battleView.player.roster.forEach((monster, index) => {
    const selected = index === selectedPokemonIndex;
    const isActive = index === battleView?.player.activeIndex;
    const fainted = monster.currentHp <= 0;
    const hp = getDisplayedHp(monster.instanceId, monster.currentHp);
    const rowY = 430 + index * 28;

    if (selected) {
      drawCaret(46, rowY + 6);
    }

    const fill = fainted ? "#a89a6e" : selected ? PALETTE.select : PALETTE.boxInk;
    const tag = isActive ? "  ◆出战" : fainted ? "  ✕倒下" : "";
    const label = new Text({
      text: `${monster.name}  Lv.${monster.level}  ${hp}/${monster.maxHp}${tag}`,
      style: pixelText({ fill, fontSize: 17, fontWeight: selected ? "700" : "400" })
    });
    label.x = 64;
    label.y = rowY;
    mapLayer.addChild(label);
  });
}

function drawDialogText(textValue: string): void {
  const text = new Text({
    text: textValue,
    style: pixelText({ fill: PALETTE.boxInk, fontSize: 19, wordWrapWidth: 600 })
  });
  text.x = 64;
  text.y = 448;
  mapLayer.addChild(text);
}

function drawBattleMenu(): void {
  const options: Array<[BattleMenuMode, string]> = [
    ["fight", "战斗"],
    ["pokemon", "宝可梦"]
  ];

  options.forEach(([menuMode, label], index) => {
    const selected = battleMenuMode === menuMode;
    const rowY = 438 + index * 34;

    if (selected) {
      drawCaret(704, rowY + 7);
    }

    const text = new Text({
      text: label,
      style: pixelText({ fill: selected ? PALETTE.select : PALETTE.boxInk, fontSize: 20, fontWeight: selected ? "700" : "400" })
    });
    text.x = 724;
    text.y = rowY;
    mapLayer.addChild(text);
  });

  const hint = new Text({
    text: "Tab 切换 · Enter 确定",
    style: pixelText({ fill: PALETTE.boxInkSoft, fontSize: 12 })
  });
  hint.x = 704;
  hint.y = 494;
  mapLayer.addChild(hint);
}

function drawBattleSprite(speciesId: SpeciesId, facing: "front" | "back", side: BattleSide, x: number, y: number, scale: number): void {
  const offset = getSpriteAnimationOffset(side);

  // Entrance: slide in toward the platform and fade up.
  const intro = easeOutCubic(clamp01((elapsed - battleIntroStart) / 0.5));
  const introSlide = (1 - intro) * (side === "player" ? -90 : 90);

  // Idle breathing: gentle vertical bob, out of phase per side.
  const phase = side === "player" ? 0 : Math.PI;
  const bob = Math.sin(elapsed * 2.2 + phase) * 2.2;

  // Cast shadow on the platform.
  const shadow = new Graphics();
  const shadowW = 64 * (scale / 2.7);
  shadow.ellipse(x + offset.x + introSlide, y + 6, shadowW, shadowW * 0.32).fill({ color: "#243018", alpha: 0.32 * intro });
  mapLayer.addChild(shadow);

  const sprite = Sprite.from(getBattleSpriteUrl(speciesId, facing));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale);
  sprite.x = x + offset.x + introSlide;
  sprite.y = y + offset.y + bob;
  sprite.alpha = intro;
  mapLayer.addChild(sprite);
}

function drawMonsterPanel(x: number, y: number, name: string, level: number, hp: number, maxHp: number, mirror: boolean): void {
  const width = 300;
  const height = 80;

  const panel = new Container();
  mapLayer.addChild(panel);

  // Entrance: foe panel slides in from the left, player from the right.
  const intro = easeOutCubic(clamp01((elapsed - battleIntroStart) / 0.45));
  panel.x = x + (1 - intro) * (mirror ? 140 : -140);
  panel.y = y;
  panel.alpha = intro;

  // Grounded drop shadow.
  const shadow = new Graphics();
  shadow.roundRect(6, 8, width, height, 12).fill({ color: "#0a0911", alpha: 0.4 });
  panel.addChild(shadow);

  // Dark outer edge then lighter glass face (a cheap bevel).
  const edge = new Graphics();
  edge.roundRect(0, 0, width, height, 12).fill(PALETTE.panelEdgeDark);
  panel.addChild(edge);

  const face = new Graphics();
  face.roundRect(2, 2, width - 4, height - 5, 11).fill(PALETTE.panelFace);
  face.roundRect(2, 2, width - 4, height - 5, 11).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
  panel.addChild(face);

  // Top highlight strip + a gold accent rule under the name.
  const sheen = new Graphics();
  sheen.roundRect(6, 5, width - 12, 3, 2).fill({ color: "#ffffff", alpha: 0.14 });
  sheen.rect(18, 34, width - 36, 1).fill({ color: PALETTE.gold, alpha: 0.55 });
  panel.addChild(sheen);

  const nameText = new Text({
    text: name,
    style: pixelText({ fill: PALETTE.ink, fontSize: 20, fontWeight: "700", shadow: true })
  });
  nameText.x = 18;
  nameText.y = 11;
  panel.addChild(nameText);

  const levelText = new Text({
    text: `Lv.${level}`,
    style: pixelText({ fill: PALETTE.gold, fontSize: 16, fontWeight: "700", shadow: true })
  });
  levelText.x = width - 18 - levelText.width;
  levelText.y = 13;
  panel.addChild(levelText);

  const hpLabel = new Text({
    text: "HP",
    style: pixelText({ fill: PALETTE.gold, fontSize: 13, fontWeight: "700" })
  });
  hpLabel.x = 18;
  hpLabel.y = 50;
  panel.addChild(hpLabel);

  drawHpBar(panel, 52, 49, 196, 11, hp, maxHp);

  const hpText = new Text({
    text: `${Math.max(0, hp)}/${maxHp}`,
    style: pixelText({ fill: PALETTE.inkSoft, fontSize: 14, fontWeight: "700" })
  });
  hpText.x = width - 18 - hpText.width;
  hpText.y = 49;
  panel.addChild(hpText);
}

function drawHpBar(parent: Container, x: number, y: number, width: number, height: number, hp: number, maxHp: number): void {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const { hi, lo } = hpColors(ratio);

  // Inset track.
  const track = new Graphics();
  track.roundRect(x, y, width, height, height / 2).fill(PALETTE.hpTrack);
  track.roundRect(x, y, width, height, height / 2).stroke({ color: "#000000", width: 1, alpha: 0.6 });
  parent.addChild(track);

  const fillW = Math.max(0, (width - 4) * ratio);
  if (fillW > 0) {
    const fill = new Graphics();
    const innerH = height - 4;
    // Two-tone vertical gradient: bright top half, darker bottom half.
    fill.roundRect(x + 2, y + 2, fillW, innerH, innerH / 2).fill(lo);
    fill.roundRect(x + 2, y + 2, fillW, innerH * 0.55, innerH / 2).fill(hi);
    // Glossy top line.
    fill.rect(x + 3, y + 3, Math.max(0, fillW - 2), 1).fill({ color: "#ffffff", alpha: 0.5 });
    parent.addChild(fill);
  }

  // Segment ticks for the classic handheld bar read.
  const ticks = new Graphics();
  for (let i = 1; i < 8; i += 1) {
    const tx = x + (width / 8) * i;
    ticks.rect(tx, y + 1, 1, height - 2).fill({ color: "#000000", alpha: 0.28 });
  }
  parent.addChild(ticks);
}

function drawMoveAnimation(): void {
  if (!spriteAnimation) {
    return;
  }

  const progress = Math.min(1, spriteAnimation.elapsed / spriteAnimation.duration);
  const event = spriteAnimation.event;
  const color = getMoveColor(event.moveId);

  if (event.animation === "projectile") {
    const from = getBattleSpritePosition(event.userSide);
    const to = getBattleSpritePosition(event.targetSide);
    const px = lerp(from.x, to.x, progress);
    const py = lerp(from.y - 72, to.y - 72, progress);

    // Fading trail behind the orb.
    const trail = new Graphics();
    for (let i = 1; i <= 5; i += 1) {
      const tp = Math.max(0, progress - i * 0.06);
      trail.circle(lerp(from.x, to.x, tp), lerp(from.y - 72, to.y - 72, tp), 9 - i).fill({ color, alpha: 0.12 * (5 - i) });
    }
    mapLayer.addChild(trail);

    const orb = new Graphics();
    orb.circle(px, py, 13).fill({ color, alpha: 0.35 });
    orb.circle(px, py, 8).fill(color);
    orb.circle(px - 2, py - 2, 3).fill({ color: "#ffffff", alpha: 0.85 });
    mapLayer.addChild(orb);

    // Impact burst as it lands.
    if (progress > 0.82) {
      const burst = (progress - 0.82) / 0.18;
      const flash = new Graphics();
      flash.circle(to.x, to.y - 72, 6 + burst * 26).stroke({ color, width: 3, alpha: 1 - burst });
      mapLayer.addChild(flash);
    }
  }

  if (event.animation === "contact") {
    // White impact flash on the target at the apex of the lunge.
    const apex = Math.sin(progress * Math.PI);
    if (apex > 0.4) {
      const to = getBattleSpritePosition(event.targetSide);
      const flash = new Graphics();
      flash.circle(to.x, to.y - 72, 18 + apex * 14).fill({ color: "#ffffff", alpha: 0.28 * apex });
      flash.circle(to.x, to.y - 72, 28 + apex * 18).stroke({ color, width: 3, alpha: 0.5 * apex });
      mapLayer.addChild(flash);
    }
  }

  if (event.animation === "status") {
    const center = getBattleSpritePosition(event.userSide);
    const pulse = new Graphics();
    pulse.circle(center.x, center.y - 72, 24 + progress * 22).stroke({ color, width: 3, alpha: 1 - progress });
    pulse.circle(center.x, center.y - 72, 14 + progress * 30).stroke({ color, width: 2, alpha: 0.6 * (1 - progress) });
    mapLayer.addChild(pulse);
  }
}

app.ticker.add((ticker) => {
  elapsed += ticker.deltaMS / 1000;

  if (mode === "map") {
    mapLayer.position.set(0, 0);
    updateMap(ticker.deltaMS);
    drawMap();
  } else {
    applyScreenShake();
    updateBattlePlayback(ticker.deltaMS);
    drawBattle();
  }
  uiLayer.removeChildren();
});

function applyScreenShake(): void {
  if (elapsed < shakeUntil) {
    const energy = (shakeUntil - elapsed) * shakeMag;
    mapLayer.position.set((Math.random() - 0.5) * energy, (Math.random() - 0.5) * energy);
  } else {
    mapLayer.position.set(0, 0);
  }
}

function triggerShake(durationSec: number, magnitude: number): void {
  shakeUntil = elapsed + durationSec;
  shakeMag = magnitude;
}

function getBattleSpritePosition(side: BattleSide): { x: number; y: number } {
  if (!battleView) {
    return side === "player" ? getSpriteFootPosition("player") : getSpriteFootPosition("foe");
  }

  const monster = side === "player" ? battleView.player.active : battleView.opponent.active;
  return getSpriteRenderTuning(monster.speciesId, side === "player" ? "back" : "front", side).position;
}

function getSpriteRenderTuning(
  speciesId: SpeciesId,
  facing: "front" | "back",
  side: BattleSide
): { x: number; y: number; scale: number; position: { x: number; y: number } } {
  const layoutSide = side === "player" ? "player" : "foe";
  const base = BATTLE_LAYOUT[layoutSide];
  const tuning = SPECIES[speciesId].spriteAnchors?.[facing];
  const position = getSpriteFootPosition(layoutSide, tuning?.footOffset);
  return {
    ...position,
    scale: tuning?.scale ?? base.sprite.scale,
    position
  };
}

function getSpriteAnimationOffset(side: BattleSide): { x: number; y: number } {
  if (!spriteAnimation || spriteAnimation.event.userSide !== side || spriteAnimation.event.animation !== "contact") {
    return { x: 0, y: 0 };
  }

  const progress = Math.min(1, spriteAnimation.elapsed / spriteAnimation.duration);
  const target = side === "player" ? { x: 52, y: -42 } : { x: -52, y: 42 };
  const amount = Math.sin(progress * Math.PI);
  return { x: target.x * amount, y: target.y * amount };
}

function getDisplayedHp(instanceId: string, fallbackHp: number): number {
  return displayedHp.get(instanceId) ?? fallbackHp;
}

function getMoveColor(moveId: MoveId): string {
  const move = MOVES[moveId];
  if (move.type === "fire") {
    return "#f16b3f";
  }
  if (move.type === "water") {
    return "#4f9fe8";
  }
  if (move.type === "grass") {
    return "#69b95b";
  }
  if (move.type === "ground" || move.type === "rock") {
    return "#b08a55";
  }
  return "#d8d8d8";
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}
