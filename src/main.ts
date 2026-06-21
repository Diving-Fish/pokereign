import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import "./styles.css";
import { createBattleBackgroundView, updateBattleBackgroundView, type BattleBackgroundView } from "./client/render/battleBackground";
import { createBattleControls, type BattleControlsView } from "./client/render/battleControls";
import { BATTLE_LAYOUT, getSpriteFootPosition } from "./client/render/battleLayout";
import { removeEncounterMarker, updateMapPathOverlay, updateMapRenderView } from "./client/render/mapView";
import { createTiledMapRenderView } from "./client/render/tiledMapView";
import { fitRendererToWindow, GAME_HEIGHT, GAME_WIDTH } from "./client/render/screen";
import { createTeamHud, type TeamHudView } from "./client/render/teamHud";
import { createCaptureReplaceView, type CaptureReplaceView } from "./client/render/captureReplaceView";
import { createMoveLearnView, type MoveLearnView } from "./client/render/moveLearnView";
import { createRewardChoiceView, type RewardChoiceView } from "./client/render/rewardChoiceView";
import { hpColors, PALETTE, pixelText } from "./client/render/theme";
import { BattleEngine } from "./game/battle/BattleEngine";
import { moveMeta } from "./game/battle/smogonCalc";
import type { BattleCommand, BattleEvent, BattleMonster, BattleMoveEvent, BattleOutcome, BattleSide, BattleStateView } from "./game/battle/types";
import { applyLearnset, applyLevelUps, createMonsterState, evolveIfReady, learnMoveIntoSlot, MAX_LEVEL, syncMonsterStateFromBattle, toBattleMonster, xpRewardForDefeating, type MonsterState, type PendingLearn } from "./game/state/monster";
import { attemptCapture, isDirectlyCapturable, type CaptureResult } from "./game/state/capture";
import { Rng } from "./game/state/rng";
import { createRunState, isBackpackFull, isEncounterCleared, markEncounterCleared, stashInBackpack, takeFromBackpack } from "./game/state/runState";
import { getAnimatedBattleSpriteUrl, getBattleSpriteUrl } from "./game/data/art";
import { createAnimatedBattler, type AnimatedBattler } from "./client/render/animatedBattler";
import "pixi.js/gif";
import { MOVES, type MoveId } from "./game/data/moves";
import { ITEMS, type ItemId } from "./game/data/items";
import { canUseItemOnMonster, equipHeldItem, teachTmIntoSlot, unequipHeldItem, useItemOnMonster } from "./game/state/items";
import { scrapItem, scrapValueOf } from "./game/state/pickup";
import { rollBattleRewards } from "./game/state/rewards";
import type { MonsterSpecies } from "./game/data/types";
import { SPECIES, type SpeciesId } from "./game/data/species";
import { loadTiledMap } from "./game/map/tiledMap";
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
  targetSide: BattleSide;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
};
/** How an active battler exits its slot when swapped out. */
type SpriteExitMode = "switchOut" | "faintOut" | "captureOut";
type PlaybackStep =
  | { kind: "text"; text: string; duration: number; elapsed: number }
  | { kind: "move"; event: BattleMoveEvent; duration: number; elapsed: number }
  | { kind: "hp"; tween: HpTween }
  | { kind: "spriteOut"; side: BattleSide; instanceId: string; mode: SpriteExitMode; duration: number; elapsed: number }
  | { kind: "spriteIn"; side: BattleSide; instanceId: string; duration: number; elapsed: number }
  | { kind: "capture"; foeId: string; shakes: number; captured: boolean; duration: number; elapsed: number };
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
  captureBall: Graphics;
  playerPanel: MonsterPanelView;
  foePanel: MonsterPanelView;
  dialog: BattleDialogView;
  controls: BattleControlsView;
};

// The authored Tiled scene, flattened by `scripts/build-map-assets.mjs` into a
// self-contained manifest under `public/assets/map/` (served in dev, bundled on
// build). `mapAssetBase` is where its tileset images live.
const mapAssetBase = "/assets/map/";
const { map: activeMap, manifest: mapManifest } = await loadTiledMap(`${mapAssetBase}sample-map.json`);

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

// Battle sprites are loaded lazily, on first use: animated GIFs decode when
// `animatedBattler` first shows them (the intro fade covers it), and the static
// PNG fallback loads via `Texture.from` when a battler mounts. With 93 species,
// preloading every front/back asset up front stalled startup (GIF decode is one
// frame each), so nothing sprite-related is preloaded now. (A streaming /
// decode-on-demand pass is planned.)
void document.fonts?.load('16px "Zpix"').catch(() => undefined);

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

/** Hard team-size cap; a capture beyond this forces a replace-or-release choice. */
const MAX_TEAM_SIZE = 3;

// Seeded RNG for run-level rolls (capture, …). Rebuilt from `runState.seed` so it
// stays deterministic; persisting its cursor rides along with the server-RNG work.
const rng = new Rng(runState.seed);

const root = new Container();
const sceneLayer = new Container();
app.stage.addChild(root);
root.addChild(sceneLayer);

const mapRender = await createTiledMapRenderView(
  activeMap,
  mapManifest,
  mapAssetBase,
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
// An item just picked up, awaiting the doc §11.1 decision (使用/携带/进背包/分解).
// Held "in hand" — not in the backpack — until the player resolves the prompt.
// Declared before the team HUD because its initial refresh reads it.
let pendingPickup: ItemId | null = null;
const teamHud: TeamHudView = createTeamHud(runState.player.team, {
  getBackpackItemId: () => runState.player.backpack as ItemId | undefined,
  canUseBackpackItemOn: (index) => {
    const itemId = runState.player.backpack as ItemId | undefined;
    const mon = playerRoster[index];
    return Boolean(itemId && mon && canUseItemOnMonster(mon, itemId));
  },
  onApplyBackpackItem: (index, action) => applyBackpackItem(index, action),
  onUnequipHeldItem: (index) => unequipBackpackItem(index),
  getPickupItemId: () => pendingPickup ?? undefined,
  canUsePickupItemOn: (index) => {
    const mon = playerRoster[index];
    return Boolean(pendingPickup && mon && canUseItemOnMonster(mon, pendingPickup));
  },
  pickupScrapValue: () => (pendingPickup ? scrapValueOf(pendingPickup) : 0),
  onApplyPickupItem: (index, action) => applyPickupItem(index, action),
  onStashPickup: () => stashPickup(),
  onScrapPickup: () => scrapPickup()
});
uiLayer.addChild(teamHud.bar, teamHud.overlay, teamHud.actionMenu);

// Roster-replace modal, shown when a capture lands on a full team.
const captureReplaceView: CaptureReplaceView = createCaptureReplaceView({
  onReplace: (index) => resolveCaptureReplace(index),
  onRelease: () => resolveCaptureRelease()
});
uiLayer.addChild(captureReplaceView.overlay);

// Move-learn modal, shown after battle when a level-up move can't auto-fit (4
// slots full). Queued per-monster and drained one at a time.
const moveLearnView: MoveLearnView = createMoveLearnView({
  onReplace: (slot) => resolveMoveLearn(slot),
  onSkip: () => resolveMoveLearnSkip()
});
uiLayer.addChild(moveLearnView.overlay);

// Post-battle 3-choose-1 reward modal; the picked item drops into the pickup
// decision flow (`pendingPickup`).
const rewardChoiceView: RewardChoiceView = createRewardChoiceView({
  onChoose: (index) => resolveBattleReward(index)
});
uiLayer.addChild(rewardChoiceView.overlay);

// Dev-only GM hooks for the item system (no inventory UI yet): equip a held item
// or use a stone/TM/medicine on a roster slot straight from the console, e.g.
// `gmEquip(0, "charcoal")`, `gmUseItem(0, "thunderStone")`. Stripped in prod.
if (import.meta.env.DEV) {
  type ItemWindow = typeof window & {
    gmEquip?: (slot: number, itemId: ItemId) => void;
    gmUseItem?: (slot: number, itemId: ItemId) => void;
    gmStash?: (itemId: ItemId) => void;
    gmPickup?: (itemId: ItemId) => void;
    gmReward?: () => void;
  };
  (window as ItemWindow).gmEquip = (slot, itemId) => {
    const mon = playerRoster[slot];
    if (!mon || !ITEMS[itemId]) {
      console.warn(`gmEquip: bad slot/item. Items: ${Object.keys(ITEMS).join(", ")}`);
      return;
    }
    equipHeldItem(mon, itemId);
    teamHud.refresh();
    console.log(`${SPECIES[mon.speciesId].name} 装备了 ${ITEMS[itemId].name}`);
  };
  (window as ItemWindow).gmUseItem = (slot, itemId) => {
    const mon = playerRoster[slot];
    if (!mon || !ITEMS[itemId]) {
      console.warn(`gmUseItem: bad slot/item. Items: ${Object.keys(ITEMS).join(", ")}`);
      return;
    }
    const result = useItemOnMonster(mon, itemId);
    teamHud.refresh();
    console.log("gmUseItem:", result);
  };
  (window as ItemWindow).gmStash = (itemId) => {
    if (!ITEMS[itemId]) {
      console.warn(`gmStash: unknown item. Items: ${Object.keys(ITEMS).join(", ")}`);
      return;
    }
    runState.player.backpack = itemId;
    teamHud.refresh();
    console.log(`背包放入了 ${ITEMS[itemId].name}（拖到宝可梦身上使用/携带）`);
  };
  (window as ItemWindow).gmPickup = (itemId) => {
    if (!ITEMS[itemId]) {
      console.warn(`gmPickup: unknown item. Items: ${Object.keys(ITEMS).join(", ")}`);
      return;
    }
    pendingPickup = itemId;
    teamHud.refresh();
    console.log(`捡到了 ${ITEMS[itemId].name}（拖到宝可梦使用/携带，或选收起/分解）`);
  };
  (window as ItemWindow).gmReward = () => {
    pendingReward = rollBattleRewards(rng);
    rewardChoiceView.open(pendingReward);
    console.log(`三选一奖励：${pendingReward.map((id) => ITEMS[id].name).join(" / ")}`);
  };
}

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
// One capture attempt per battle: set once the player throws, win or lose.
let captureUsed = false;
// After the active player mon faints with a live bench, the controls switch to a
// forced replacement pick (only party buttons act) until the player sends one in.
let awaitingReplacement = false;
// Whether the current foe is a boss/elite form — never directly capturable,
// regardless of its species' capture profile.
let activeFoeIsBoss = false;
// A landed capture that needs a roster slot freed; resolved by the replace modal
// once the battle playback has torn down and we are back on the map.
let pendingCapturedMonster: MonsterState | null = null;
// Level-up moves that couldn't auto-fit (4 slots full), awaiting the player's
// replace/skip decision; drained one at a time after the battle tears down.
const pendingLearns: PendingLearn[] = [];
// A TM dragged onto a full-moveset monster (from the backpack or a fresh pickup):
// the move-learn modal is open for it (on the map, not post-battle). Resolving it
// teaches the move and runs `onConsume` (drop the source item); skipping leaves
// the source item where it was.
let bagTmLearn: { instanceId: string; moveId: MoveId; onConsume: () => void } | null = null;
// The 3-choose-1 item options rolled on a battle win, awaiting the player's pick
// (drained last in the post-battle queue). The chosen item becomes a pickup.
let pendingReward: ItemId[] | null = null;
// Battle- materialized copy of `playerRoster`; index-aligned to it so final HP
// and status can be written back to the persistent state when the battle ends.
let battleTeam: BattleMonster[] | null = null;
let message = "点击地图移动，踩到标记进入 1v1 战斗。";
let playbackSteps: PlaybackStep[] = [];
let currentPlaybackStep: PlaybackStep | null = null;
let spriteAnimation: BattleSpriteAnimation | null = null;
let hpTween: HpTween | null = null;
let pendingOutcome: BattleOutcome = "ongoing";

// Per-side battler swap state. `instanceId` pins which roster member is drawn
// (sprite + status panel) so an exiting mon stays on screen until its leave
// animation finishes, instead of snapping to the live `battleView.active` the
// engine already advanced. `null` = follow the live active. `hidden` keeps a
// departed mon (post-faint / captured) off screen until a newcomer enters.
type BattlerFxState = {
  instanceId: string | null;
  hidden: boolean;
  transition: { kind: SpriteExitMode | "in"; elapsed: number; duration: number } | null;
};
const battlerFx: Record<BattleSide, BattlerFxState> = {
  player: { instanceId: null, hidden: false, transition: null },
  foe: { instanceId: null, hidden: false, transition: null }
};
function resetBattlerFx(): void {
  battlerFx.player = { instanceId: null, hidden: false, transition: null };
  battlerFx.foe = { instanceId: null, hidden: false, transition: null };
}

// Poké Ball capture sequence — original-style throw → absorb → drop+bounce →
// wobble → click/burst. Phase lengths (ms); `captureSequenceDuration` sums them
// for the playback step's total. The wobble count is the number of passed shake
// checks (3 = caught). `captureBall` is the live draw state the ball Graphics reads.
const CAPTURE_THROW_MS = 460;
const CAPTURE_ABSORB_MS = 500; // ~0.5s of the foe being drawn in
const CAPTURE_FALL_MS = 300; // ball drops from above the foe to the ground
// Four ground bounces, each lower and quicker than the last (tall, slow hops).
const CAPTURE_BOUNCES: ReadonlyArray<{ dur: number; peak: number }> = [
  { dur: 380, peak: 96 },
  { dur: 320, peak: 56 },
  { dur: 260, peak: 30 },
  { dur: 210, peak: 14 }
];
const CAPTURE_BOUNCE_MS = CAPTURE_FALL_MS + CAPTURE_BOUNCES.reduce((sum, hop) => sum + hop.dur, 0);
// Pause on the ground after the last bounce before the first shake check.
const CAPTURE_SETTLE_MS = 360;
// Each shake check gets a full 1s slot: a short tilt up front, then a pause to
// the next check. Caught plays all three; an escape stops after the failed one.
const CAPTURE_SHAKE_CYCLE_MS = 1000;
const CAPTURE_SHAKE_ANIM_MS = 420;
const CAPTURE_CLICK_MS = 560;
const CAPTURE_BURST_MS = 440;
function captureSequenceDuration(shakes: number, captured: boolean): number {
  const wobbles = captured ? 3 : shakes;
  return (
    CAPTURE_THROW_MS +
    CAPTURE_ABSORB_MS +
    CAPTURE_BOUNCE_MS +
    CAPTURE_SETTLE_MS +
    CAPTURE_SHAKE_CYCLE_MS * wobbles +
    (captured ? CAPTURE_CLICK_MS : CAPTURE_BURST_MS)
  );
}

/** Ball height during the drop + four decaying bounces (local ms into that phase). */
function captureBounceY(local: number, fromY: number, groundY: number): number {
  if (local < CAPTURE_FALL_MS) {
    const p = local / CAPTURE_FALL_MS;
    return lerp(fromY, groundY, p * p); // accelerating fall
  }
  let remaining = local - CAPTURE_FALL_MS;
  for (const hop of CAPTURE_BOUNCES) {
    if (remaining < hop.dur) {
      return groundY - hop.peak * Math.sin(Math.PI * (remaining / hop.dur));
    }
    remaining -= hop.dur;
  }
  return groundY;
}
type CaptureBallState = { visible: boolean; x: number; y: number; tilt: number; openness: number; flash: number };
const captureBall: CaptureBallState = { visible: false, x: 0, y: 0, tilt: 0, openness: 0, flash: 0 };
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
  if (x < 0 || y < 0 || x >= activeMap.width || y >= activeMap.height) {
    return true;
  }
  // Mirror pathfinding: an explicit collision grid (Tiled map) wins, else fall
  // back to the procedural map's per-tile `blocksMovement`.
  if (activeMap.collision) {
    return !!activeMap.collision[y]?.[x];
  }
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
  // Freeze the overworld while a post-battle decision modal is open.
  if (
    captureReplaceView.isOpen() ||
    moveLearnView.isOpen() ||
    rewardChoiceView.isOpen() ||
    teamHud.isItemMenuOpen() ||
    teamHud.isPickupOpen()
  ) {
    movePath = [];
    return;
  }

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
  resetBattlerFx();
  pendingOutcome = "ongoing";
  awaitingReplacement = false;
  transientUntil = 0;
  displayedHp.clear();
  battleIntroStart = elapsed;
  activeEncounterId = encounter.id;
  activeFoeLevel = encounter.level;
  captureUsed = false;
  activeFoeIsBoss = encounter.boss === true;
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
  if (!battle || !battleView || isPlaybackActive() || awaitingReplacement) {
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
  // After a faint, a party tap is a forced replacement (a free swap), not a turn.
  if (awaitingReplacement) {
    tryReplace(index);
    return;
  }
  const monster = battleView.player.roster[index];
  if (!monster || index === battleView.player.activeIndex || monster.currentHp <= 0) {
    return;
  }
  runBattleTurn({ type: "switch", targetIndex: index });
}

/** Send out a benched mon to replace the fainted active — a free swap, no foe turn. */
function tryReplace(index: number): void {
  if (!battle || !battleView || isPlaybackActive() || !awaitingReplacement) {
    return;
  }
  const monster = battleView.player.roster[index];
  if (!monster || index === battleView.player.activeIndex || monster.currentHp <= 0) {
    return;
  }
  const beforePlayerId = battleView.player.active.instanceId;
  const beforeFoeId = battleView.opponent.active.instanceId;
  const result = battle.promotePlayer(index);
  battleView = battle.view();
  pinDepartingActives(beforePlayerId, beforeFoeId);
  awaitingReplacement = false;
  queueBattlePlayback(result.events, result.outcome);
}

/**
 * Throw at the active foe. One attempt per battle (point 4): a miss burns the
 * chance and the foe must then be defeated. Elite/boss tiers can't be caught
 * directly. Resolves against the seeded run RNG; success returns to the map.
 */
function tryCapture(): void {
  if (!battle || !battleView || isPlaybackActive() || awaitingReplacement) {
    return;
  }
  if (captureUsed) {
    showTransientMessage("这场战斗的捕捉机会已经用过了。");
    return;
  }

  const foe = battleView.opponent.active;
  const profile = (SPECIES[foe.speciesId] as MonsterSpecies).capture;
  if (activeFoeIsBoss || !isDirectlyCapturable(profile)) {
    showTransientMessage(`${foe.name} 无法被直接捕捉！`);
    return;
  }

  captureUsed = true;
  captureDisplayedHp(battleView);
  const result = attemptCapture(
    { currentHp: foe.currentHp, maxHp: foe.maxHp, status: foe.status, capture: profile },
    rng
  );
  queueCapturePlayback(foe, result);
}

/**
 * Build the post-throw playback. A success is terminal and treated like a win
 * (encounter retired, return to map) plus an XP award (point 5); the catch is
 * added to the roster, or parked for the replace modal when the team is full.
 * A miss leaves the battle ongoing.
 */
function queueCapturePlayback(foe: BattleMonster, result: CaptureResult): void {
  playbackSteps = [];

  const captured = result.outcome === "captured";
  const shakes = result.outcome === "uncatchable" ? 0 : result.shakes;
  // The Poké Ball arc/absorb/wobble plays out first; the wobble count tells the
  // story (more shakes = a closer call) before it clicks shut or bursts open.
  playbackSteps.push({
    kind: "capture",
    foeId: foe.instanceId,
    shakes,
    captured,
    duration: captureSequenceDuration(shakes, captured),
    elapsed: 0
  });

  if (!captured) {
    pendingOutcome = "ongoing";
    playbackSteps.push({ kind: "text", text: `可恶！${foe.name} 挣脱了精灵球。`, duration: 760, elapsed: 0 });
    playbackSteps.push({ kind: "text", text: "这场战斗只能将它打倒了。", duration: 900, elapsed: 0 });
    return;
  }

  // Terminal: persist player HP, then treat the encounter as cleared on return.
  persistBattleResult();
  pendingOutcome = "player";
  playbackSteps.push({ kind: "text", text: `太好了！成功捕捉了 ${foe.name}！`, duration: 1000, elapsed: 0 });

  const reward = grantBattleXp();
  if (reward > 0) {
    playbackSteps.push({ kind: "text", text: `队伍每只获得了 ${reward} 经验！`, duration: 800, elapsed: 0 });
  }
  for (const text of applyTeamLevelUps()) {
    playbackSteps.push({ kind: "text", text, duration: 800, elapsed: 0 });
  }

  // Joins at the level it was caught at — what you see in the wild is what you
  // get (overrides doc §7.1's "team level - 1").
  const caught = createMonsterState(foe.speciesId, clamp(foe.level, 1, MAX_LEVEL));

  if (playerRoster.length < MAX_TEAM_SIZE) {
    playerRoster.push(caught);
    playbackSteps.push({ kind: "text", text: `${SPECIES[caught.speciesId].name} 加入了队伍！`, duration: 900, elapsed: 0 });
  } else {
    pendingCapturedMonster = caught;
    playbackSteps.push({ kind: "text", text: "队伍已满，需要决定它的去留。", duration: 900, elapsed: 0 });
  }
}

/** Swap the captured monster in for roster slot `index`; release the old one. */
function resolveCaptureReplace(index: number): void {
  const captured = pendingCapturedMonster;
  if (!captured || index < 0 || index >= playerRoster.length) {
    return;
  }
  const replaced = playerRoster[index];
  playerRoster[index] = captured;
  pendingCapturedMonster = null;
  captureReplaceView.close();
  teamHud.refresh();
  showTransientMessage(`${SPECIES[replaced.speciesId].name} 离队，${SPECIES[captured.speciesId].name} 加入了队伍！`);
  openNextPostBattleModal();
}

/** Let the catch go and keep the team as it stands. */
function resolveCaptureRelease(): void {
  const captured = pendingCapturedMonster;
  pendingCapturedMonster = null;
  captureReplaceView.close();
  if (captured) {
    showTransientMessage(`放走了 ${SPECIES[captured.speciesId].name}。`);
  }
  openNextPostBattleModal();
}

/** Teach the queued move into slot `index`, replacing what was there. */
function resolveMoveLearn(index: number): void {
  if (bagTmLearn) {
    const tm = bagTmLearn;
    bagTmLearn = null;
    moveLearnView.close();
    const monster = playerRoster.find((m) => m.instanceId === tm.instanceId);
    if (monster) {
      const forgotten = monster.moves[index];
      if (teachTmIntoSlot(monster, tm.moveId, index)) {
        tm.onConsume();
        teamHud.refresh();
        showTransientMessage(
          `${SPECIES[monster.speciesId].name} 忘记了 ${MOVES[forgotten].name}，学会了 ${MOVES[tm.moveId].name}！`
        );
      }
    }
    return;
  }
  const learn = pendingLearns.shift();
  moveLearnView.close();
  if (learn) {
    const monster = playerRoster.find((m) => m.instanceId === learn.instanceId);
    if (monster) {
      const forgotten = monster.moves[index];
      if (learnMoveIntoSlot(monster, learn.moveId, index)) {
        teamHud.refresh();
        showTransientMessage(
          `${SPECIES[monster.speciesId].name} 忘记了 ${MOVES[forgotten].name}，学会了 ${MOVES[learn.moveId].name}！`
        );
      }
    }
  }
  openNextPostBattleModal();
}

/** Give up the queued move; the moveset stays as-is. */
function resolveMoveLearnSkip(): void {
  if (bagTmLearn) {
    const tm = bagTmLearn;
    bagTmLearn = null;
    moveLearnView.close();
    showTransientMessage(`放弃了学习 ${MOVES[tm.moveId].name}。`);
    return;
  }
  const learn = pendingLearns.shift();
  moveLearnView.close();
  if (learn) {
    showTransientMessage(`放弃了学习 ${MOVES[learn.moveId].name}。`);
  }
  openNextPostBattleModal();
}

/**
 * The player dropped the single backpack item on roster slot `index` and chose
 * to 使用 (use) or 携带 (equip) it. Routes through the item-system logic, consumes
 * the backpack slot on success, and chains the TM move-learn modal when a TM's
 * four slots are full.
 */
function applyBackpackItem(index: number, action: "use" | "equip"): void {
  const itemId = runState.player.backpack as ItemId | undefined;
  const mon = playerRoster[index];
  if (!itemId || !mon) {
    return;
  }

  if (action === "equip") {
    // Swap the backpack item with whatever the monster was holding (the old
    // held item lands back in the now-free backpack slot).
    const prev = equipHeldItem(mon, itemId);
    takeFromBackpack(runState);
    if (prev) {
      stashInBackpack(runState, prev);
    }
    teamHud.refresh();
    showTransientMessage(
      prev
        ? `${SPECIES[mon.speciesId].name} 改为携带 ${ITEMS[itemId].name}。`
        : `${SPECIES[mon.speciesId].name} 携带了 ${ITEMS[itemId].name}。`
    );
    return;
  }

  const result = useItemOnMonster(mon, itemId);
  if (!result.ok) {
    showTransientMessage(result.reason);
    return;
  }

  if (result.consumed) {
    takeFromBackpack(runState);
  }
  teamHud.refresh();

  switch (result.kind) {
    case "evolved":
      showTransientMessage(
        `${SPECIES[result.fromSpeciesId].name} 进化成了 ${SPECIES[result.toSpeciesId].name}！`
      );
      break;
    case "learned":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 学会了 ${MOVES[result.moveId].name}！`);
      break;
    case "learnChoice":
      // Four slots full — open the replace modal; the item is consumed only if
      // the player actually learns it (handled in resolveMoveLearn).
      bagTmLearn = {
        instanceId: mon.instanceId,
        moveId: result.moveId,
        onConsume: () => takeFromBackpack(runState)
      };
      moveLearnView.open(mon, result.moveId);
      break;
    case "healed":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 回复了 ${result.amount} 点体力。`);
      break;
    case "revived":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 恢复了精神！`);
      break;
  }
}

/**
 * Resolve a pickup (doc §11.1) by dropping the in-hand item on roster slot
 * `index` and choosing 使用 / 携带. Mirrors {@link applyBackpackItem} but the item
 * lives in `pendingPickup` (not the backpack), so it is cleared — not taken from
 * the backpack — on success. 携带 onto a monster that already holds something
 * displaces the old item into the backpack (rejected if the backpack is full).
 */
function applyPickupItem(index: number, action: "use" | "equip"): void {
  const itemId = pendingPickup;
  const mon = playerRoster[index];
  if (!itemId || !mon) {
    return;
  }

  if (action === "equip") {
    if (mon.heldItem && isBackpackFull(runState)) {
      showTransientMessage("背包已满，无法替换它携带的道具。");
      return;
    }
    const prev = equipHeldItem(mon, itemId);
    pendingPickup = null;
    if (prev) {
      stashInBackpack(runState, prev);
    }
    teamHud.refresh();
    showTransientMessage(
      prev
        ? `${SPECIES[mon.speciesId].name} 改为携带 ${ITEMS[itemId].name}（原道具进背包）。`
        : `${SPECIES[mon.speciesId].name} 携带了 ${ITEMS[itemId].name}。`
    );
    return;
  }

  const result = useItemOnMonster(mon, itemId);
  if (!result.ok) {
    showTransientMessage(result.reason);
    return;
  }

  if (result.consumed) {
    pendingPickup = null;
  }
  teamHud.refresh();

  switch (result.kind) {
    case "evolved":
      showTransientMessage(
        `${SPECIES[result.fromSpeciesId].name} 进化成了 ${SPECIES[result.toSpeciesId].name}！`
      );
      break;
    case "learned":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 学会了 ${MOVES[result.moveId].name}！`);
      break;
    case "learnChoice":
      // Four slots full — open the replace modal; the pickup is cleared only if
      // the player actually learns it (handled in resolveMoveLearn).
      bagTmLearn = {
        instanceId: mon.instanceId,
        moveId: result.moveId,
        onConsume: () => {
          pendingPickup = null;
        }
      };
      moveLearnView.open(mon, result.moveId);
      break;
    case "healed":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 回复了 ${result.amount} 点体力。`);
      break;
    case "revived":
      showTransientMessage(`${SPECIES[mon.speciesId].name} 恢复了精神！`);
      break;
  }
}

/** Resolve a pickup by stashing the in-hand item in the single backpack slot. */
function stashPickup(): void {
  if (!pendingPickup) {
    return;
  }
  if (!stashInBackpack(runState, pendingPickup)) {
    showTransientMessage("背包已经满了。");
    return;
  }
  const stashed = pendingPickup;
  pendingPickup = null;
  teamHud.refresh();
  showTransientMessage(`${ITEMS[stashed].name} 放入了背包。`);
}

/** Resolve a pickup by disassembling the in-hand item into coins (doc §11). */
function scrapPickup(): void {
  if (!pendingPickup) {
    return;
  }
  const scrapped = pendingPickup;
  const gain = scrapItem(runState, scrapped);
  pendingPickup = null;
  teamHud.refresh();
  showTransientMessage(`分解了 ${ITEMS[scrapped].name}，获得 ${gain} 金币（共 ${runState.player.coins ?? 0}）。`);
}

/**
 * The player dragged roster slot `index` onto the empty backpack slot to take
 * its held item off. The freed item lands in the (guaranteed-empty) backpack.
 */
function unequipBackpackItem(index: number): void {
  const mon = playerRoster[index];
  if (!mon || !mon.heldItem || isBackpackFull(runState)) {
    return;
  }
  const removed = unequipHeldItem(mon);
  if (removed) {
    stashInBackpack(runState, removed);
    teamHud.refresh();
    showTransientMessage(`取下了 ${SPECIES[mon.speciesId].name} 携带的 ${ITEMS[removed as ItemId].name}。`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  // Snapshot who is active *before* the turn: the engine advances the active
  // slot synchronously, so without pinning the outgoing mon the renderer would
  // flash the incoming one for a few frames before the swap animation plays.
  const beforePlayerId = battleView.player.active.instanceId;
  const beforeFoeId = battleView.opponent.active.instanceId;
  const result = battle.runTurn(command);
  battleView = battle.view();
  pinDepartingActives(beforePlayerId, beforeFoeId);
  // A fainted active with a live bench hands control to the replacement picker
  // once this turn's playback (including the faint-out) finishes.
  awaitingReplacement = battle.needsPlayerReplacement();
  queueBattlePlayback(result.events, result.outcome);
}

/** Keep the renderer on each side's pre-turn active until the swap steps take over. */
function pinDepartingActives(prevPlayerId: string, prevFoeId: string): void {
  if (!battleView) {
    return;
  }
  if (battleView.player.active.instanceId !== prevPlayerId) {
    battlerFx.player.instanceId = prevPlayerId;
  }
  if (battleView.opponent.active.instanceId !== prevFoeId) {
    battlerFx.foe.instanceId = prevFoeId;
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

/**
 * Spend freshly-earned XP into level-ups, returning a message per level gained.
 * Also teaches level-up moves: ones that fit a free slot are learned inline
 * (with a message); ones that don't are queued on `pendingLearns` for a
 * post-battle replace/skip decision.
 */
function applyTeamLevelUps(): string[] {
  const messages: string[] = [];
  for (const monster of playerRoster) {
    const fromLevel = monster.level;
    const result = applyLevelUps(monster);
    if (!result.leveledUp) {
      continue;
    }
    messages.push(`${SPECIES[monster.speciesId].name} 升到了 Lv.${result.to}！`);
    const evo = evolveIfReady(monster);
    if (evo.evolved) {
      messages.push(`咦……？${SPECIES[evo.fromSpeciesId].name} 进化成了 ${SPECIES[evo.toSpeciesId].name}！`);
    }
    const { learned, pending } = applyLearnset(monster, fromLevel);
    for (const moveId of learned) {
      messages.push(`${SPECIES[monster.speciesId].name} 学会了 ${MOVES[moveId].name}！`);
    }
    for (const moveId of pending) {
      pendingLearns.push({ instanceId: monster.instanceId, speciesId: monster.speciesId, moveId });
      messages.push(`${SPECIES[monster.speciesId].name} 想学会 ${MOVES[moveId].name}，战斗后再决定。`);
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
        targetSide: event.targetSide,
        from: event.hpBefore,
        to: event.hpAfter,
        elapsed: 0,
        duration: 520
      }
    });
    if (event.fainted) {
      // The hit has landed and HP has drained; now the downed mon falls away.
      // The matching switch-in plays later off the engine's promote event.
      steps.push({ kind: "spriteOut", side: event.targetSide, instanceId: event.targetId, mode: "faintOut", duration: 480, elapsed: 0 });
      steps.push({ kind: "text", text: `${event.targetName} 倒下了。`, duration: 620, elapsed: 0 });
    }
    return steps;
  }

  if (event.type === "switch") {
    const steps: PlaybackStep[] = [{ kind: "text", text: event.text, duration: 380, elapsed: 0 }];
    // A deliberate recall pulls the old mon back first; a post-faint promote
    // skips that (the fainted mon already animated out).
    if (event.reason === "switch" && event.fromId) {
      steps.push({ kind: "spriteOut", side: event.side, instanceId: event.fromId, mode: "switchOut", duration: 320, elapsed: 0 });
    }
    steps.push({ kind: "spriteIn", side: event.side, instanceId: event.toId, duration: 380, elapsed: 0 });
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

  if (currentPlaybackStep.kind === "capture") {
    updateCaptureStep(currentPlaybackStep, deltaMs);
    return;
  }

  if (currentPlaybackStep.kind === "spriteOut" || currentPlaybackStep.kind === "spriteIn") {
    currentPlaybackStep.elapsed += deltaMs;
    const fx = battlerFx[currentPlaybackStep.side];
    if (fx.transition) {
      fx.transition.elapsed = currentPlaybackStep.elapsed;
    }
    if (currentPlaybackStep.elapsed >= currentPlaybackStep.duration) {
      fx.transition = null;
      if (currentPlaybackStep.kind === "spriteOut") {
        fx.hidden = true; // gone — stay off screen until a newcomer enters
      } else {
        fx.hidden = false;
        fx.instanceId = null; // settled in: follow the live active again
      }
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
  if (step.kind === "spriteOut") {
    battlerFx[step.side] = { instanceId: step.instanceId, hidden: false, transition: { kind: step.mode, elapsed: 0, duration: step.duration } };
  }
  if (step.kind === "spriteIn") {
    battlerFx[step.side] = { instanceId: step.instanceId, hidden: false, transition: { kind: "in", elapsed: 0, duration: step.duration } };
  }
  if (step.kind === "capture") {
    message = "投出了精灵球！";
    captureBall.visible = false;
  }
  if (step.kind === "hp") {
    // A lethal drain pins the dying mon on screen (sprite + panel) for the whole
    // bar animation, even though the engine already advanced the active slot —
    // otherwise the newcomer would flash in before the faint-out plays.
    if (step.tween.to <= 0) {
      battlerFx[step.tween.targetSide].instanceId = step.tween.targetId;
    }
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
    // Every won battle offers a 3-choose-1 reward (drained last, after capture /
    // move-learn decisions). The pick drops into the pickup decision flow.
    if (pendingOutcome === "player") {
      pendingReward = rollBattleRewards(rng);
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

    // Raise any post-battle decisions over the map (capture slot, then move
    // learns), one at a time.
    openNextPostBattleModal();
  }
}

/**
 * Drain the post-battle decision queue one modal at a time: first a full-team
 * capture slot, then each queued move-learn. Each resolver calls back here when
 * it closes, so the modals chain until the queue is empty and the map unfreezes.
 */
function openNextPostBattleModal(): void {
  if (pendingCapturedMonster) {
    captureReplaceView.open(pendingCapturedMonster, playerRoster);
    return;
  }
  const next = pendingLearns[0];
  if (next) {
    const monster = playerRoster.find((m) => m.instanceId === next.instanceId);
    // The monster may have left the team (e.g. replaced by a capture); drop the
    // stale learn and move on.
    if (!monster) {
      pendingLearns.shift();
      openNextPostBattleModal();
      return;
    }
    moveLearnView.open(monster, next.moveId);
    return;
  }
  // Last: the battle reward 3-choose-1. The pick becomes a pickup decision, which
  // is map-driven (the pickup prompt), so nothing else queues after it.
  if (pendingReward) {
    rewardChoiceView.open(pendingReward);
  }
}

/**
 * The player picked reward option `index`. The chosen item drops into the pickup
 * decision flow (`pendingPickup`), so the pickup prompt opens over the map.
 */
function resolveBattleReward(index: number): void {
  const options = pendingReward;
  rewardChoiceView.close();
  if (!options || index < 0 || index >= options.length) {
    pendingReward = null;
    return;
  }
  const chosen = options[index];
  pendingReward = null;
  pendingPickup = chosen;
  teamHud.refresh();
  showTransientMessage(`选择了 ${ITEMS[chosen].name}。`);
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
  // Drawn in front of the battlers so the thrown ball reads over the foe sprite.
  const captureBallGraphic = new Graphics();

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
    captureBallGraphic,
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
    captureBall: captureBallGraphic,
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

  // Draw the *pinned* battler when a swap is animating (an exiting mon, or a
  // newcomer mid-entrance), else the live active.
  const player = shownMonster("player", battleView.player.active);
  const foe = shownMonster("foe", battleView.opponent.active);
  const playerSprite = getSpriteRenderTuning(player.speciesId, "back", "player");
  const foeSprite = getSpriteRenderTuning(foe.speciesId, "front", "foe");
  updateBattleSprite(battleRender.playerShadow, battleRender.playerBattler, battleRender.playerSprite, player.speciesId, "back", "player", playerSprite.x, playerSprite.y, playerSprite.scale);
  updateBattleSprite(battleRender.foeShadow, battleRender.foeBattler, battleRender.foeSprite, foe.speciesId, "front", "foe", foeSprite.x, foeSprite.y, foeSprite.scale);
  updateMoveAnimation();
  drawCaptureBall();

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

// The static PNG fallback streams through the Showdown proxy and may not be in
// the texture cache yet, so resolving it via `Texture.from` (sync, cache-only)
// logs a Pixi "not found in Cache" warning every frame. Load through
// `Assets.load` instead (cache hit is immediate once decoded) and only request
// when the URL actually changes, then assign on resolve.
const fallbackSpriteUrl = new WeakMap<Sprite, string>();

function setFallbackTexture(sprite: Sprite, url: string): void {
  if (fallbackSpriteUrl.get(sprite) === url) {
    return;
  }
  fallbackSpriteUrl.set(sprite, url);
  void Assets.load<Texture>(url)
    .then((texture) => {
      // Guard against a species switch that happened while loading.
      if (fallbackSpriteUrl.get(sprite) === url) {
        sprite.texture = texture;
      }
    })
    .catch(() => undefined);
}

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
  setFallbackTexture(fallback, getBattleSpriteUrl(speciesId, facing));
  battler.request(getAnimatedBattleSpriteUrl(speciesId, facing));

  const node = battler.active();
  const isAnimated = node !== fallback;
  const scale = isAnimated ? ANI_SPRITE_SCALE[facing] : staticScale;

  // ani: ground on the platform centre. Static fallback: keep the gen5 foot line `y`.
  const layoutSide = side === "player" ? "player" : "foe";
  const groundY = isAnimated ? BATTLE_LAYOUT[layoutSide].platform.y + ANI_FOOT_NUDGE[facing] : y + 6;

  // Swap-in/out animation transform (slide, shrink, fade) layered on top of the
  // resting pose so a retreating or entering battler reads as a transition.
  const tf = getBattlerTransform(side);
  node.scale.set(scale * tf.scaleMul);
  node.x = x + offset.x + introSlide + tf.dx;
  node.y = (isAnimated ? groundY : y) + offset.y + bob + tf.dy;
  node.alpha = intro * tf.alpha;

  shadow.clear();
  const shadowRx = battler.naturalSize().width * scale * tf.scaleMul * 0.25;
  // Shadow sits at the ground line (platform centre for ani) under the feet; it
  // intentionally ignores `bob` so it stays planted while the sprite bounces.
  shadow.ellipse(x + offset.x + introSlide + tf.dx, groundY, shadowRx, shadowRx * 0.32).fill({ color: "#243018", alpha: 0.32 * intro * tf.alpha });
}

/** The battler the renderer should draw for `side`: the pinned swap target, or the live active. */
function shownMonster(side: BattleSide, live: BattleMonster): BattleMonster {
  const id = battlerFx[side].instanceId;
  if (id === null || !battleView) {
    return live;
  }
  const roster = side === "player" ? battleView.player.roster : battleView.opponent.roster;
  return roster.find((monster) => monster.instanceId === id) ?? live;
}

/** Position/scale/alpha delta for the active swap transition on `side` (identity when idle). */
function getBattlerTransform(side: BattleSide): { dx: number; dy: number; scaleMul: number; alpha: number } {
  const fx = battlerFx[side];
  const transition = fx.transition;
  if (!transition) {
    return { dx: 0, dy: 0, scaleMul: 1, alpha: fx.hidden ? 0 : 1 };
  }

  const p = clamp01(transition.elapsed / transition.duration);
  if (transition.kind === "in") {
    const e = easeOutCubic(p);
    return { dx: 0, dy: (1 - e) * 46, scaleMul: 0.5 + 0.5 * e, alpha: e };
  }
  if (transition.kind === "faintOut") {
    // Sink straight down while fading — the classic faint slump.
    return { dx: 0, dy: p * 66, scaleMul: 1, alpha: 1 - p };
  }
  if (transition.kind === "captureOut") {
    // Absorbed into the ball: shrink toward a point and wink out.
    const e = p * p;
    return { dx: 0, dy: -p * 6, scaleMul: 1 - 0.92 * e, alpha: 1 - e };
  }
  // switchOut: drop and shrink back to the trainer.
  return { dx: 0, dy: p * 42, scaleMul: 1 - 0.4 * p, alpha: 1 - p };
}

/**
 * Drive the Poké Ball capture timeline for one frame: throw arc, absorb the foe,
 * drop to the platform, wobble once per passed shake check, then click shut
 * (caught) or burst open (the foe pops back out). Mutates `captureBall` (drawn by
 * `drawCaptureBall`) and `battlerFx.foe` (the foe sprite's shrink/hide/return).
 */
function updateCaptureStep(step: Extract<PlaybackStep, { kind: "capture" }>, deltaMs: number): void {
  step.elapsed += deltaMs;
  const t = step.elapsed;
  const wobbles = step.captured ? 3 : step.shakes;

  const foePos = getBattleSpritePosition("foe");
  const playerPos = getBattleSpritePosition("player");
  const origin = { x: playerPos.x, y: playerPos.y - 90 };
  const ground = { x: foePos.x, y: BATTLE_LAYOUT.foe.platform.y - 12 };
  // Throw comes to rest above the foe, clearly higher than the first bounce peak.
  const hover = { x: foePos.x, y: ground.y - (CAPTURE_BOUNCES[0].peak + 56) };

  const tAbsorb = CAPTURE_THROW_MS;
  const tBounce = tAbsorb + CAPTURE_ABSORB_MS;
  const tSettle = tBounce + CAPTURE_BOUNCE_MS;
  const tShake = tSettle + CAPTURE_SETTLE_MS;
  const tFinish = tShake + CAPTURE_SHAKE_CYCLE_MS * wobbles;

  captureBall.visible = true;
  captureBall.tilt = 0;
  captureBall.openness = 0;
  captureBall.flash = 0;
  const pinned: BattlerFxState = { instanceId: step.foeId, hidden: true, transition: null };

  if (t < tAbsorb) {
    // Throw: a tall lobbed arc that comes to rest above the foe.
    const p = clamp01(t / CAPTURE_THROW_MS);
    captureBall.x = lerp(origin.x, hover.x, p);
    captureBall.y = lerp(origin.y, hover.y, p) - Math.sin(p * Math.PI) * 150;
    captureBall.tilt = p * Math.PI * 3;
    battlerFx.foe = { instanceId: step.foeId, hidden: false, transition: null };
  } else if (t < tBounce) {
    // Absorb (~0.5s): ball opens and the foe is drawn in.
    const local = t - tAbsorb;
    const p = clamp01(local / CAPTURE_ABSORB_MS);
    captureBall.x = hover.x;
    captureBall.y = hover.y;
    captureBall.openness = p < 0.6 ? p / 0.6 : 1 - (p - 0.6) / 0.4;
    captureBall.flash = Math.sin(p * Math.PI) * 0.85;
    battlerFx.foe = { instanceId: step.foeId, hidden: false, transition: { kind: "captureOut", elapsed: local, duration: CAPTURE_ABSORB_MS } };
  } else if (t < tSettle) {
    // Drop and bounce four times, each lower than the last.
    captureBall.x = ground.x;
    captureBall.y = captureBounceY(t - tBounce, hover.y, ground.y);
    battlerFx.foe = pinned;
  } else if (t < tShake) {
    // Rest on the ground briefly before the first shake.
    captureBall.x = ground.x;
    captureBall.y = ground.y;
    battlerFx.foe = pinned;
  } else if (t < tFinish) {
    // One shake check per second: a short tilt, then a pause to the next check.
    const local = t - tShake;
    const index = Math.floor(local / CAPTURE_SHAKE_CYCLE_MS);
    const inCycle = local - index * CAPTURE_SHAKE_CYCLE_MS;
    captureBall.x = ground.x;
    captureBall.y = ground.y;
    if (inCycle < CAPTURE_SHAKE_ANIM_MS) {
      const wp = inCycle / CAPTURE_SHAKE_ANIM_MS;
      const dir = index % 2 === 0 ? 1 : -1;
      captureBall.tilt = Math.sin(wp * Math.PI) * 0.5 * dir;
    }
    battlerFx.foe = pinned;
  } else if (step.captured) {
    // Click shut: a quick confirming sparkle, then it rests.
    const p = clamp01((t - tFinish) / CAPTURE_CLICK_MS);
    captureBall.x = ground.x;
    captureBall.y = ground.y;
    captureBall.flash = p < 0.25 ? p / 0.25 : Math.max(0, 1 - (p - 0.25) / 0.5);
    battlerFx.foe = pinned;
  } else {
    // Burst open: ball flashes wide, vanishes, foe springs back out.
    const p = clamp01((t - tFinish) / CAPTURE_BURST_MS);
    captureBall.x = ground.x;
    captureBall.y = ground.y;
    captureBall.openness = clamp01(p / 0.3);
    captureBall.flash = p < 0.3 ? p / 0.3 : 0;
    captureBall.visible = p < 0.45;
    battlerFx.foe = { instanceId: step.foeId, hidden: false, transition: { kind: "in", elapsed: t - tFinish, duration: CAPTURE_BURST_MS } };
  }

  if (step.elapsed >= step.duration) {
    captureBall.visible = false;
    battlerFx.foe = step.captured
      ? { instanceId: step.foeId, hidden: true, transition: null }
      : { instanceId: null, hidden: false, transition: null };
    currentPlaybackStep = null;
  }
}

const CAPTURE_BALL_RADIUS = 15;
function drawCaptureBall(): void {
  const g = battleRender.captureBall;
  g.clear();
  if (!captureBall.visible) {
    return;
  }
  g.position.set(captureBall.x, captureBall.y);
  g.rotation = captureBall.tilt;
  const r = CAPTURE_BALL_RADIUS;

  // Top dome (red) — semicircle over the top, closed across the diameter.
  g.arc(0, 0, r, Math.PI, Math.PI * 2).lineTo(-r, 0).fill(0xe6473b);
  // Bottom dome (off-white).
  g.arc(0, 0, r, 0, Math.PI).lineTo(r, 0).fill(0xf2f2f4);
  // Black band + outline.
  g.rect(-r, -2.6, r * 2, 5.2).fill(0x1e1e26);
  g.circle(0, 0, r).stroke({ color: 0x1e1e26, width: 2 });
  // Center button.
  g.circle(0, 0, 5).fill(0xf2f2f4).stroke({ color: 0x1e1e26, width: 2 });
  g.circle(0, 0, 2.4).fill(0xb9b9c4);
  // Energy glow while open, and a click/burst flash ring.
  if (captureBall.openness > 0) {
    g.circle(0, 0, r * 0.7).fill({ color: 0xfff2bf, alpha: 0.75 * captureBall.openness });
  }
  if (captureBall.flash > 0) {
    g.circle(0, 0, r + 5 + captureBall.flash * 12).fill({ color: 0xffffff, alpha: 0.5 * captureBall.flash });
  }
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
    battleRender.controls.update(battleView, getDisplayedHp, awaitingReplacement);
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
  const tuning = (SPECIES[speciesId] as MonsterSpecies).spriteAnchors?.[facing];
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
