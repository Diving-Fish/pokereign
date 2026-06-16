import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import "./styles.css";
import { drawBattleBackground } from "./client/render/battleBackground";
import { BATTLE_LAYOUT, getSpriteFootPosition } from "./client/render/battleLayout";
import { fitCanvasToWindow, GAME_HEIGHT, GAME_WIDTH } from "./client/render/screen";
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
  background: "#172017",
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

  drawBattleBackground(mapLayer);

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

  const commandBox = new Graphics();
  commandBox.roundRect(32, 414, GAME_WIDTH - 64, 106, 6);
  commandBox.fill("#f6f1dc");
  commandBox.stroke({ color: "#2b2b2b", width: 3 });
  mapLayer.addChild(commandBox);

  const divider = new Graphics();
  divider.moveTo(690, 420).lineTo(690, 514).stroke({ color: "#2b2b2b", width: 2 });
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

function drawMoveOptions(): void {
  if (!battleView) {
    return;
  }

  battleView.player.active.moves.forEach((moveId, index) => {
    const move = MOVES[moveId];
    const label = `${index === selectedMoveIndex ? "> " : "  "}${move.name}  ${move.type}/${move.category}`;
    const text = new Text({
      text: label,
      style: {
        fill: index === selectedMoveIndex ? "#2b4f9c" : "#222222",
        fontFamily: "monospace",
        fontSize: 18
      }
    });
    text.x = 64 + (index % 2) * 300;
    text.y = 438 + Math.floor(index / 2) * 34;
    mapLayer.addChild(text);
  });
}

function drawPokemonOptions(): void {
  if (!battleView) {
    return;
  }

  battleView.player.roster.forEach((monster, index) => {
    const current = index === battleView?.player.activeIndex ? " 出战中" : "";
    const fainted = monster.currentHp <= 0 ? " 倒下" : "";
    const hp = getDisplayedHp(monster.instanceId, monster.currentHp);
    const label = `${index === selectedPokemonIndex ? "> " : "  "}${monster.name} Lv.${monster.level} ${hp}/${monster.maxHp}${current}${fainted}`;
    const text = new Text({
      text: label,
      style: {
        fill: index === selectedPokemonIndex ? "#2b4f9c" : monster.currentHp <= 0 ? "#8b8177" : "#222222",
        fontFamily: "monospace",
        fontSize: 17
      }
    });
    text.x = 64;
    text.y = 430 + index * 28;
    mapLayer.addChild(text);
  });
}

function drawDialogText(textValue: string): void {
  const text = new Text({
    text: textValue,
    style: { fill: "#222222", fontFamily: "monospace", fontSize: 19, wordWrap: true, wordWrapWidth: 600 }
  });
  text.x = 64;
  text.y = 444;
  mapLayer.addChild(text);
}

function drawBattleMenu(): void {
  const options: Array<[BattleMenuMode, string]> = [
    ["fight", "战斗"],
    ["pokemon", "宝可梦"]
  ];

  options.forEach(([menuMode, label], index) => {
    const selected = battleMenuMode === menuMode;
    const text = new Text({
      text: `${selected ? "> " : "  "}${label}`,
      style: {
        fill: selected ? "#2b4f9c" : "#222222",
        fontFamily: "monospace",
        fontSize: 20,
        fontWeight: selected ? "700" : "400"
      }
    });
    text.x = 720;
    text.y = 438 + index * 34;
    mapLayer.addChild(text);
  });

  const hint = new Text({
    text: "Tab 切换  Enter 确定",
    style: { fill: "#5d554d", fontFamily: "monospace", fontSize: 13 }
  });
  hint.x = 720;
  hint.y = 492;
  mapLayer.addChild(hint);
}

function drawBattleSprite(speciesId: SpeciesId, facing: "front" | "back", side: BattleSide, x: number, y: number, scale: number): void {
  const offset = getSpriteAnimationOffset(side);
  const sprite = Sprite.from(getBattleSpriteUrl(speciesId, facing));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale);
  sprite.x = x + offset.x;
  sprite.y = y + offset.y;
  mapLayer.addChild(sprite);
}

function drawMonsterPanel(x: number, y: number, name: string, level: number, hp: number, maxHp: number, mirror: boolean): void {
  const width = 300;
  const height = 78;
  const shadow = new Graphics();
  shadow.roundRect(x + 5, y + 5, width, height, 10);
  shadow.fill({ color: "#ffffff", alpha: 0.85 });
  mapLayer.addChild(shadow);

  const body = new Graphics();
  body.roundRect(x, y, width, height, 10);
  body.fill("#2b2d2b");
  body.stroke({ color: "#f3f1df", width: 3 });
  mapLayer.addChild(body);

  const nameText = new Text({
    text: `${name}  Lv.${level}`,
    style: { fill: "#f8f6e6", fontFamily: "monospace", fontSize: 20, fontWeight: "700" }
  });
  nameText.x = x + 20;
  nameText.y = y + 12;
  mapLayer.addChild(nameText);

  const hpLabel = new Text({
    text: "HP",
    style: { fill: "#f8f6e6", fontFamily: "monospace", fontSize: 14, fontStyle: "italic", fontWeight: "700" }
  });
  hpLabel.x = x + 56;
  hpLabel.y = y + 43;
  mapLayer.addChild(hpLabel);

  const hpBack = new Graphics();
  hpBack.roundRect(x + 88, y + 44, 178, 10, 2);
  hpBack.fill("#111111");
  mapLayer.addChild(hpBack);

  const hpInset = new Graphics();
  hpInset.roundRect(x + 91, y + 46, 172, 6, 2);
  hpInset.fill("#3a3a36");
  mapLayer.addChild(hpInset);

  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const hpFill = new Graphics();
  hpFill.roundRect(x + 91, y + 46, 172 * hpRatio, 6, 2);
  hpFill.fill(hpRatio > 0.5 ? "#20d85a" : hpRatio > 0.25 ? "#e0c03b" : "#e84a3a");
  mapLayer.addChild(hpFill);

  const hpText = new Text({
    text: `${hp}/${maxHp}`,
    style: { fill: "#f8f6e6", fontFamily: "monospace", fontSize: 15, fontWeight: "700" }
  });
  hpText.x = mirror ? x + 186 : x + 202;
  hpText.y = y + 56;
  mapLayer.addChild(hpText);
}

function drawMoveAnimation(): void {
  if (!spriteAnimation) {
    return;
  }

  const progress = Math.min(1, spriteAnimation.elapsed / spriteAnimation.duration);
  const event = spriteAnimation.event;

  if (event.animation === "projectile") {
    const from = getBattleSpritePosition(event.userSide);
    const to = getBattleSpritePosition(event.targetSide);
    const orb = new Graphics();
    orb.circle(lerp(from.x, to.x, progress), lerp(from.y - 72, to.y - 72, progress), 9);
    orb.fill(getMoveColor(event.moveId));
    orb.stroke({ color: "#ffffff", width: 2, alpha: 0.7 });
    mapLayer.addChild(orb);
  }

  if (event.animation === "status") {
    const center = getBattleSpritePosition(event.userSide);
    const pulse = new Graphics();
    pulse.circle(center.x, center.y - 72, 24 + progress * 18);
    pulse.stroke({ color: getMoveColor(event.moveId), width: 3, alpha: 1 - progress });
    mapLayer.addChild(pulse);
  }
}

app.ticker.add((ticker) => {
  if (mode === "map") {
    updateMap(ticker.deltaMS);
    drawMap();
  } else {
    updateBattlePlayback(ticker.deltaMS);
    drawBattle();
  }
  uiLayer.removeChildren();
});

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

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}
