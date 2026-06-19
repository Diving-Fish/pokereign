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
- Fixed logical game resolution: `960x540` (all layout math stays in these units).
- Crisp scaling (`fitRendererToWindow` in `src/client/render/screen.ts`): instead
  of rendering at 960×540 and CSS-upscaling (blurry), the renderer backbuffer
  resolution is matched to the on-screen pixel density (`renderer.resolution =
  scale * devicePixelRatio`). Vector graphics + text rasterize crisp at native
  pixels; the logical coordinate space stays 960×540 so no layout code changes.
  Pixel-art tiles keep `nearest`; canvas `image-rendering` is `auto` and
  `antialias` is on so battle sprites stay smoothly interpolated.
- `npm run dev`, `npm run build`, and `npm run preview` scripts.

### Sprite Assets

- Battle Pokémon sprites load through a local Vite proxy (`vite.config.mjs`) that
  forwards to Pokémon Showdown to avoid browser CORS/WebGL texture issues. The
  proxy serves both `.png` and `.gif`. NOTE: the proxy is dev/preview only — a
  production build needs its own proxy or vendored assets.
- Two sprite tiers (`src/game/data/art.ts`):
  - Animated **gen6 (X/Y) "ani"** GIFs are the primary battlers:
    `/pokemon-sprites/ani/{slug}.gif` (front) + `/pokemon-sprites/ani-back/{slug}.gif`
    (back). Variable-size, near-native resolution (relative body size baked in).
  - Static **gen5** PNGs (`/pokemon-sprites/gen5{,-back}/{slug}.png`, fixed 96×96)
    are the on-failure fallback (loaded lazily via `Texture.from` when a battler
    mounts) and still power the team HUD.
- Animated sprites (`src/client/render/animatedBattler.ts`): one `GifSprite`
  (`pixi.js/gif`) per battler, lazy-loaded and swapped in over the static PNG
  fallback. The fallback stays hidden and is only revealed if a GIF genuinely
  fails. GIFs are decoded **lazily, on first use** — when a battler's `GifSource`
  isn't cached, `animatedBattler` calls `loadGif` and the intro fade covers the
  decode. (Earlier the whole roster's GIFs were preloaded at startup so cached
  sources attached synchronously; with 93 species that decode-stalled startup one
  frame per GIF, so the preload was removed. A streaming / decode-on-demand pass is
  planned. Cached sources still attach synchronously on subsequent battles.)
- **GIF flicker fix** (`src/client/render/gifLoader.ts`): `pixi.js/gif`'s built-in
  decoder clears the WHOLE canvas on disposal method 2, but Showdown's ani frames
  are "first frame full + later frames sub-rect patches + interspersed disposal-1
  frames", so a full-canvas clear drops the persistent pixels and the sprite
  flickers (worst on ani-back). We decode with `gifuct-js` ourselves and restore
  only the FRAME's rect — matching native `<img>` decoding, which is why Showdown
  itself doesn't flicker. Verified by simulation: per-frame opaque-pixel variance
  dropped from ~115873 (frames as low as 130px) to ~5 (stable ~1780px). We keep
  our own cache (bypassing `Assets`) so the corrected path is the only one.
- ani sprites are scaled by a single global factor per facing (`ANI_SPRITE_SCALE`
  in `main.ts`; relative body size is already in the GIF dims) and grounded on the
  platform CENTRE — shadow on the disc, feet resting on it — independent of the
  per-species gen5 foot line. `ANI_FOOT_NUDGE` is the fine-tune offset.
- Species data contains `spriteSlug` and per-facing `spriteAnchors` (the latter
  now only tunes the static gen5 fallback's scale / foot line).

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
- After a level-up, `evolveIfReady` runs and auto-evolves any monster that has
  reached an evolution's `requiredLevel` (immediate, no confirmation), chaining
  through multiple stages. Like the original games, both level-up and evolution
  add exactly the gained max HP to current HP (rather than preserving a ratio).
  Moves are kept.
  Only Charmander → Charmeleon (Lv.4) is configured so far. Item-triggered
  evolution (`EvolutionRule.requiredItem`) is defined in data but not wired —
  it waits on the item system.
- Lose (team wipe) → return to the map with the encounter still standing.
- Everything that survives a return to the map lives in `RunState`, the
  serializable snapshot the server will own.

### Capture

- Pure logic in `src/game/state/capture.ts`. `computeCatchChance` =
  `baseRate × hpFactor × statusMult × classMult`, clamped to [0, 1]:
  original-style HP factor `(3·max − 2·cur)/(3·max)` (1/3 at full HP → 1 near
  faint), sleep/freeze ×2.5 and the rest ×1.5, and a tier multiplier
  (normal ×1 / elite ×0.5 / boss ×0.25). `attemptCapture(target, rng)` rolls
  the seeded run RNG → `captured | escaped | uncatchable`.
- Data model: `MonsterSpecies.capture?: { baseRate, class? }` (`CaptureClass =
  normal | elite | boss`); absent = a default normal profile (baseRate 0.5).
  All multipliers/defaults are placeholders pending the config table.
- Battle flow (`main.ts`): one attempt per battle (`captureUsed`); the capture
  button throws at the active foe. Boss encounters (`MapEncounterObject.boss`)
  and non-normal tiers are rejected as "uncatchable". A miss leaves the battle
  ongoing (foe must then be defeated); a hit is terminal like a win — XP is
  awarded, the encounter retired, and the catch joins at the level it was
  caught at (overrides doc §7.1's "team level − 1").
- Full team (3): the catch is parked and, after the battle tears down, the
  replace-or-release modal (`captureReplaceView.ts`) opens over the map —
  tap a member to swap it out, or release the catch. Map input is frozen while
  it is open. Item-tiered/elite per-species capture and capture-shield breaking
  are not built yet.

### Type System (18 types, calc-sourced chart)

- `ElementType` (`src/game/data/types.ts`) now covers all **18** types, in canonical
  Pokédex order (`ELEMENT_TYPES`). `theme.ts` carries the 18-type color + zh-label
  tables (`TYPE_COLORS`/`typeColor`, `TYPE_LABELS`/`typeLabel`); the duplicated
  per-file `TYPE_LABELS` in `teamHud.ts` and `battleControls.ts` were removed in favor
  of the shared `typeLabel`.
- `typeEffectiveness` (`src/game/battle/typeChart.ts`) is now **derived from
  `@smogon/calc`** (`GEN.types.get(id).effectiveness`) instead of a hand-maintained
  chart, matching the "数值一律以 calc 为准" convention. Lowercase→capitalized keys are
  cached per attacking type. Verified against the tricky immunities (fighting→ghost,
  dragon→fairy, ground→flying, electric→ground all 0; water→fire/rock = 4×).

### Movesets & Level-up Learning

- Species carry an optional `learnset: { level, moveId }[]` (in-game Lv.1-12 table;
  `src/game/data/types.ts`). `knownMovesAtLevel(speciesId, level)` derives the known
  moves (the most recent {@link MAX_MOVES}=4 at/under that level), used by
  `createMonsterState`; species with no learnset fall back to `defaultMoves`.
- On level-up, `applyLearnset(state, fromLevel)` (`src/game/state/monster.ts`) teaches
  moves unlocked in `(fromLevel, level]` on the **current** species — so it runs after
  `applyLevelUps` + `evolveIfReady`, learning the evolved form's moves. Moves that fit
  a free slot are learned inline; the rest are returned as `pending` and queued on
  `pendingLearns` in `main.ts`.
- **Full-slot learns are deferred to after the battle** (design decision): once the
  battle tears down, `openNextPostBattleModal()` drains a single post-battle decision
  queue — first the capture replace modal (if any), then each queued move-learn via
  `moveLearnView` (`src/client/render/moveLearnView.ts`). The learn modal shows the new
  move (type pill, category glyph, power/PP) and the four current moves as tap-to-
  forget cards, plus a skip button; `learnMoveIntoSlot` does the swap. Map input is
  frozen while either modal is open. Stale learns (monster left the team) are dropped.
- Verified the charmander line end-to-end: L3 (scratch/ember/smokescreen) → L4 evolves
  to charmeleon and auto-learns flameBurst into the free slot → L5 queues growl for a
  post-battle replace decision.

### Species Data (calc-sourced)

- `MonsterSpecies` base stats / types / primary ability are now **derived from
  `@smogon/calc`'s gen-9 dex** (`src/game/data/pokedex.ts`: `speciesTypes`,
  `speciesAbility`, `speciesBaseStats`), keyed by the entry id (which must match
  calc's species id). `types`/`baseStats`/`ability`/`defaultMoves`/`dexNumber` are
  all optional now and only set to override calc. `baseStats` was already dead data
  (calc derives stats from the id), and deriving `types` fixed stale local data —
  e.g. bulbasaur is now correctly Grass/Poison.
- A new species entry therefore needs only: id (calc id), zh `name`, `spriteSlug`,
  `spriteAnchors` (gen5 fallback tuning), `learnset`, `evolutions`, `capture`.
- `satisfies` gotcha: `SPECIES[id]` narrows to the literal entry type, so optional
  fields aren't visible — `pokedex.ts` and `knownMovesAtLevel` read through a
  `MonsterSpecies` annotation/cast.
- Verified at runtime: `toBattleMonster` resolves types + calc stats for all four
  starters (bulbasaur L5 → grass/poison, maxHp 104).

### Species & Move Pool (Slice 3b — bulk content)

- **93 species across 40 evolution lines** authored in `src/game/data/species.ts`
  from the `roster.md` ecology plan (18-type coverage; every type ≥2 lines, most
  ≥3). Base stats/types/ability come from calc (Slice 3a), so entries carry only
  id/name/spriteSlug/learnset/evolutions(/capture). Compact builders `L(level,
  ...moveIds)` / `evoLv` / `evoItem` keep the file terse.
- **Move pool expanded to 128 moves** (`src/game/data/moves.ts`), a per-type kit
  (early/mid/strong/status) so learnsets pull type-appropriate moves. Every
  `calcName` is verified to resolve in `@smogon/calc` (Low Kick reads bp=0 — its
  power is weight-based, computed at runtime).
- Evolutions: level-gated ones auto-trigger (三段 Lv.4/8, 二段 Lv.6). **Item/stone
  evolutions use `requiredItem` placeholders** (火/水/雷/叶/月之石, 连接绳, 金属外膜,
  锐利之爪) — they don't fire yet (待 Phase 2 item system); those lines stay at base.
  Eevee is one base with three stone-gated branches (water/thunder/fire).
- Rare terminal lines (dragonite, hydreigon) carry a lower-rate `capture` profile.
- Verified: integrity check (all learnset moveIds ∈ MOVES, all evolution targets ∈
  SPECIES, all 93 ids resolve in calc) + a runtime sweep (all 93 × Lv.1/5/10
  materialize with 1–4 valid moves and positive HP; charmander grows
  charmander→charmeleon→charizard; pikachu correctly does NOT auto-evolve).
- NOTE: the prototype map (`prototypeMap.ts`) still scatters only the original 4
  species — wiring the new roster into biome-based encounters is Phase 3 (生态群落).
  Until then the new species are reachable via the dev GM hook
  (`window.gmStartBattle("dratini", 5)`).

### Item System — Slice 2a (data model + effects)

- `src/game/data/items.ts` — item registry (`ITEMS`, `ItemId`). Kinds: `held`,
  `stone`, `tm`, `medicine`, `berry`. First catalog: 17 type-boost held items + 8
  signature held items (Life Orb, Choice trio, Leftovers, Assault Vest, Eviolite,
  Shell Bell), 8 evolution stones/items, 8 TMs, 7 medicines, 2 berries.
- **Held items hit battle for free via `@smogon/calc`**: `MonsterState.heldItem`
  stores an item id; `toBattleMonster` copies it to `BattleMonster.heldItem`;
  `smogonCalc.toPokemon` passes `itemCalcName(id)` as the calc `item`. Verified
  Charcoal/Life Orb/Choice Band etc. all change calc damage.
- `src/game/state/items.ts` — `useItemOnMonster(state, itemId)` mutates a monster:
  - `stone` → evolves if a `requiredItem` evolution matches (unblocks the stone
    lines from Slice 3b: pikachu+雷之石→raichu, eevee forks, gengar via 连接绳…).
  - `tm` → learns the move into a free slot, or returns `learnChoice` so the caller
    opens `moveLearnView` (reusing the level-up replace flow) and resolves with
    `teachTmIntoSlot`.
  - `medicine`/`berry` → heal / full-heal / revive (with the right fail cases).
  - `equipHeldItem` / `unequipHeldItem` for the holder slot.
- Shared `evolveTo(state, targetSpeciesId)` + `maxHpOf(state)` extracted in
  `monster.ts` (level-up and item evolution share the HP-rescale).
- Dev hooks (DEV only): `gmEquip(slot, itemId)`, `gmUseItem(slot, itemId)`.
- NOT yet: inventory / single backpack slot, the pickup-decision modal
  (立即用/携带/进背包/分解), an in-game bag UI, item reward sources, berry held
  auto-trigger, rare-candy level use, and disassembly — all Slice 2b/2c.

### Item System — Slice 2b (in progress: icons + inventory model)

- **Item icons use Showdown's `itemicons-sheet.png`** (16-col grid, 24×24 cells,
  indexed by each item's `spritenum`). Showdown's battle data only indexes
  battle-relevant items, so held items / type boosters / stones / berries have a
  baked `ITEM_SPRITENUM` (data/items.ts) and crop their real icon; bag medicines,
  TMs, and the linking cord aren't in Showdown's data, so they get a small drawn
  placeholder keyed by item kind. `src/client/render/itemIcon.ts` (`createItemIcon`)
  does the crop (via the dev sprite proxy, `nearest` scaling) / placeholder. Wired
  into the team-detail "携带" row as a first visible/testable use.
- **Single backpack slot** (doc §11): `PlayerState.backpack?: string` (one item id)
  + `stashInBackpack` / `takeFromBackpack` / `isBackpackFull` in runState.ts.
- NOT yet (rest of 2b): the bag UI panel (open from the team-bar items button),
  use/equip/discard flow (wire `useItemOnMonster`; TM `learnChoice` → `moveLearnView`),
  the pickup-decision modal (立即用/携带/进背包/分解), and an item reward source.

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

### Team HUD (party info bar)

- `src/client/render/teamHud.ts` (`createTeamHud`) renders a bottom-right party
  bar plus a centered detail overlay. Shown only in map mode (`setVisible`),
  refreshed on roster change (`refresh`); the detail window opens on a party
  square and closes on Esc / outside click (`isDetailOpen`, `closeDetail`).
- The bar shows each team member's sprite square plus an items button; the detail
  window shows stats and the monster's moves with PP and held item.
- **Drag to reorder the party** (decides lead/battle order): press-and-drag a
  party square sideways to reposition it; the other squares slide to open a gap,
  and on drop the shared roster array (`runState.player.team`) is spliced in
  place so the new lead order persists into the next battle (`startBattle` maps
  the roster in order, slot 0 leads). A press that moves less than a small
  threshold is still a tap that opens the detail window. Implemented with PixiJS
  `pointerdown` + `globalpointermove` on the bar; only shown in map mode, so
  order is set on the overworld before entering a battle.
- **Drag to reorder a monster's moves** (inside the detail window): each move
  cell is now a self-contained Container; press-and-drag one sideways to
  reposition it among that monster's moves. On drop the `monster.moves` array is
  spliced in place (it is part of the persistent `MonsterState`), so the new
  order carries into battle as the Q/W/E/R layout. Same drag pattern as the
  party bar, scoped to the detail content; empty move slots aren't draggable.
- Supporting data, display-only for now: `Move.pp` (`types.ts` / `moves.ts`) and
  `MonsterState.heldItem` (`monster.ts`). PP isn't consumed and the item system
  isn't built yet, so the UI just shows them as full / present.

### Dev Tooling

- Dev-only GM hook in `main.ts`: `window.gmStartBattle(speciesId?, level?)` jumps
  straight into a preset battle from the browser console (default 杰尼龟 Lv.5),
  for quick manual + automated testing without walking the map to an encounter.
  Wrapped in `import.meta.env.DEV`, so it is stripped from production builds.

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
- `src/game/data/species.ts`: Species registry (id, zh name, sprite slug/anchors, learnset, evolutions, capture). Base stats/types/ability come from calc.
- `src/game/data/pokedex.ts`: calc-sourced base stats / types / primary ability resolvers (`speciesTypes`/`speciesAbility`/`speciesBaseStats`).
- `src/client/render/moveLearnView.ts`: post-battle "learn new move / replace which" modal (full-slot level-up learns).
- `src/game/data/moves.ts`: Move data and animation categories.
- `src/game/data/art.ts`: gen5 (PNG) + ani (GIF) Pokémon sprite URL generation.
- `src/client/render/screen.ts`: logical `960x540` constants + hi-DPI renderer fitting.
- `src/client/render/animatedBattler.ts`: per-battler `GifSprite` manager (lazy load, static-PNG fallback, sync cache attach).
- `src/client/render/gifLoader.ts`: flicker-fixed GIF→`GifSource` decoder (`gifuct-js`, per-frame-rect disposal) + cache.
- `src/client/render/teamHud.ts`: bottom-right party info bar + centered detail overlay (map mode).
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

- Animated (ani) battlers are grounded on the platform centre (uniform), so they
  no longer need per-species foot tuning. `spriteAnchors.front/back.footOffset`
  in `species.ts` now only affects the static gen5 fallback, whose alignment
  still varies by species/facing due to transparent padding.
- The `pokemon-showdown-client/` folder (cloned for reference) is git-ignored and
  not part of this repo. The ani sprite dimension table (`BattlePokemonSprites`
  in `data/pokedex-mini.js`) only carries `{w, h}` for ani — no vertical offset —
  so it isn't needed; we read frame size from `GifSource` at runtime instead.
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
