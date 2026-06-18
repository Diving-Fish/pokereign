# Pokereign Progress

## Current Direction

- Non-commercial Pokemon fangame prototype.
- Browser game built with TypeScript, PixiJS, and Vite.
- Map uses a GBA-like tile exploration layer.
- Map shows trainers and visible encounters, not Pokemon.
- Entering an encounter switches to a separate turn-based battle scene.
- First battle scope is 1v1 with switching.
- Boss battles are planned as 1v-many raid-style encounters later.

## Implemented

### Input Model (Mouse-first + hotkeys)

The game is mouse/touch-first, with keyboard shortcuts as accelerators. The
low-level clickable component is built on PixiJS **pointer** events, which the
federated event system normalizes across mouse, touch, and pen — so the same UI
works on desktop today and a future PC/mobile build with no input rewrite.

- Reusable button component: `src/client/render/button.ts` (`createButton`).
  Layered pixel-bevel frame with hover / press / disabled states, a tweakable
  accent + face gradient, and a `content` layer callers fill with labels/icons.
  Input is `pointertap` (fires once for both a mouse click and a touch tap),
  plus `pointerover/out/down/up` for visual states.
- Map exploration is click/tap-to-walk:
  - Tapping a tile runs a bounded BFS (`src/game/map/pathfinding.ts`,
    `findPath`, capped at `MAX_PATH_SEARCH_NODES = 6000`) and auto-walks the
    shortest 4-dir path; far/unreachable taps are ignored so clicks never stall
    on the 200x200 field.
  - The viewport is the hit target (world-sized `hitArea`, `toWorld` undoes the
    camera transform). Keyboard WASD/arrows still work and cancel the active
    path for manual override.
  - The active path is drawn as an overlay (`updateMapPathOverlay` in
    `src/client/render/mapView.ts`): a trail line from the player through each
    queued tile, gold waypoint dots, and a pulsing destination ring. It glides
    with the player and clears on arrival / manual override.
- Battle uses a clickable control bar (`src/client/render/battleControls.ts`,
  `createBattleControls`) that replaces the old text menu:
  - Top row: four move buttons (tiled), each tinted by its element type with a
    type pill (localized) and a damage-category glyph (physical = diamond,
    special = ring, status = square). Hotkeys `Q/W/E/R`.
  - Bottom row (narrower): three party buttons (name, Lv, mini HP bar, 出战/倒下
    tag) plus a Poké Ball **capture** button. Switch hotkeys `1/2/3`.
  - Capture is a styled placeholder (capture isn't implemented yet); tapping it
    shows a brief banner. Party buttons disable when the slot is active/fainted.
  - The control bar shows during the player's turn; the message line takes over
    during event playback (and the capture banner).
  - New theme helpers back the look: `TYPE_COLORS`/`typeColor`,
    `CATEGORY_COLORS`/`categoryColor`, `adjustColor`, and button palette keys in
    `src/client/render/theme.ts`.

### Project Setup

- Vite + TypeScript + PixiJS project scaffold.
- Fixed logical game resolution: `960x540`.
- Canvas scales to fit browser window while preserving game coordinates.
- `npm run dev`, `npm run build`, and `npm run preview` scripts.

### Sprite Assets

- Battle Pokemon sprites load through a local Vite proxy:
  - Front sprites: `/pokemon-sprites/gen5/{slug}.png`
  - Back sprites: `/pokemon-sprites/gen5-back/{slug}.png`
- Proxy forwards to Pokemon Showdown to avoid browser CORS/WebGL texture issues.
- Species data contains `spriteSlug` and per-facing `spriteAnchors` for alignment.

### Map Prototype

- Data-driven map schema under `src/game/map`.
- Prototype map stored in `src/game/map/prototypeMap.ts`: now a 200x200 field
  (the design-doc target size) generated deterministically (seeded LCG) with a
  walled border, scattered long-grass/rock/dirt, crossroads through spawn, and
  ~60 scattered visible encounters. Spawn is map center `(100, 100)`.
- Tile definitions include collision metadata.
- Player movement is grid-locked and smooth: one tile per step, no diagonals
  (horizontal wins when both axes are held), 250 ms per tile = 4 tiles/sec
  (tuned up from the design doc's 2.5). The on-screen position is interpolated across each step
  (`renderPos`), and held keys chain steps with leftover-time carryover so
  walking is a steady glide. Encounters trigger on step arrival. The camera
  follows `renderPos`, so it glides too.
- Map objects support visible encounter objects.
- Tile textures are baked into a single canvas atlas (`tileTextures.ts`): each
  tile is drawn with `Graphics`, extracted to a canvas via `extract.canvas`, and
  composited into one `CanvasSource`; tile Textures are frames of that source.
  One shared base texture keeps the map to a single draw call and stays crisp
  with `scaleMode: "nearest"`.
- IMPORTANT `@pixi/tilemap` gotcha: a single `Tilemap` shares one quad index
  buffer that defaults to **16-bit** indices, capping at ~16K tiles (65536/4).
  Our 200x200 map has 40K tiles, so it silently overflowed and rendered only the
  first ~16K — which, with the camera centered at row 100, was entirely
  off-screen, so the map looked all-black. Fixed by setting
  `settings.use32bitIndex = true` (in `mapView.ts`, before the pipe builds);
  WebGL2 and WebGPU both support 32-bit indices. Verified in-browser via the
  chrome-devtools MCP. (The canvas atlas was not the fix — it is an independent
  cleanup; an earlier note wrongly blamed RenderTextures.)
- Tiles render through `@pixi/tilemap` `CompositeTilemap`: the whole ground layer
  is filled once into a batched tilemap (a few draw calls regardless of tile
  count), so this scales to the target 200x200 maps. Replaced the old per-tile
  `new Sprite` loop.
- Camera uses `pixi-viewport` (`Viewport`), following the player via
  `moveCenter` with `clamp({ direction: "all", underflow: "center" })` so it
  stays inside the map (and centers maps smaller than the screen). Replaced the
  old manual `world.x/y` centering.
- Map render code lives in `src/client/render/mapView.ts`
  (`createMapRenderView` / `updateMapRenderView`), mirroring the battle render
  module split. Scene visibility toggling moved to the `main.ts` ticker.

### Run State (server-sync foundation)

This is being built for a future server-authoritative model: the server will own
the run state, so it must stay plain and serializable.

- Sync design rules:
  1. Store only **source-of-truth** fields; recompute derived values locally so
     they never desync and stay out of the sync payload.
  2. State transitions go through pure functions that return events (the battle
     engine already returns events); render code never mutates authoritative
     state directly.
  3. Determinism: seeded RNG + stable ids (not yet done — see follow-ups).
- Slice A (done): `src/game/state/monster.ts` introduces `MonsterState`, the
  authoritative serializable monster: `instanceId, speciesId, level, xp, ivs,
  evs, nature, status, currentHp, moves`. Derived fields (`stats, maxHp,
  calcLevel, types, name`) are NOT stored — `toBattleMonster(state, side)`
  recomputes them for battle, and `syncMonsterStateFromBattle` writes HP/status
  back afterward. `evs` is stored per-monster (flat 85 for now) so a future EV
  system needs no calc/plumbing changes. `createMonster.ts` was removed; the
  player roster is now `MonsterState[]`, materialized per battle and written back
  on battle end. `computeStats`/`smogonCalc` take `evs` as a parameter.
- Slice B (done): `src/game/state/runState.ts` introduces `RunState`, the full
  serializable run snapshot the server will own: `seed, mapId,
  clearedEncounterIds, player{ position, team }`. `main.ts` reads/writes the
  player team and position through it (`playerRoster` is just an alias onto
  `player.team`). `src/game/state/rng.ts` adds a seeded `Rng` (deterministic
  LCG; only `state` is serializable) for the damage-roll / sync follow-ups —
  not wired in yet.
- Slice C (done): on a battle win the encounter id is recorded in
  `clearedEncounterIds` and its map marker removed (`removeEncounterMarker`).
  Cleared tiles no longer re-trigger battles, and `createMapRenderView` skips
  already-cleared markers when built (so a resumed run renders correctly).
- Slice D (done): defeating a foe awards level-based XP
  (`xpRewardForDefeating`) to every surviving team member (full amount each,
  party-wide), written onto the roster with a reward line in the victory
  sequence.
- Slice E (done): `applyLevelUps` spends accumulated XP to advance levels
  (`xpToNextLevel`, capped at `MAX_LEVEL` = 12), rescaling `currentHp` to keep
  the pre-level HP ratio; stats are derived so nothing else is stored. The
  victory flow now persists battle HP **before** granting XP/levels (so the
  HP rescale uses the post-battle value), then teardown only retires the
  encounter.
- Follow-ups before capture / server authority: replace `Math.random()` damage
  rolls in `smogonCalc` and the local `instanceId` counter with the seeded
  `Rng` / server-assigned ids routed through the run state.

### Run Loop & Progression

The first full overworld → battle → overworld loop is closed (slices B–E above):

- Walk onto a visible encounter marker → 1v1 battle starts.
- Win → battle HP/status persists to the roster, the team earns XP, monsters
  level up (capped at 12), and the encounter is retired: its marker is removed
  and that tile no longer triggers a battle.
- Lose (team wipe) → return to the map with the encounter still standing.
- Everything that survives a return to the map lives in `RunState`, the
  serializable snapshot the server will own. Next up (per plan): evolution
  (reuses the `applyLevelUps` hook) and capture.

### Battle System

- Lightweight turn-based battle engine.
- Supports:
  - 1v1 active Pokemon.
  - Switching Pokemon.
  - Speed-based move order.
  - Physical/special/status moves.
  - Basic type effectiveness.
  - Basic stat stage effects.
  - Damage, fainting, and auto-promote next active Pokemon.
- Current starting roster:
  - Charmander
  - Bulbasaur
  - Squirtle

### Battle Presentation

- GBA-inspired battle background with two platforms.
- Enemy status panel is top-left.
- Player status panel is bottom-right.
- Status panels no longer show Pokemon portrait icons.
- HP bars are styled closer to GBA panels.
- Bottom battle dialog hosts the clickable control bar (see Input Model):
  - Top row: four type-tinted move buttons (hotkeys `Q/W/E/R`).
  - Bottom row: three party buttons + a capture button (switch `1/2/3`).
- Clicking a move/party button (or its hotkey) confirms the action.
- Structured battle events drive presentation.
- Prototype animations:
  - Contact moves jump forward.
  - Projectile moves launch a simple orb.
  - Status moves show a pulse.
- Battle message flow:
  - Show `XXX 使用了 XXX！`
  - Play move animation.
  - Show effectiveness text when relevant.
  - Tween HP bar.

### Visual Pass — "Golden-hour Handheld" Aesthetic

- Unified art direction defined in `src/client/render/theme.ts`:
  - Single `PALETTE`, pixel font stack, and a `pixelText()` text-style factory
    (drop-shadowed) so every panel shares one design language.
- Background (`battleBackground.ts`) rebuilt into layered depth:
  - Banded dusk-sky gradient, low sun with a breathing halo.
  - Two bezier hill silhouettes (parallax), lit grass field with perspective
    stripes and a slow light sweep.
  - Platforms now have thickness: contact shadow, soil side wall, rim light,
    top highlight.
- Status panels are dark glass capsules: bevel edges, top sheen, gold accent
  rule, drop shadow. HP bar is a segmented capsule (two-tone vertical gradient,
  gloss line, 8 segment ticks). Panels slide in on battle start.
- Sprites get a cast shadow, idle breathing bob, and a slide-in entrance.
- Command/menu box is a reusable parchment frame (dark frame + warm face +
  gold inner rule + sheen). Selection uses an animated bobbing caret triangle.
- Move feedback upgraded: projectile trail + glowing core + impact burst,
  contact white-flash, layered status pulse, and screen shake scaled to damage.
- A global `elapsed` clock in the ticker drives all ambient motion (breathing,
  caret bob, sky shimmer) and timed entrance transitions.

### Pixel Font (Zpix / 最像素)

- Vendored locally at `public/fonts/zpix.woff2` (served same-origin to avoid
  CORS; works offline). A remote CDN `@font-face` was rejected because fonts
  are CORS-restricted and the CDN did not send the needed header.
- `@font-face` in `styles.css` points at `/fonts/zpix.woff2`; `main.ts` calls
  `document.fonts.load(...)` to force the fetch. Falls back to monospace until
  loaded (text is rebuilt each frame, so it swaps in automatically).

## Important Files

- `src/main.ts`: Main Pixi app, scene switching, map and battle UI rendering.
- `src/game/battle/BattleEngine.ts`: Battle rules and structured battle events.
- `src/game/battle/types.ts`: Battle state, command, and event types.
- `src/game/state/runState.ts`: Serializable `RunState` snapshot (seed, mapId, cleared encounters, player position + team).
- `src/game/state/monster.ts`: Authoritative `MonsterState`, battle materialization, XP rewards, and level-ups.
- `src/game/state/rng.ts`: Seeded deterministic `Rng` (for upcoming damage-roll / sync work).
- `src/game/data/species.ts`: Species stats, moves, sprite slugs, and sprite anchor tuning.
- `src/game/data/moves.ts`: Move data and animation categories.
- `src/game/data/art.ts`: Pokemon sprite URL generation.
- `src/game/map/prototypeMap.ts`: Current map data.
- `src/game/map/tiles.ts`: Tile definitions.
- `src/client/render/mapView.ts`: Tilemap (`@pixi/tilemap`) + camera (`pixi-viewport`) map render view; forwards tile taps for click-to-walk.
- `src/client/render/button.ts`: Reusable pointer-driven (mouse + touch) pixel button component.
- `src/client/render/battleControls.ts`: Clickable battle control bar (move / party / capture buttons).
- `src/game/map/pathfinding.ts`: Bounded BFS pathfinding for click-to-walk.
- `src/client/render/battleLayout.ts`: Battle platform, panel, and sprite layout.
- `src/client/render/battleBackground.ts`: Layered golden-hour battlefield.
- `src/client/render/theme.ts`: Shared palette, pixel font stack, text-style factory.
- `src/client/render/tileTextures.ts`: Generated prototype tile textures.
- `public/fonts/zpix.woff2`: Vendored pixel CJK font (Zpix / 最像素).
- `vite.config.mjs`: Pokemon Showdown sprite proxy.

## Verified

- `npm run build` passes.
- Initial prototype committed:
  - Commit: `3e6fff7`
  - Message: `Build initial battle prototype`

## Known Notes

- Pokemon sprite alignment differs by species and facing because Showdown sprites include transparent padding.
- Use `spriteAnchors.front/back.footOffset` in `species.ts` to tune individual Pokemon placement.
- The current map tile art is generated placeholder art, not final tileset art.
- Map schema is intentionally close to what a future Tiled JSON import can produce.

## Historical Performance Issue (Addressed)

This issue was addressed by refactoring the renderer into persistent PixiJS
display objects. The previous renderer fought PixiJS's retained-mode model by
rebuilding the entire scene graph from scratch every single frame.

Current state:

- `src/main.ts` creates persistent map and battle render views once.
- The ticker calls `updateMapRender()` or `updateBattleRender()` and mutates
  retained nodes instead of clearing and rebuilding scenes.
- Map tiles, panels, menu text, dialog text, Pokemon sprites, HP bars, move
  effects, the sun halo, and grass shimmer are retained and updated in place.

- `app.ticker.add(...)` runs ~60x/sec and calls `drawMap()` or `drawBattle()`
  each frame.
- Those functions do `mapLayer.removeChildren()` and then re-create **every**
  display object via `new Graphics()`, `new Text()`, and `Sprite.from()`.

Why this is expensive (worst → least):

1. `new Text(...)` per frame is the big one: each Text rasterizes to a canvas
   and uploads a texture to the GPU. Doing that for ~10+ labels 60x/sec means
   constant text re-rasterization, GPU uploads, and heavy GC churn.
2. `drawMap()` rebuilds the whole tilemap (one Sprite per tile) every frame even
   though tiles never change.
3. `new Graphics()` per frame re-tessellates all shapes (panels, HP bars,
   background bands) instead of reusing cached geometry.
4. `removeChildren()` discards retained GPU state Pixi is designed to keep.

Resolution: `src/main.ts` now builds persistent objects once, keeps references,
and mutates only what changed per frame. The tilemap is built once, Text objects
are reused, and ambient motion is driven by updating retained nodes.

Review follow-up (post-refactor):

- `textStyles` now holds `TextStyle` **instances**, not plain objects. `Text`
  copies a plain object into a new `TextStyle` on assignment, so the old
  `setTextStyle` reference guard never matched and re-rasterized ~9 labels every
  frame. With shared instances the guard short-circuits as intended.
- Removed dead immediate-mode background helpers (`drawBattleBackground`,
  `drawSun`, `drawField`) left over from before the persistent-view refactor.

Future rendering rule: build persistent objects once, keep references, and per
frame mutate **only** what changed (position, alpha, `text.text`, HP-bar width,
sprite offset, or geometry inside an existing `Graphics`). Keep the tilemap
static, reuse Text objects, and drive ambient motion by tweening properties of
persistent nodes. Avoid reintroducing per-frame `removeChildren()`,
`new Text(...)`, `Sprite.from(...)`, or whole-scene rebuilds in ticker code.

## Suggested Next Steps

1. Polish battle UI further:
   - Add typewriter text effect.
   - Add switch animation.
   - Improve move animation timing.
2. Add battle flow details:
   - Prevent switching to fainted/current Pokemon.
   - Require switching after faint.
   - Add battle win rewards.
3. Add map loop progression:
   - Remove defeated visible encounters.
   - Return to map after battle with state preserved.
   - Add starter selection.
4. Prepare real map asset pipeline:
   - Choose prototype tileset.
   - Add `public/assets/tilesets`.
   - Add Tiled JSON import path.
