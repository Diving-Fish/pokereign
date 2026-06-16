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
- Prototype map stored in `src/game/map/prototypeMap.ts`.
- Tile definitions include collision metadata.
- Map objects support visible encounter objects.
- Current tile rendering uses generated pixel textures, ready to swap to an atlas later.

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
- Bottom battle dialog has two areas:
  - Left: move list or Pokemon list.
  - Right: `战斗 / 宝可梦` menu.
- `Tab` toggles between battle menu and Pokemon menu.
- `Enter` confirms selected move or switch.
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
- `src/game/data/species.ts`: Species stats, moves, sprite slugs, and sprite anchor tuning.
- `src/game/data/moves.ts`: Move data and animation categories.
- `src/game/data/art.ts`: Pokemon sprite URL generation.
- `src/game/map/prototypeMap.ts`: Current map data.
- `src/game/map/tiles.ts`: Tile definitions.
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

## Known Performance Issue (Not Yet Addressed)

The renderer fights PixiJS's retained-mode model: it rebuilds the entire scene
graph from scratch every single frame.

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

Fix (deferred — visual pass chose aesthetics only): build persistent objects
once, keep references, and per frame mutate **only** what changed (position,
alpha, `text.text`, HP-bar width, sprite offset). Build the tilemap once; reuse
Text objects; drive ambient motion by tweening properties of persistent nodes.
The current per-frame-rebuild is what makes the `elapsed`-clock animations cheap
to add, but it should be replaced before the scene grows.

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
