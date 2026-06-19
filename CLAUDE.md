# CLAUDE.md

Pokereign — 非商业宝可梦同人网页游戏。"黑夜君临"式合作远征 roguelite：1~3 人组队，单局 30~40 分钟，白天/夜晚交替 + 缩圈，最后全队打终幕神兽。核心是 PvE/PvPvE，第一版优先单人原型 + 合作。

## 文档
- `doc.md` — 设计圣经（中文）。玩法、兴趣点、数值公式、捕捉/进化/物品系统都以它为准，改动前先读。
- `progress.md` — 已实现功能的实况记录。动手前看它了解现状。

## 技术栈
TypeScript（strict）+ PixiJS v8 + Vite。对战数值用 `@smogon/calc`（第九代机制）。地图渲染用 `@pixi/tilemap`，GIF 战斗精灵用 `gifuct-js` / `pixi.js/gif`。

## 命令
- `npm run dev` — Vite 开发服务器
- `npm run build` — `tsc` 类型检查 + Vite 打包
- `npm run preview` — 预览构建产物

## 代码结构
- `src/game/` — **纯逻辑，不依赖 PixiJS**：`battle/`（BattleEngine、smogonCalc、typeChart）、`map/`（prototypeMap、pathfinding、tiles）、`state/`（runState、monster、rng）、`data/`（species、moves、art、types）。
- `src/client/render/` — PixiJS 渲染层：mapView、battleControls/Layout/Background、animatedBattler、teamHud、button、theme、screen、tileTextures。
- `src/main.ts` — 入口，连接 `map` ↔ `battle` 两个场景，驱动游戏循环。

保持逻辑/渲染分离：游戏规则放 `src/game`，画面放 `src/client/render`。

## 约定与要点
- **数值逻辑一律以 `@smogon/calc`（已安装）为准**：宝可梦数据、伤害计算等都基于它，可二次开发，但不要从头造轮子。
- 逻辑分辨率固定 `960x540`，所有布局算式用这套单位；renderer 按像素密度缩放求清晰（`screen.ts`）。
- 输入鼠标/触摸优先（PixiJS pointer 事件），键盘是加速键。地图点击寻路（BFS，`pathfinding.ts`）。
- 局内等级 1~12（非原作 1~100），自定义数值公式见 `doc.md` §9。
- 战斗精灵从 pokemon-showdown 代理拉取（`vite.config.mjs` 的 `/pokemon-sprites/` 代理）。
- `pokemon-showdown-client/` 仅作参考，已 gitignore，不属于本仓库。
