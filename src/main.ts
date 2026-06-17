import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import "./styles.css";
import { createBattleBackgroundView, updateBattleBackgroundView, type BattleBackgroundView } from "./client/render/battleBackground";
import { BATTLE_LAYOUT, getSpriteFootPosition } from "./client/render/battleLayout";
import { createMapRenderView, removeEncounterMarker, updateMapRenderView } from "./client/render/mapView";
import { fitCanvasToWindow, GAME_HEIGHT, GAME_WIDTH } from "./client/render/screen";
import { hpColors, PALETTE, pixelText } from "./client/render/theme";
import { createTileTextures, type TileTextureMap } from "./client/render/tileTextures";
import { BattleEngine } from "./game/battle/BattleEngine";
import { moveMeta } from "./game/battle/smogonCalc";
import type { BattleCommand, BattleEvent, BattleMonster, BattleMoveEvent, BattleOutcome, BattleSide, BattleStateView } from "./game/battle/types";
import { applyLevelUps, createMonsterState, syncMonsterStateFromBattle, toBattleMonster, xpRewardForDefeating } from "./game/state/monster";
import { createRunState, isEncounterCleared, markEncounterCleared } from "./game/state/runState";
import { getAllBattleSpriteUrls, getBattleSpriteUrl } from "./game/data/art";
import { MOVES, type MoveId } from "./game/data/moves";
import { SPECIES, type SpeciesId } from "./game/data/species";
import { PROTOTYPE_MAP } from "./game/map/prototypeMap";
import { TILE_DEFINITIONS } from "./game/map/tiles";
import type { MapEncounterObject, TileId } from "./game/map/types";

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
type HpBarView = {
  fill: Graphics;
};
type MonsterPanelView = {
  container: Container;
  nameText: Text;
  levelText: Text;
  hpText: Text;
  hpBar: HpBarView;
};
type BattleDialogView = {
  container: Container;
  messageText: Text;
  moveTexts: Text[];
  moveMetaTexts: Text[];
  pokemonTexts: Text[];
  menuTexts: Record<BattleMenuMode, Text>;
  optionCaret: Graphics;
  menuCaret: Graphics;
};
type BattleRenderView = {
  container: Container;
  background: BattleBackgroundView;
  playerShadow: Graphics;
  foeShadow: Graphics;
  playerSprite: Sprite;
  foeSprite: Sprite;
  projectileTrail: Graphics;
  projectileOrb: Graphics;
  projectileBurst: Graphics;
  contactFlash: Graphics;
  statusPulse: Graphics;
  playerPanel: MonsterPanelView;
  foePanel: MonsterPanelView;
  dialog: BattleDialogView;
};

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
void document.fonts?.load('16px "Zpix"').catch(() => undefined);

const tileTextures: TileTextureMap = createTileTextures(app, activeMap.tileSize);
// Shared TextStyle *instances* (not plain objects): Text keeps the instance it
// is given, so `setTextStyle`'s reference check actually short-circuits and we
// avoid re-rasterizing labels every frame when their style is unchanged.
const textStyles = {
  move: new TextStyle(pixelText({ fill: PALETTE.boxInk, fontSize: 19, fontWeight: "400" })),
  moveSelected: new TextStyle(pixelText({ fill: PALETTE.select, fontSize: 19, fontWeight: "700" })),
  moveMeta: new TextStyle(pixelText({ fill: PALETTE.boxInkSoft, fontSize: 12 })),
  pokemon: new TextStyle(pixelText({ fill: PALETTE.boxInk, fontSize: 17, fontWeight: "400" })),
  pokemonSelected: new TextStyle(pixelText({ fill: PALETTE.select, fontSize: 17, fontWeight: "700" })),
  pokemonFainted: new TextStyle(pixelText({ fill: "#a89a6e", fontSize: 17, fontWeight: "400" })),
  message: new TextStyle(pixelText({ fill: PALETTE.boxInk, fontSize: 19, wordWrapWidth: 600 })),
  menu: new TextStyle(pixelText({ fill: PALETTE.boxInk, fontSize: 20, fontWeight: "400" })),
  menuSelected: new TextStyle(pixelText({ fill: PALETTE.select, fontSize: 20, fontWeight: "700" })),
  hint: new TextStyle(pixelText({ fill: PALETTE.boxInkSoft, fontSize: 12 })),
  panelName: new TextStyle(pixelText({ fill: PALETTE.ink, fontSize: 20, fontWeight: "700", shadow: true })),
  panelLevel: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 16, fontWeight: "700", shadow: true })),
  panelHpLabel: new TextStyle(pixelText({ fill: PALETTE.gold, fontSize: 13, fontWeight: "700" })),
  panelHp: new TextStyle(pixelText({ fill: PALETTE.inkSoft, fontSize: 14, fontWeight: "700" }))
};

// The run snapshot is the source of truth the server will own: player team,
// position, cleared encounters and seed all live here. `playerRoster` is just a
// convenience alias onto the team so the rest of the file is unchanged.
const runState = createRunState({
  mapId: activeMap.id,
  spawn: activeMap.spawn,
  team: [createMonsterState("charmander", 3), createMonsterState("bulbasaur", 3), createMonsterState("squirtle", 3)]
});
const playerRoster = runState.player.team;

const root = new Container();
const sceneLayer = new Container();
app.stage.addChild(root);
root.addChild(sceneLayer);

const mapRender = createMapRenderView(activeMap, tileTextures, app.renderer.events, new Set(runState.clearedEncounterIds));
const battleRender = createBattleRenderView();
battleRender.container.visible = false;
sceneLayer.addChild(mapRender.container, battleRender.container);

// 4 tiles/sec → 250 ms per tile. Movement is grid-locked: one tile per step,
// no diagonals, with the on-screen position interpolated across the step so the
// player and camera glide instead of snapping.
const STEP_DURATION_MS = 250;

const keys = new Set<string>();
let mode: SceneMode = "map";
let playerTile = { ...runState.player.position };
let stepFrom = { ...runState.player.position };
const renderPos = { x: runState.player.position.x, y: runState.player.position.y };
let stepElapsed = 0;
let stepping = false;
let battle: BattleEngine | null = null;
let battleView: BattleStateView | null = null;
// Which map encounter triggered the current battle, so a win can clear it.
let activeEncounterId: string | null = null;
// The defeated foe's in-game level, used to compute the XP reward on victory.
let activeFoeLevel = 0;
// Battle- materialized copy of `playerRoster`; index-aligned to it so final HP
// and status can be written back to the persistent state when the battle ends.
let battleTeam: BattleMonster[] | null = null;
let message = "方向键/WASD 移动，踩到标记进入 1v1 战斗。";
let selectedMoveIndex = 0;
let selectedPokemonIndex = 0;
let battleMenuMode: BattleMenuMode = "fight";
let playbackSteps: PlaybackStep[] = [];
let currentPlaybackStep: PlaybackStep | null = null;
let spriteAnimation: BattleSpriteAnimation | null = null;
let hpTween: HpTween | null = null;
let pendingOutcome: BattleOutcome = "ongoing";
const displayedHp = new Map<string, number>();

let elapsed = 0;
let battleIntroStart = 0;
let shakeUntil = 0;
let shakeMag = 0;

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

/** One axis at a time (no diagonals); horizontal wins when both are held. */
function readMoveDir(): { x: number; y: number } | null {
  if (keys.has("arrowleft") || keys.has("a")) {
    return { x: -1, y: 0 };
  }
  if (keys.has("arrowright") || keys.has("d")) {
    return { x: 1, y: 0 };
  }
  if (keys.has("arrowup") || keys.has("w")) {
    return { x: 0, y: -1 };
  }
  if (keys.has("arrowdown") || keys.has("s")) {
    return { x: 0, y: 1 };
  }
  return null;
}

function updateMap(deltaMs: number): void {
  // Consume the frame's time across one or more tile steps so holding a key
  // walks at a steady 2.5 tiles/sec with no per-tile micro-pause.
  let remaining = deltaMs;

  while (remaining > 0) {
    if (!stepping) {
      const dir = readMoveDir();
      if (!dir) {
        return;
      }
      const next = { x: playerTile.x + dir.x, y: playerTile.y + dir.y };
      if (isBlocked(next.x, next.y)) {
        return;
      }
      stepFrom = { ...playerTile };
      playerTile = next;
      stepElapsed = 0;
      stepping = true;
    }

    const consumed = Math.min(remaining, STEP_DURATION_MS - stepElapsed);
    stepElapsed += consumed;
    remaining -= consumed;

    const t = stepElapsed / STEP_DURATION_MS;
    renderPos.x = lerp(stepFrom.x, playerTile.x, t);
    renderPos.y = lerp(stepFrom.y, playerTile.y, t);

    if (stepElapsed >= STEP_DURATION_MS) {
      stepping = false;
      renderPos.x = playerTile.x;
      renderPos.y = playerTile.y;
      // Commit the arrived tile to the authoritative run snapshot.
      runState.player.position.x = playerTile.x;
      runState.player.position.y = playerTile.y;

      const encounter = activeMap.objects.find(
        (item) =>
          item.kind === "encounter" &&
          item.x === playerTile.x &&
          item.y === playerTile.y &&
          !isEncounterCleared(runState, item.id)
      );
      if (encounter) {
        startBattle(encounter);
        return;
      }
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
  activeEncounterId = encounter.id;
  activeFoeLevel = encounter.level;
  const foe = toBattleMonster(createMonsterState(encounter.speciesId, encounter.level), "foe");
  battleTeam = playerRoster.map((state) => toBattleMonster(state, "player"));
  battle = new BattleEngine({
    playerRoster: battleTeam,
    opponentRoster: [foe]
  });
  battleView = battle.view();
  message = `${foe.name} 出现了！选择招式或按 Tab 换人。`;
}

function handleBattleKey(event: KeyboardEvent): void {
  if (!battle || !battleView || isPlaybackActive()) {
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
    message = battleMenuMode === "fight" ? "要使用哪一个招式？" : "要换上哪只宝可梦？";
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

  // A terminal outcome means battle HP/status is final: persist it now so the
  // XP/level-up that follows rescales HP against the correct post-battle value.
  if (outcome === "player" || outcome === "opponent") {
    persistBattleResult();
  }

  if (outcome === "player") {
    playbackSteps.push({ kind: "text", text: "战斗胜利！", duration: 700, elapsed: 0 });
    const reward = grantBattleXp();
    if (reward > 0) {
      playbackSteps.push({ kind: "text", text: `队伍每只获得了 ${reward} 经验！`, duration: 800, elapsed: 0 });
    }
    for (const text of applyTeamLevelUps()) {
      playbackSteps.push({ kind: "text", text, duration: 800, elapsed: 0 });
    }
  }

  if (outcome === "opponent") {
    playbackSteps.push({ kind: "text", text: "队伍全灭，返回地图。", duration: 900, elapsed: 0 });
  }
}

/** Write each battler's final HP/status back onto the persistent roster. */
function persistBattleResult(): void {
  if (battleTeam) {
    battleTeam.forEach((monster, index) => syncMonsterStateFromBattle(playerRoster[index], monster));
  }
}

/**
 * Award the foe's XP to every surviving team member (full amount each, like a
 * party-wide Exp Share). Runs after `persistBattleResult`, so HP reflects the
 * battle outcome. Called once per won battle from `queueBattlePlayback`.
 */
function grantBattleXp(): number {
  const reward = xpRewardForDefeating(activeFoeLevel);
  for (const monster of playerRoster) {
    if (monster.currentHp > 0) {
      monster.xp += reward;
    }
  }
  return reward;
}

/** Spend freshly-earned XP into level-ups, returning a message per level gained. */
function applyTeamLevelUps(): string[] {
  const messages: string[] = [];
  for (const monster of playerRoster) {
    const result = applyLevelUps(monster);
    if (result.leveledUp) {
      messages.push(`${SPECIES[monster.speciesId].name} 升到了 Lv.${result.to}！`);
    }
  }
  return messages;
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
    return "效果不太好。";
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
    // HP/status, XP and level-ups were already persisted when the outcome was
    // queued; here we only retire the encounter and tear the battle down.
    // On a win, record it in the run snapshot and drop its map marker so it
    // stays gone when we return to the overworld.
    if (pendingOutcome === "player" && activeEncounterId) {
      markEncounterCleared(runState, activeEncounterId);
      removeEncounterMarker(mapRender, activeEncounterId);
    }
    activeEncounterId = null;
    mode = "map";
    battle = null;
    battleView = null;
    battleTeam = null;
    displayedHp.clear();
    message = "方向键/WASD 移动，踩到标记进入 1v1 战斗。";
    pendingOutcome = "ongoing";
  }
}

function createBattleRenderView(): BattleRenderView {
  const container = new Container();
  const background = createBattleBackgroundView();
  container.addChild(background.container);

  const playerShadow = new Graphics();
  const foeShadow = new Graphics();
  const playerSprite = new Sprite(Texture.EMPTY);
  const foeSprite = new Sprite(Texture.EMPTY);
  playerSprite.anchor.set(0.5, 1);
  foeSprite.anchor.set(0.5, 1);

  const projectileTrail = new Graphics();
  const projectileOrb = new Graphics();
  const projectileBurst = new Graphics();
  const contactFlash = new Graphics();
  const statusPulse = new Graphics();
  const moveLayer = new Container();
  moveLayer.addChild(projectileTrail, projectileOrb, projectileBurst, contactFlash, statusPulse);

  const foePanel = createMonsterPanelView();
  const playerPanel = createMonsterPanelView();
  const dialog = createBattleDialogView();
  container.addChild(foeShadow, playerShadow, foeSprite, playerSprite, moveLayer, foePanel.container, playerPanel.container, dialog.container);

  return {
    container,
    background,
    playerShadow,
    foeShadow,
    playerSprite,
    foeSprite,
    projectileTrail,
    projectileOrb,
    projectileBurst,
    contactFlash,
    statusPulse,
    playerPanel,
    foePanel,
    dialog
  };
}

function createMonsterPanelView(): MonsterPanelView {
  const width = 300;
  const height = 80;
  const container = new Container();

  const shadow = new Graphics();
  shadow.roundRect(6, 8, width, height, 12).fill({ color: "#0a0911", alpha: 0.4 });
  container.addChild(shadow);

  const edge = new Graphics();
  edge.roundRect(0, 0, width, height, 12).fill(PALETTE.panelEdgeDark);
  container.addChild(edge);

  const face = new Graphics();
  face.roundRect(2, 2, width - 4, height - 5, 11).fill(PALETTE.panelFace);
  face.roundRect(2, 2, width - 4, height - 5, 11).stroke({ color: PALETTE.panelEdgeLight, width: 2 });
  container.addChild(face);

  const sheen = new Graphics();
  sheen.roundRect(6, 5, width - 12, 3, 2).fill({ color: "#ffffff", alpha: 0.14 });
  sheen.rect(18, 34, width - 36, 1).fill({ color: PALETTE.gold, alpha: 0.55 });
  container.addChild(sheen);

  const nameText = new Text({ text: "", style: textStyles.panelName });
  nameText.x = 18;
  nameText.y = 11;
  container.addChild(nameText);

  const levelText = new Text({ text: "", style: textStyles.panelLevel });
  levelText.y = 13;
  container.addChild(levelText);

  const hpLabel = new Text({ text: "HP", style: textStyles.panelHpLabel });
  hpLabel.x = 18;
  hpLabel.y = 50;
  container.addChild(hpLabel);

  const hpBar = createHpBarView(container, 52, 49, 196, 11);

  const hpText = new Text({ text: "", style: textStyles.panelHp });
  hpText.y = 49;
  container.addChild(hpText);

  return { container, nameText, levelText, hpText, hpBar };
}

function createHpBarView(parent: Container, x: number, y: number, width: number, height: number): HpBarView {
  const track = new Graphics();
  track.roundRect(x, y, width, height, height / 2).fill(PALETTE.hpTrack);
  track.roundRect(x, y, width, height, height / 2).stroke({ color: "#000000", width: 1, alpha: 0.6 });
  parent.addChild(track);

  const fill = new Graphics();
  parent.addChild(fill);

  const ticks = new Graphics();
  for (let i = 1; i < 8; i += 1) {
    const tx = x + (width / 8) * i;
    ticks.rect(tx, y + 1, 1, height - 2).fill({ color: "#000000", alpha: 0.28 });
  }
  parent.addChild(ticks);

  return { fill };
}

function createBattleDialogView(): BattleDialogView {
  const container = new Container();
  drawStaticFramedBox(container, 32, 414, GAME_WIDTH - 64, 110);

  const divider = new Graphics();
  divider.moveTo(688, 424).lineTo(688, 514).stroke({ color: PALETTE.boxEdge, width: 2, alpha: 0.6 });
  divider.moveTo(690, 424).lineTo(690, 514).stroke({ color: PALETTE.gold, width: 1, alpha: 0.7 });
  container.addChild(divider);

  const messageText = new Text({ text: "", style: textStyles.message });
  messageText.x = 64;
  messageText.y = 448;
  container.addChild(messageText);

  const moveTexts = Array.from({ length: 4 }, () => new Text({ text: "", style: textStyles.move }));
  const moveMetaTexts = Array.from({ length: 4 }, () => new Text({ text: "", style: textStyles.moveMeta }));
  for (let index = 0; index < moveTexts.length; index += 1) {
    container.addChild(moveTexts[index], moveMetaTexts[index]);
  }

  const pokemonTexts = Array.from({ length: playerRoster.length }, () => new Text({ text: "", style: textStyles.pokemon }));
  for (const text of pokemonTexts) {
    container.addChild(text);
  }

  const menuTexts = {
    fight: new Text({ text: "战斗", style: textStyles.menu }),
    pokemon: new Text({ text: "宝可梦", style: textStyles.menu })
  };
  container.addChild(menuTexts.fight, menuTexts.pokemon);

  const hintText = new Text({ text: "Tab 切换 / Enter 确定", style: textStyles.hint });
  hintText.x = 704;
  hintText.y = 494;
  container.addChild(hintText);

  const optionCaret = new Graphics();
  const menuCaret = new Graphics();
  container.addChild(optionCaret, menuCaret);

  return { container, messageText, moveTexts, moveMetaTexts, pokemonTexts, menuTexts, optionCaret, menuCaret };
}

function drawStaticFramedBox(layer: Container, x: number, y: number, width: number, height: number): void {
  const frame = new Graphics();
  frame.roundRect(x, y, width, height, 9).fill(PALETTE.boxEdge);
  layer.addChild(frame);

  const face = new Graphics();
  face.roundRect(x + 4, y + 4, width - 8, height - 8, 7).fill(PALETTE.boxFace);
  face.roundRect(x + 4, y + height - 22, width - 8, 18, 7).fill(PALETTE.boxFaceLow);
  face.roundRect(x + 4, y + 4, width - 8, height - 8, 7).stroke({ color: PALETTE.gold, width: 1.5, alpha: 0.7 });
  layer.addChild(face);

  const sheen = new Graphics();
  sheen.roundRect(x + 7, y + 6, width - 14, 4, 3).fill({ color: "#ffffff", alpha: 0.4 });
  layer.addChild(sheen);
}

function updateBattleRender(): void {
  if (!battleView) {
    return;
  }

  updateBattleBackgroundView(battleRender.background, elapsed);

  const player = battleView.player.active;
  const foe = battleView.opponent.active;
  const playerSprite = getSpriteRenderTuning(player.speciesId, "back", "player");
  const foeSprite = getSpriteRenderTuning(foe.speciesId, "front", "foe");
  updateBattleSprite(battleRender.playerShadow, battleRender.playerSprite, player.speciesId, "back", "player", playerSprite.x, playerSprite.y, playerSprite.scale);
  updateBattleSprite(battleRender.foeShadow, battleRender.foeSprite, foe.speciesId, "front", "foe", foeSprite.x, foeSprite.y, foeSprite.scale);
  updateMoveAnimation();

  updateMonsterPanel(
    battleRender.foePanel,
    BATTLE_LAYOUT.foe.panel.x,
    BATTLE_LAYOUT.foe.panel.y,
    foe.name,
    foe.level,
    getDisplayedHp(foe.instanceId, foe.currentHp),
    foe.maxHp,
    false
  );
  updateMonsterPanel(
    battleRender.playerPanel,
    BATTLE_LAYOUT.player.panel.x,
    BATTLE_LAYOUT.player.panel.y,
    player.name,
    player.level,
    getDisplayedHp(player.instanceId, player.currentHp),
    player.maxHp,
    true
  );
  updateBattleDialog();
}

function updateBattleSprite(
  shadow: Graphics,
  sprite: Sprite,
  speciesId: SpeciesId,
  facing: "front" | "back",
  side: BattleSide,
  x: number,
  y: number,
  scale: number
): void {
  const offset = getSpriteAnimationOffset(side);
  const intro = easeOutCubic(clamp01((elapsed - battleIntroStart) / 0.5));
  const introSlide = (1 - intro) * (side === "player" ? -90 : 90);
  const phase = side === "player" ? 0 : Math.PI;
  const bob = Math.sin(elapsed * 2.2 + phase) * 2.2;

  shadow.clear();
  const shadowW = 64 * (scale / 2.7);
  shadow.ellipse(x + offset.x + introSlide, y + 6, shadowW, shadowW * 0.32).fill({ color: "#243018", alpha: 0.32 * intro });

  sprite.texture = Texture.from(getBattleSpriteUrl(speciesId, facing));
  sprite.scale.set(scale);
  sprite.x = x + offset.x + introSlide;
  sprite.y = y + offset.y + bob;
  sprite.alpha = intro;
}

function updateMonsterPanel(view: MonsterPanelView, x: number, y: number, name: string, level: number, hp: number, maxHp: number, mirror: boolean): void {
  const width = 300;
  const intro = easeOutCubic(clamp01((elapsed - battleIntroStart) / 0.45));
  view.container.x = x + (1 - intro) * (mirror ? 140 : -140);
  view.container.y = y;
  view.container.alpha = intro;

  setText(view.nameText, name);
  setText(view.levelText, `Lv.${level}`);
  view.levelText.x = width - 18 - view.levelText.width;
  updateHpBar(view.hpBar, 52, 49, 196, 11, hp, maxHp);
  setText(view.hpText, `${Math.max(0, hp)}/${maxHp}`);
  view.hpText.x = width - 18 - view.hpText.width;
}

function updateHpBar(view: HpBarView, x: number, y: number, width: number, height: number, hp: number, maxHp: number): void {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const { hi, lo } = hpColors(ratio);
  const fillW = Math.max(0, (width - 4) * ratio);
  view.fill.clear();
  if (fillW <= 0) {
    return;
  }

  const innerH = height - 4;
  view.fill.roundRect(x + 2, y + 2, fillW, innerH, innerH / 2).fill(lo);
  view.fill.roundRect(x + 2, y + 2, fillW, innerH * 0.55, innerH / 2).fill(hi);
  view.fill.rect(x + 3, y + 3, Math.max(0, fillW - 2), 1).fill({ color: "#ffffff", alpha: 0.5 });
}

function updateBattleDialog(): void {
  if (!battleView) {
    return;
  }

  const dialog = battleRender.dialog;
  const playbackActive = isPlaybackActive();
  setText(dialog.messageText, message);
  dialog.messageText.visible = playbackActive;
  dialog.optionCaret.clear();
  updateMoveOptions(dialog, battleMenuMode === "fight" && !playbackActive);
  updatePokemonOptions(dialog, battleMenuMode === "pokemon" && !playbackActive);
  updateBattleMenu(dialog);
}

function updateMoveOptions(dialog: BattleDialogView, visible: boolean): void {
  if (!battleView) {
    return;
  }

  for (let index = 0; index < dialog.moveTexts.length; index += 1) {
    const text = dialog.moveTexts[index];
    const meta = dialog.moveMetaTexts[index];
    const moveId = battleView.player.active.moves[index];
    const rowX = 64 + (index % 2) * 308;
    const rowY = 438 + Math.floor(index / 2) * 36;
    text.visible = visible && moveId !== undefined;
    meta.visible = visible && moveId !== undefined;
    if (!moveId) {
      continue;
    }

    const move = MOVES[moveId];
    const selected = index === selectedMoveIndex;
    text.x = rowX;
    text.y = rowY;
    meta.x = rowX + 150;
    meta.y = rowY + 5;
    const info = moveMeta(moveId);
    setText(text, move.name);
    setTextStyle(text, selected ? textStyles.moveSelected : textStyles.move);
    setText(meta, `${localizeElementType(info.type)} / ${localizeMoveCategory(info.category)}`);
    if (visible && selected) {
      drawCaret(dialog.optionCaret, rowX - 18, rowY + 6);
    }
  }
}

function updatePokemonOptions(dialog: BattleDialogView, visible: boolean): void {
  if (!battleView) {
    return;
  }

  for (let index = 0; index < dialog.pokemonTexts.length; index += 1) {
    const text = dialog.pokemonTexts[index];
    const monster = battleView.player.roster[index];
    text.visible = visible && monster !== undefined;
    if (!monster) {
      continue;
    }

    const selected = index === selectedPokemonIndex;
    const isActive = index === battleView.player.activeIndex;
    const fainted = monster.currentHp <= 0;
    const hp = getDisplayedHp(monster.instanceId, monster.currentHp);
    const rowY = 430 + index * 28;
    const tag = isActive ? "  出战" : fainted ? "  倒下" : "";
    text.x = 64;
    text.y = rowY;
    setText(text, `${monster.name}  Lv.${monster.level}  ${hp}/${monster.maxHp}${tag}`);
    setTextStyle(text, fainted ? textStyles.pokemonFainted : selected ? textStyles.pokemonSelected : textStyles.pokemon);
    if (visible && selected) {
      drawCaret(dialog.optionCaret, 46, rowY + 6);
    }
  }
}

function updateBattleMenu(dialog: BattleDialogView): void {
  const options: Array<[BattleMenuMode, string]> = [
    ["fight", "战斗"],
    ["pokemon", "宝可梦"]
  ];

  dialog.menuCaret.clear();
  options.forEach(([menuMode, label], index) => {
    const selected = battleMenuMode === menuMode;
    const rowY = 438 + index * 34;
    const text = dialog.menuTexts[menuMode];
    text.x = 724;
    text.y = rowY;
    setText(text, label);
    setTextStyle(text, selected ? textStyles.menuSelected : textStyles.menu);
    if (selected) {
      drawCaret(dialog.menuCaret, 704, rowY + 7);
    }
  });
}

function drawCaret(caret: Graphics, x: number, y: number): void {
  const bob = Math.sin(elapsed * 7) * 2.5 + 2.5;
  caret.moveTo(x + bob, y).lineTo(x + bob + 9, y + 5).lineTo(x + bob, y + 10).fill(PALETTE.select);
  caret.stroke({ color: PALETTE.selectGlow, width: 1, alpha: 0.8 });
}

function updateMoveAnimation(): void {
  battleRender.projectileTrail.clear();
  battleRender.projectileOrb.clear();
  battleRender.projectileBurst.clear();
  battleRender.contactFlash.clear();
  battleRender.statusPulse.clear();

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

    for (let i = 1; i <= 5; i += 1) {
      const tp = Math.max(0, progress - i * 0.06);
      battleRender.projectileTrail.circle(lerp(from.x, to.x, tp), lerp(from.y - 72, to.y - 72, tp), 9 - i).fill({ color, alpha: 0.12 * (5 - i) });
    }

    battleRender.projectileOrb.circle(px, py, 13).fill({ color, alpha: 0.35 });
    battleRender.projectileOrb.circle(px, py, 8).fill(color);
    battleRender.projectileOrb.circle(px - 2, py - 2, 3).fill({ color: "#ffffff", alpha: 0.85 });

    if (progress > 0.82) {
      const burst = (progress - 0.82) / 0.18;
      battleRender.projectileBurst.circle(to.x, to.y - 72, 6 + burst * 26).stroke({ color, width: 3, alpha: 1 - burst });
    }
  }

  if (event.animation === "contact") {
    const apex = Math.sin(progress * Math.PI);
    if (apex > 0.4) {
      const to = getBattleSpritePosition(event.targetSide);
      battleRender.contactFlash.circle(to.x, to.y - 72, 18 + apex * 14).fill({ color: "#ffffff", alpha: 0.28 * apex });
      battleRender.contactFlash.circle(to.x, to.y - 72, 28 + apex * 18).stroke({ color, width: 3, alpha: 0.5 * apex });
    }
  }

  if (event.animation === "status") {
    const center = getBattleSpritePosition(event.userSide);
    battleRender.statusPulse.circle(center.x, center.y - 72, 24 + progress * 22).stroke({ color, width: 3, alpha: 1 - progress });
    battleRender.statusPulse.circle(center.x, center.y - 72, 14 + progress * 30).stroke({ color, width: 2, alpha: 0.6 * (1 - progress) });
  }
}

app.ticker.add((ticker) => {
  elapsed += ticker.deltaMS / 1000;

  if (mode === "map") {
    mapRender.container.visible = true;
    battleRender.container.visible = false;
    sceneLayer.position.set(0, 0);
    updateMap(ticker.deltaMS);
    updateMapRenderView(mapRender, activeMap, renderPos);
  } else {
    mapRender.container.visible = false;
    battleRender.container.visible = true;
    applyScreenShake();
    updateBattlePlayback(ticker.deltaMS);
    updateBattleRender();
  }
});

function applyScreenShake(): void {
  if (elapsed < shakeUntil) {
    const energy = (shakeUntil - elapsed) * shakeMag;
    sceneLayer.position.set((Math.random() - 0.5) * energy, (Math.random() - 0.5) * energy);
  } else {
    sceneLayer.position.set(0, 0);
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
  const type = moveMeta(moveId).type;
  if (type === "fire") {
    return "#f16b3f";
  }
  if (type === "water") {
    return "#4f9fe8";
  }
  if (type === "grass") {
    return "#69b95b";
  }
  if (type === "ground" || type === "rock") {
    return "#b08a55";
  }
  return "#d8d8d8";
}

function localizeElementType(type: string): string {
  const names: Record<string, string> = {
    normal: "一般",
    fire: "火",
    water: "水",
    grass: "草",
    electric: "电",
    flying: "飞行",
    rock: "岩石",
    ground: "地面"
  };
  return names[type] ?? type;
}

function localizeMoveCategory(category: string): string {
  const names: Record<string, string> = {
    physical: "物理",
    special: "特殊",
    status: "变化"
  };
  return names[category] ?? category;
}

function setText(text: Text, value: string): void {
  if (text.text !== value) {
    text.text = value;
  }
}

function setTextStyle(text: Text, style: TextStyle): void {
  if (text.style !== style) {
    text.style = style;
  }
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
