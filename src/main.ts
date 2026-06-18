import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import "./styles.css";
import { createBattleBackgroundView, updateBattleBackgroundView, type BattleBackgroundView } from "./client/render/battleBackground";
import { createBattleControls, type BattleControlsView } from "./client/render/battleControls";
import { BATTLE_LAYOUT, getSpriteFootPosition } from "./client/render/battleLayout";
import { createMapRenderView, removeEncounterMarker, updateMapPathOverlay, updateMapRenderView } from "./client/render/mapView";
import { fitRendererToWindow, GAME_HEIGHT, GAME_WIDTH } from "./client/render/screen";
import { createTeamHud, type TeamHudView } from "./client/render/teamHud";
import { hpColors, PALETTE, pixelText } from "./client/render/theme";
import { createTileTextures, type TileTextureMap } from "./client/render/tileTextures";
import { BattleEngine } from "./game/battle/BattleEngine";
import { moveMeta } from "./game/battle/smogonCalc";
import type { BattleCommand, BattleEvent, BattleMonster, BattleMoveEvent, BattleOutcome, BattleSide, BattleStateView } from "./game/battle/types";
import { applyLevelUps, createMonsterState, syncMonsterStateFromBattle, toBattleMonster, xpRewardForDefeating } from "./game/state/monster";
import { createRunState, isEncounterCleared, markEncounterCleared } from "./game/state/runState";
import { getAllAnimatedBattleSpriteUrls, getAllBattleSpriteUrls, getAnimatedBattleSpriteUrl, getBattleSpriteUrl } from "./game/data/art";
import { createAnimatedBattler, type AnimatedBattler } from "./client/render/animatedBattler";
import { loadGif } from "./client/render/gifLoader";
import "pixi.js/gif";
import type { MoveId } from "./game/data/moves";
import { SPECIES, type SpeciesId } from "./game/data/species";
import { PROTOTYPE_MAP } from "./game/map/prototypeMap";
import { findPath, type TileCoord } from "./game/map/pathfinding";
import { TILE_DEFINITIONS } from "./game/map/tiles";
import type { MapEncounterObject, TileId } from "./game/map/types";

type SceneMode = "map" | "battle";
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
};
type BattleRenderView = {
  container: Container;
  background: BattleBackgroundView;
  playerShadow: Graphics;
  foeShadow: Graphics;
  playerSprite: Sprite;
  foeSprite: Sprite;
  playerBattler: AnimatedBattler;
  foeBattler: AnimatedBattler;
  projectileTrail: Graphics;
  projectileOrb: Graphics;
  projectileBurst: Graphics;
  contactFlash: Graphics;
  statusPulse: Graphics;
  playerPanel: MonsterPanelView;
  foePanel: MonsterPanelView;
  dialog: BattleDialogView;
  controls: BattleControlsView;
};

const activeMap = PROTOTYPE_MAP;

const app = new Application();
await app.init({
  background: "#14121e",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // Smooths vector geometry edges (battle-background hills, framed boxes, HP
  // bars). Textured pixel-art sprites/tiles are unaffected — MSAA only touches
  // primitive edges, and their interiors keep `nearest` sampling.
  antialias: true
});

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) {
  throw new Error("Missing #app host element.");
}
host.appendChild(app.canvas);
fitRendererToWindow(app);
window.addEventListener("resize", () => fitRendererToWindow(app));

// Dev-only GM hook: jump straight into a preset battle from the browser console
// — `gmStartBattle()` or `gmStartBattle("charmander", 8)` — for quick manual and
// automated testing. `import.meta.env.DEV` is false in production, so this whole
// block is stripped from the build.
if (import.meta.env.DEV) {
  (window as typeof window & { gmStartBattle?: (speciesId?: SpeciesId, level?: number) => void }).gmStartBattle = (
    speciesId: SpeciesId = "squirtle",
    level = 5
  ): void => {
    if (!SPECIES[speciesId]) {
      console.warn(`gmStartBattle: unknown species "${speciesId}". Known: ${Object.keys(SPECIES).join(", ")}`);
      return;
    }
    startBattle({ kind: "encounter", id: "gm-preset", x: -1, y: -1, speciesId, level });
  };
}

// Preload the animated GIFs (via our flicker-fixed decoder) and the static PNGs
// (error fallback) up front, so that by the time a battle starts the GifSource
// is cached and attaches synchronously — no Gen5 still ever flashes in.
void Assets.load(getAllBattleSpriteUrls()).catch((error: unknown) => {
  console.warn("Failed to preload static battle sprites.", error);
});
for (const url of getAllAnimatedBattleSpriteUrls()) {
  void loadGif(url).catch((error: unknown) => console.warn(`Failed to preload ${url}`, error));
}
void document.fonts?.load('16px "Zpix"').catch(() => undefined);

const tileTextures: TileTextureMap = createTileTextures(app, activeMap.tileSize);
// Shared TextStyle *instances* (not plain objects): Text keeps the instance it
// is given, so `setTextStyle`'s reference check actually short-circuits and we
// avoid re-rasterizing labels every frame when their style is unchanged.
const textStyles = {
  message: new TextStyle(pixelText({ fill: PALETTE.boxInk, fontSize: 19, wordWrapWidth: 820 })),
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

const mapRender = createMapRenderView(
  activeMap,
  tileTextures,
  app.renderer.events,
  new Set(runState.clearedEncounterIds),
  (tileX, tileY) => requestPathTo(tileX, tileY)
);
const battleRender = createBattleRenderView();
battleRender.container.visible = false;
sceneLayer.addChild(mapRender.container, battleRender.container);

// UI overlay layer sits above the (shakeable) scene layer so HUD chrome and the
// monster detail modal are unaffected by battle screen shake and always on top.
const uiLayer = new Container();
root.addChild(uiLayer);
const teamHud: TeamHudView = createTeamHud(runState.player.team);
uiLayer.addChild(teamHud.bar, teamHud.overlay);

// 4 tiles/sec → 250 ms per tile. Movement is grid-locked: one tile per step,
// no diagonals, with the on-screen position interpolated across the step so the
// player and camera glide instead of snapping.
const STEP_DURATION_MS = 250;

/** Keys that drive manual (keyboard) walking and cancel click-to-walk paths. */
const MOVEMENT_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"]);

/** Battle hotkeys (lowercased): Q/W/E/R fire moves, 1/2/3 switch party slots. */
const MOVE_HOTKEYS = ["q", "w", "e", "r"];
const SWITCH_HOTKEYS = ["1", "2", "3"];

const keys = new Set<string>();
let mode: SceneMode = "map";
let playerTile = { ...runState.player.position };
let stepFrom = { ...runState.player.position };
const renderPos = { x: runState.player.position.x, y: runState.player.position.y };
let stepElapsed = 0;
let stepping = false;
// Click/tap-to-walk: the queued tiles (each adjacent to the previous) the player
// is auto-walking toward. A movement keypress clears it for manual override.
let movePath: TileCoord[] = [];
let battle: BattleEngine | null = null;
let battleView: BattleStateView | null = null;
// Which map encounter triggered the current battle, so a win can clear it.
let activeEncounterId: string | null = null;
// The defeated foe's in-game level, used to compute the XP reward on victory.
let activeFoeLevel = 0;
// Battle- materialized copy of `playerRoster`; index-aligned to it so final HP
// and status can be written back to the persistent state when the battle ends.
let battleTeam: BattleMonster[] | null = null;
let message = "点击地图移动，踩到标记进入 1v1 战斗。";
let playbackSteps: PlaybackStep[] = [];
let currentPlaybackStep: PlaybackStep | null = null;
let spriteAnimation: BattleSpriteAnimation | null = null;
let hpTween: HpTween | null = null;
let pendingOutcome: BattleOutcome = "ongoing";
// While set in the future, a short non-playback banner (e.g. the capture
// placeholder) is shown over the control buttons.
let transientUntil = 0;
const displayedHp = new Map<string, number>();

let elapsed = 0;
let battleIntroStart = 0;
let shakeUntil = 0;
let shakeMag = 0;

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);

  if (key === "escape" && teamHud.isDetailOpen()) {
    teamHud.closeDetail();
    return;
  }

  if (mode === "map" && MOVEMENT_KEYS.has(key)) {
    // Manual walking overrides any active click-to-walk path.
    movePath = [];
  }

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

/**
 * Desired step direction: keyboard input wins (and cancels any active path);
 * otherwise follow the next tile of the click-to-walk path. One axis at a time.
 */
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
  if (movePath.length > 0) {
    const target = movePath[0];
    return { x: Math.sign(target.x - playerTile.x), y: Math.sign(target.y - playerTile.y) };
  }
  return null;
}

/**
 * Click/tap-to-walk: pathfind to the tapped tile and queue the walk. Bounded by
 * the search-node cap, so far/unreachable targets are simply ignored.
 */
function requestPathTo(tileX: number, tileY: number): void {
  if (mode !== "map") {
    return;
  }
  const path = findPath(activeMap, playerTile, { x: tileX, y: tileY });
  if (path && path.length > 0) {
    movePath = path;
  }
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
        movePath = [];
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

      // Consume the path node we just reached.
      if (movePath.length > 0 && movePath[0].x === playerTile.x && movePath[0].y === playerTile.y) {
        movePath.shift();
      }

      const encounter = activeMap.objects.find(
        (item) =>
          item.kind === "encounter" &&
          item.x === playerTile.x &&
          item.y === playerTile.y &&
          !isEncounterCleared(runState, item.id)
      );
      if (encounter) {
        movePath = [];
        startBattle(encounter);
        return;
      }
    }
  }
}

function startBattle(encounter: MapEncounterObject): void {
  mode = "battle";
  playbackSteps = [];
  currentPlaybackStep = null;
  spriteAnimation = null;
  hpTween = null;
  pendingOutcome = "ongoing";
  transientUntil = 0;
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
  message = `${foe.name} 出现了！点击招式或快捷键 Q/W/E/R。`;
}

function handleBattleKey(event: KeyboardEvent): void {
  if (!battle || !battleView || isPlaybackActive()) {
    return;
  }

  const key = event.key.toLowerCase();
  const moveIndex = MOVE_HOTKEYS.indexOf(key);
  if (moveIndex >= 0) {
    tryUseMove(moveIndex);
    return;
  }
  const switchIndex = SWITCH_HOTKEYS.indexOf(key);
  if (switchIndex >= 0) {
    trySwitch(switchIndex);
  }
}

/** Use the move in the given slot (0-3) if it exists. Shared by clicks + hotkeys. */
function tryUseMove(index: number): void {
  if (!battle || !battleView || isPlaybackActive()) {
    return;
  }
  const moveId = battleView.player.active.moves[index];
  if (moveId === undefined) {
    return;
  }
  runBattleTurn({ type: "move", moveId });
}

/** Switch to the party member in the given slot if it is valid, alive, and benched. */
function trySwitch(index: number): void {
  if (!battle || !battleView || isPlaybackActive()) {
    return;
  }
  const monster = battleView.player.roster[index];
  if (!monster || index === battleView.player.activeIndex || monster.currentHp <= 0) {
    return;
  }
  runBattleTurn({ type: "switch", targetIndex: index });
}

/** Capture is not implemented yet; surface a short banner over the controls. */
function tryCapture(): void {
  if (!battle || !battleView || isPlaybackActive()) {
    return;
  }
  showTransientMessage("捕捉功能尚未实装，敬请期待！");
}

function showTransientMessage(text: string): void {
  message = text;
  transientUntil = elapsed + 1.4;
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
    message = "点击地图移动，踩到标记进入 1v1 战斗。";
    pendingOutcome = "ongoing";
    // The roster's HP/level may have changed; repaint the team HUD slots.
    teamHud.refresh();
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
  const controls = createBattleControls({
    onMove: (index) => tryUseMove(index),
    onSwitch: (index) => trySwitch(index),
    onCapture: () => tryCapture()
  });
  container.addChild(
    foeShadow,
    playerShadow,
    foeSprite,
    playerSprite,
    moveLayer,
    foePanel.container,
    playerPanel.container,
    dialog.container,
    controls.container
  );

  const playerBattler = createAnimatedBattler(container, playerSprite);
  const foeBattler = createAnimatedBattler(container, foeSprite);

  return {
    container,
    background,
    playerShadow,
    foeShadow,
    playerSprite,
    foeSprite,
    playerBattler,
    foeBattler,
    projectileTrail,
    projectileOrb,
    projectileBurst,
    contactFlash,
    statusPulse,
    playerPanel,
    foePanel,
    dialog,
    controls
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

  // Shown during playback (move/HP/result text). During the player's turn the
  // clickable control bar (createBattleControls) replaces it instead.
  const messageText = new Text({ text: "", style: textStyles.message });
  messageText.x = 64;
  messageText.y = 456;
  container.addChild(messageText);

  return { container, messageText };
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
  updateBattleSprite(battleRender.playerShadow, battleRender.playerBattler, battleRender.playerSprite, player.speciesId, "back", "player", playerSprite.x, playerSprite.y, playerSprite.scale);
  updateBattleSprite(battleRender.foeShadow, battleRender.foeBattler, battleRender.foeSprite, foe.speciesId, "front", "foe", foeSprite.x, foeSprite.y, foeSprite.scale);
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

// --- Animated (ani) sprite tuning -------------------------------------------
// ani GIFs are variable-size and drawn near-native, so relative body size is
// already baked in: a single global scale per facing reads correctly where the
// fixed 96×96 stills needed per-species scaling.
//
// ani sprites are grounded on the platform CENTER (so the shadow lands on the
// disc and the feet rest on it), independent of the per-species gen5 foot line.
// ANI_FOOT_NUDGE is a fine-tune offset from that center (negative = up).
const ANI_SPRITE_SCALE = { front: 1.7, back: 2.0 } as const;
const ANI_FOOT_NUDGE = { front: 0, back: 0 } as const;

function updateBattleSprite(
  shadow: Graphics,
  battler: AnimatedBattler,
  fallback: Sprite,
  speciesId: SpeciesId,
  facing: "front" | "back",
  side: BattleSide,
  x: number,
  y: number,
  staticScale: number
): void {
  const offset = getSpriteAnimationOffset(side);
  const intro = easeOutCubic(clamp01((elapsed - battleIntroStart) / 0.5));
  const introSlide = (1 - intro) * (side === "player" ? -90 : 90);
  const phase = side === "player" ? 0 : Math.PI;
  const bob = Math.sin(elapsed * 2.2 + phase) * 2.2;

  // Keep the static PNG current (it is the pre-load placeholder and the fallback
  // if the GIF errors), then request the animated version — a no-op once it is
  // already on screen. Texture order before request() avoids a stale frame on
  // a species switch.
  fallback.texture = Texture.from(getBattleSpriteUrl(speciesId, facing));
  battler.request(getAnimatedBattleSpriteUrl(speciesId, facing));

  const node = battler.active();
  const isAnimated = node !== fallback;
  const scale = isAnimated ? ANI_SPRITE_SCALE[facing] : staticScale;

  // ani: ground on the platform centre. Static fallback: keep the gen5 foot line `y`.
  const layoutSide = side === "player" ? "player" : "foe";
  const groundY = isAnimated ? BATTLE_LAYOUT[layoutSide].platform.y + ANI_FOOT_NUDGE[facing] : y + 6;

  node.scale.set(scale);
  node.x = x + offset.x + introSlide;
  node.y = (isAnimated ? groundY : y) + offset.y + bob;
  node.alpha = intro;

  shadow.clear();
  const shadowRx = battler.naturalSize().width * scale * 0.25;
  // Shadow sits at the ground line (platform centre for ani) under the feet; it
  // intentionally ignores `bob` so it stays planted while the sprite bounces.
  shadow.ellipse(x + offset.x + introSlide, groundY, shadowRx, shadowRx * 0.32).fill({ color: "#243018", alpha: 0.32 * intro });
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

  // Show the message line during playback (and the brief capture banner);
  // otherwise show the clickable control bar for the player's turn.
  const showMessage = isPlaybackActive() || elapsed < transientUntil;
  setText(battleRender.dialog.messageText, message);
  battleRender.dialog.messageText.visible = showMessage;
  battleRender.controls.container.visible = !showMessage;
  if (!showMessage) {
    battleRender.controls.update(battleView, getDisplayedHp);
  }
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

  teamHud.setVisible(mode === "map");

  if (mode === "map") {
    mapRender.container.visible = true;
    battleRender.container.visible = false;
    sceneLayer.position.set(0, 0);
    updateMap(ticker.deltaMS);
    updateMapRenderView(mapRender, activeMap, renderPos);
    updateMapPathOverlay(mapRender, activeMap, renderPos, movePath, elapsed);
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

function setText(text: Text, value: string): void {
  if (text.text !== value) {
    text.text = value;
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
