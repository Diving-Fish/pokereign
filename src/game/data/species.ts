import type { EvolutionRule, LearnsetEntry, MonsterSpecies } from "./types";

/**
 * Species registry. Base stats / types / primary ability are sourced from
 * `@smogon/calc`'s gen-9 dex (keyed by the entry id — which must match calc's
 * species id), so an entry normally only needs: id, zh `name`, `spriteSlug`
 * (= id), `learnset`, `evolutions`, `capture`. Set `types`/`baseStats`/`ability`
 * only to override calc. See `pokedex.ts` for the resolvers.
 *
 * Learnsets use the in-game Lv.1-12 scale; evolution levels follow doc §8.2
 * (三段 Lv.4/8, 二段 Lv.6). Item evolutions use `requiredItem` placeholders — the
 * item system (Phase 2) will trigger them; until then those lines stay at base.
 */

/** Compact learnset builder: `L(3, "a", "b")` → two entries both at level 3. */
const L = (level: number, ...moveIds: string[]): LearnsetEntry[] => moveIds.map((moveId) => ({ level, moveId }));
/** Level-up evolution. */
const evoLv = (targetSpeciesId: string, requiredLevel: number): EvolutionRule => ({ targetSpeciesId, requiredLevel });
/** Item-triggered evolution (waits on the item system). */
const evoItem = (targetSpeciesId: string, requiredItem: string): EvolutionRule => ({ targetSpeciesId, requiredItem });

// Evolution item names (zh) — used as `requiredItem` placeholders.
const FIRE_STONE = "火之石";
const WATER_STONE = "水之石";
const THUNDER_STONE = "雷之石";
const LEAF_STONE = "叶之石";
const MOON_STONE = "月之石";
const LINKING_CORD = "连接绳";
const METAL_COAT = "金属外膜";
const SHARP_CLAW = "锐利之爪";

export const SPECIES = {
  // ===== 御三家 =====
  charmander: {
    id: "charmander", dexNumber: 4, spriteSlug: "charmander", name: "小火龙",
    spriteAnchors: { back: { footOffset: 34, scale: 2.9 }, front: { footOffset: 30, scale: 2.55 } },
    learnset: [...L(1, "scratch", "ember"), ...L(3, "smokescreen")],
    evolutions: [evoLv("charmeleon", 4)]
  },
  charmeleon: {
    id: "charmeleon", dexNumber: 5, spriteSlug: "charmeleon", name: "火恐龙",
    spriteAnchors: { back: { footOffset: 34, scale: 2.8 }, front: { footOffset: 30, scale: 2.5 } },
    learnset: [...L(1, "scratch", "ember"), ...L(3, "smokescreen"), ...L(4, "fireFang"), ...L(6, "slash")],
    evolutions: [evoLv("charizard", 8)]
  },
  charizard: {
    id: "charizard", dexNumber: 6, spriteSlug: "charizard", name: "喷火龙",
    learnset: [...L(1, "scratch", "ember"), ...L(4, "fireFang"), ...L(6, "slash"), ...L(8, "flamethrower"), ...L(9, "wingAttack")]
  },
  bulbasaur: {
    id: "bulbasaur", dexNumber: 1, spriteSlug: "bulbasaur", name: "妙蛙种子",
    spriteAnchors: { back: { footOffset: 38, scale: 2.85 }, front: { footOffset: 62, scale: 2.65 } },
    learnset: [...L(1, "tackle", "growl"), ...L(3, "vineWhip"), ...L(5, "poisonPowder")],
    evolutions: [evoLv("ivysaur", 4)]
  },
  ivysaur: {
    id: "ivysaur", dexNumber: 2, spriteSlug: "ivysaur", name: "妙蛙草",
    learnset: [...L(1, "tackle"), ...L(3, "vineWhip"), ...L(4, "razorLeaf"), ...L(6, "megaDrain"), ...L(7, "sleepPowder")],
    evolutions: [evoLv("venusaur", 8)]
  },
  venusaur: {
    id: "venusaur", dexNumber: 3, spriteSlug: "venusaur", name: "妙蛙花",
    learnset: [...L(1, "tackle"), ...L(4, "razorLeaf"), ...L(6, "megaDrain"), ...L(8, "gigaDrain"), ...L(9, "sludgeBomb")]
  },
  squirtle: {
    id: "squirtle", dexNumber: 7, spriteSlug: "squirtle", name: "杰尼龟",
    spriteAnchors: { back: { footOffset: 36, scale: 2.85 }, front: { footOffset: 38, scale: 2.6 } },
    learnset: [...L(1, "tackle", "tailWhip"), ...L(3, "waterGun"), ...L(5, "withdraw")],
    evolutions: [evoLv("wartortle", 4)]
  },
  wartortle: {
    id: "wartortle", dexNumber: 8, spriteSlug: "wartortle", name: "卡咪龟",
    learnset: [...L(1, "tackle"), ...L(3, "waterGun"), ...L(4, "bubbleBeam"), ...L(6, "bite"), ...L(7, "aquaTail")],
    evolutions: [evoLv("blastoise", 8)]
  },
  blastoise: {
    id: "blastoise", dexNumber: 9, spriteSlug: "blastoise", name: "水箭龟",
    learnset: [...L(1, "tackle"), ...L(4, "bubbleBeam"), ...L(6, "aquaTail"), ...L(8, "surf"), ...L(9, "hydroPump")]
  },

  // ===== 草原 =====
  pidgey: {
    id: "pidgey", spriteSlug: "pidgey", name: "波波",
    learnset: [...L(1, "tackle", "gust"), ...L(3, "quickAttack"), ...L(5, "wingAttack")],
    evolutions: [evoLv("pidgeotto", 4)]
  },
  pidgeotto: {
    id: "pidgeotto", spriteSlug: "pidgeotto", name: "比比鸟",
    learnset: [...L(1, "tackle", "gust"), ...L(3, "quickAttack"), ...L(4, "wingAttack"), ...L(6, "aerialAce")],
    evolutions: [evoLv("pidgeot", 8)]
  },
  pidgeot: {
    id: "pidgeot", spriteSlug: "pidgeot", name: "大比鸟",
    learnset: [...L(1, "gust"), ...L(4, "wingAttack"), ...L(6, "aerialAce"), ...L(8, "airSlash"), ...L(9, "drillPeck")]
  },
  togepi: {
    id: "togepi", spriteSlug: "togepi", name: "波克比",
    learnset: [...L(1, "pound", "growl"), ...L(3, "fairyWind"), ...L(5, "sweetKiss")],
    evolutions: [evoLv("togetic", 4)]
  },
  togetic: {
    id: "togetic", spriteSlug: "togetic", name: "波克基古",
    learnset: [...L(1, "pound"), ...L(3, "fairyWind"), ...L(4, "disarmingVoice"), ...L(6, "drainingKiss"), ...L(7, "airSlash")],
    evolutions: [evoLv("togekiss", 8)]
  },
  togekiss: {
    id: "togekiss", spriteSlug: "togekiss", name: "波克基斯",
    learnset: [...L(1, "fairyWind"), ...L(4, "disarmingVoice"), ...L(6, "airSlash"), ...L(8, "dazzlingGleam"), ...L(9, "moonblast")]
  },
  rattata: {
    id: "rattata", spriteSlug: "rattata", name: "小拉达",
    learnset: [...L(1, "tackle", "tailWhip"), ...L(3, "quickAttack"), ...L(5, "bite")],
    evolutions: [evoLv("raticate", 6)]
  },
  raticate: {
    id: "raticate", spriteSlug: "raticate", name: "拉达",
    learnset: [...L(1, "tackle"), ...L(3, "quickAttack"), ...L(5, "bite"), ...L(6, "headbutt"), ...L(8, "doubleEdge")]
  },
  pikachu: {
    id: "pikachu", spriteSlug: "pikachu", name: "皮卡丘",
    learnset: [...L(1, "thunderShock", "growl"), ...L(3, "quickAttack"), ...L(5, "spark"), ...L(7, "thunderbolt")],
    evolutions: [evoItem("raichu", THUNDER_STONE)]
  },
  raichu: {
    id: "raichu", spriteSlug: "raichu", name: "雷丘",
    learnset: [...L(1, "thunderShock"), ...L(3, "quickAttack"), ...L(5, "spark"), ...L(7, "thunderbolt"), ...L(9, "thunderWave")]
  },

  // ===== 湖边 =====
  magikarp: {
    id: "magikarp", spriteSlug: "magikarp", name: "鲤鱼王",
    learnset: [...L(1, "tackle")],
    evolutions: [evoLv("gyarados", 8)]
  },
  gyarados: {
    id: "gyarados", spriteSlug: "gyarados", name: "暴鲤龙",
    learnset: [...L(1, "bite", "aquaTail"), ...L(8, "crunch"), ...L(9, "hydroPump")]
  },
  tentacool: {
    id: "tentacool", spriteSlug: "tentacool", name: "玛瑙水母",
    learnset: [...L(1, "poisonSting", "acid"), ...L(3, "bubbleBeam"), ...L(5, "waterGun")],
    evolutions: [evoLv("tentacruel", 6)]
  },
  tentacruel: {
    id: "tentacruel", spriteSlug: "tentacruel", name: "毒刺水母",
    learnset: [...L(1, "acid"), ...L(3, "bubbleBeam"), ...L(6, "sludge"), ...L(8, "surf"), ...L(8, "sludgeBomb")]
  },
  goldeen: {
    id: "goldeen", spriteSlug: "goldeen", name: "角金鱼",
    learnset: [...L(1, "peck", "tailWhip"), ...L(3, "waterGun"), ...L(5, "aquaTail")],
    evolutions: [evoLv("seaking", 6)]
  },
  seaking: {
    id: "seaking", spriteSlug: "seaking", name: "金鱼王",
    learnset: [...L(1, "peck"), ...L(3, "waterGun"), ...L(5, "aquaTail"), ...L(6, "bubbleBeam"), ...L(8, "surf")]
  },

  // ===== 森林 =====
  caterpie: {
    id: "caterpie", spriteSlug: "caterpie", name: "绿毛虫",
    learnset: [...L(1, "tackle", "stringShot"), ...L(3, "bugBite")],
    evolutions: [evoLv("metapod", 3)]
  },
  metapod: {
    id: "metapod", spriteSlug: "metapod", name: "铁甲蛹",
    learnset: [...L(1, "harden")],
    evolutions: [evoLv("butterfree", 6)]
  },
  butterfree: {
    id: "butterfree", spriteSlug: "butterfree", name: "巴大蝶",
    learnset: [...L(1, "bugBite", "gust"), ...L(5, "sleepPowder"), ...L(6, "silverWind"), ...L(7, "airSlash"), ...L(8, "bugBuzz")]
  },
  weedle: {
    id: "weedle", spriteSlug: "weedle", name: "独角虫",
    learnset: [...L(1, "poisonSting", "stringShot"), ...L(3, "bugBite")],
    evolutions: [evoLv("kakuna", 3)]
  },
  kakuna: {
    id: "kakuna", spriteSlug: "kakuna", name: "铁壳蛹",
    learnset: [...L(1, "harden")],
    evolutions: [evoLv("beedrill", 6)]
  },
  beedrill: {
    id: "beedrill", spriteSlug: "beedrill", name: "大针蜂",
    learnset: [...L(1, "bugBite", "poisonSting"), ...L(6, "furyCutter"), ...L(7, "poisonFang"), ...L(8, "xScissor"), ...L(8, "sludgeBomb")]
  },
  oddish: {
    id: "oddish", spriteSlug: "oddish", name: "走路草",
    learnset: [...L(1, "absorb", "poisonPowder"), ...L(3, "megaDrain"), ...L(5, "acid")],
    evolutions: [evoLv("gloom", 4)]
  },
  gloom: {
    id: "gloom", spriteSlug: "gloom", name: "臭臭花",
    learnset: [...L(1, "absorb"), ...L(3, "megaDrain"), ...L(4, "acid"), ...L(6, "sleepPowder"), ...L(7, "sludge")],
    evolutions: [evoItem("vileplume", LEAF_STONE)]
  },
  vileplume: {
    id: "vileplume", spriteSlug: "vileplume", name: "霸王花",
    learnset: [...L(1, "megaDrain"), ...L(4, "acid"), ...L(6, "gigaDrain"), ...L(7, "sleepPowder"), ...L(8, "sludgeBomb"), ...L(8, "energyBall")]
  },
  gastly: {
    id: "gastly", spriteSlug: "gastly", name: "鬼斯",
    learnset: [...L(1, "lick", "astonish"), ...L(3, "acid"), ...L(5, "hex")],
    evolutions: [evoLv("haunter", 4)]
  },
  haunter: {
    id: "haunter", spriteSlug: "haunter", name: "鬼斯通",
    learnset: [...L(1, "lick"), ...L(3, "hex"), ...L(4, "shadowSneak"), ...L(6, "sludge"), ...L(7, "shadowClaw")],
    evolutions: [evoItem("gengar", LINKING_CORD)]
  },
  gengar: {
    id: "gengar", spriteSlug: "gengar", name: "耿鬼",
    learnset: [...L(1, "hex"), ...L(4, "shadowClaw"), ...L(6, "sludge"), ...L(8, "shadowBall"), ...L(8, "sludgeBomb"), ...L(9, "nastyPlot")]
  },
  kricketot: {
    id: "kricketot", spriteSlug: "kricketot", name: "圆法师",
    learnset: [...L(1, "bugBite", "stringShot"), ...L(3, "struggleBug"), ...L(5, "furyCutter")],
    evolutions: [evoLv("kricketune", 6)]
  },
  kricketune: {
    id: "kricketune", spriteSlug: "kricketune", name: "音箱蟀",
    learnset: [...L(1, "bugBite"), ...L(3, "furyCutter"), ...L(5, "struggleBug"), ...L(6, "xScissor"), ...L(8, "bugBuzz")]
  },
  phantump: {
    id: "phantump", spriteSlug: "phantump", name: "朽木妖",
    learnset: [...L(1, "astonish", "tackle"), ...L(3, "absorb"), ...L(5, "shadowSneak")],
    evolutions: [evoLv("trevenant", 6)]
  },
  trevenant: {
    id: "trevenant", spriteSlug: "trevenant", name: "朽木巨人",
    learnset: [...L(1, "astonish"), ...L(3, "absorb"), ...L(5, "shadowSneak"), ...L(6, "megaDrain"), ...L(7, "shadowClaw"), ...L(8, "shadowBall"), ...L(8, "energyBall")]
  },
  petilil: {
    id: "petilil", spriteSlug: "petilil", name: "百合根娃娃",
    learnset: [...L(1, "absorb", "tackle"), ...L(3, "megaDrain"), ...L(5, "sleepPowder"), ...L(7, "gigaDrain")],
    evolutions: [evoItem("lilligant", LEAF_STONE)]
  },
  lilligant: {
    id: "lilligant", spriteSlug: "lilligant", name: "裙儿小姐",
    learnset: [...L(1, "megaDrain"), ...L(3, "gigaDrain"), ...L(5, "sleepPowder"), ...L(7, "energyBall"), ...L(8, "leafBlade")]
  },

  // ===== 矿洞 =====
  geodude: {
    id: "geodude", spriteSlug: "geodude", name: "小拳石",
    learnset: [...L(1, "tackle", "rockThrow"), ...L(3, "mudSlap"), ...L(5, "rockTomb")],
    evolutions: [evoLv("graveler", 4)]
  },
  graveler: {
    id: "graveler", spriteSlug: "graveler", name: "隆隆石",
    learnset: [...L(1, "tackle", "rockThrow"), ...L(4, "rockTomb"), ...L(6, "bulldoze"), ...L(7, "dig")],
    evolutions: [evoItem("golem", LINKING_CORD)]
  },
  golem: {
    id: "golem", spriteSlug: "golem", name: "隆隆岩",
    learnset: [...L(1, "rockThrow"), ...L(4, "rockTomb"), ...L(6, "bulldoze"), ...L(8, "rockSlide"), ...L(8, "earthquake"), ...L(9, "stoneEdge")]
  },
  sandshrew: {
    id: "sandshrew", spriteSlug: "sandshrew", name: "穿山鼠",
    learnset: [...L(1, "scratch", "sandAttack"), ...L(3, "mudSlap"), ...L(5, "dig")],
    evolutions: [evoLv("sandslash", 6)]
  },
  sandslash: {
    id: "sandslash", spriteSlug: "sandslash", name: "穿山王",
    learnset: [...L(1, "scratch"), ...L(3, "mudSlap"), ...L(5, "dig"), ...L(6, "slash"), ...L(7, "bulldoze"), ...L(8, "earthquake")]
  },
  magnemite: {
    id: "magnemite", spriteSlug: "magnemite", name: "小磁怪",
    learnset: [...L(1, "thunderShock", "metalSound"), ...L(3, "spark"), ...L(5, "thunderWave")],
    evolutions: [evoLv("magneton", 4)]
  },
  magneton: {
    id: "magneton", spriteSlug: "magneton", name: "三合一磁怪",
    learnset: [...L(1, "thunderShock"), ...L(3, "spark"), ...L(4, "thunderbolt"), ...L(6, "flashCannon"), ...L(7, "metalSound")],
    evolutions: [evoItem("magnezone", THUNDER_STONE)]
  },
  magnezone: {
    id: "magnezone", spriteSlug: "magnezone", name: "自爆磁怪",
    learnset: [...L(1, "spark"), ...L(4, "thunderbolt"), ...L(6, "flashCannon"), ...L(8, "discharge"), ...L(9, "ironDefense")]
  },
  onix: {
    id: "onix", spriteSlug: "onix", name: "大岩蛇",
    learnset: [...L(1, "tackle", "rockThrow"), ...L(3, "mudSlap"), ...L(5, "rockTomb"), ...L(7, "dig"), ...L(8, "rockSlide")],
    evolutions: [evoItem("steelix", METAL_COAT)]
  },
  steelix: {
    id: "steelix", spriteSlug: "steelix", name: "大钢蛇",
    learnset: [...L(1, "rockThrow"), ...L(4, "rockTomb"), ...L(6, "dig"), ...L(8, "ironHead"), ...L(8, "earthquake"), ...L(9, "ironDefense"), ...L(9, "stoneEdge")]
  },
  machop: {
    id: "machop", spriteSlug: "machop", name: "腕力",
    learnset: [...L(1, "lowKick", "karateChop"), ...L(3, "doubleKick"), ...L(5, "brickBreak")],
    evolutions: [evoLv("machoke", 4)]
  },
  machoke: {
    id: "machoke", spriteSlug: "machoke", name: "豪力",
    learnset: [...L(1, "lowKick", "karateChop"), ...L(4, "doubleKick"), ...L(6, "brickBreak"), ...L(7, "bulkUp")],
    evolutions: [evoItem("machamp", LINKING_CORD)]
  },
  machamp: {
    id: "machamp", spriteSlug: "machamp", name: "怪力",
    learnset: [...L(1, "karateChop"), ...L(4, "brickBreak"), ...L(6, "bulkUp"), ...L(8, "closeCombat"), ...L(9, "doubleEdge")]
  },
  meditite: {
    id: "meditite", spriteSlug: "meditite", name: "玛沙那",
    learnset: [...L(1, "lowKick", "confusion"), ...L(3, "doubleKick"), ...L(5, "zenHeadbutt")],
    evolutions: [evoLv("medicham", 6)]
  },
  medicham: {
    id: "medicham", spriteSlug: "medicham", name: "恰雷姆",
    learnset: [...L(1, "confusion"), ...L(3, "doubleKick"), ...L(5, "zenHeadbutt"), ...L(6, "brickBreak"), ...L(8, "psychic"), ...L(9, "closeCombat")]
  },
  aron: {
    id: "aron", spriteSlug: "aron", name: "可可多拉",
    learnset: [...L(1, "tackle", "metalClaw"), ...L(3, "rockThrow"), ...L(5, "ironDefense")],
    evolutions: [evoLv("lairon", 4)]
  },
  lairon: {
    id: "lairon", spriteSlug: "lairon", name: "可多拉",
    learnset: [...L(1, "tackle", "metalClaw"), ...L(4, "rockTomb"), ...L(6, "ironHead"), ...L(7, "bulldoze")],
    evolutions: [evoLv("aggron", 8)]
  },
  aggron: {
    id: "aggron", spriteSlug: "aggron", name: "波士可多拉",
    learnset: [...L(1, "metalClaw"), ...L(4, "rockTomb"), ...L(6, "ironHead"), ...L(8, "rockSlide"), ...L(8, "flashCannon"), ...L(9, "earthquake"), ...L(9, "stoneEdge")]
  },

  // ===== 火山 =====
  growlithe: {
    id: "growlithe", spriteSlug: "growlithe", name: "卡蒂狗",
    learnset: [...L(1, "bite", "ember"), ...L(3, "fireFang"), ...L(5, "flameBurst"), ...L(7, "flamethrower")],
    evolutions: [evoItem("arcanine", FIRE_STONE)]
  },
  arcanine: {
    id: "arcanine", spriteSlug: "arcanine", name: "风速狗",
    learnset: [...L(1, "bite", "fireFang"), ...L(5, "flameBurst"), ...L(7, "flamethrower"), ...L(8, "flareBlitz"), ...L(9, "crunch")]
  },
  vulpix: {
    id: "vulpix", spriteSlug: "vulpix", name: "六尾",
    learnset: [...L(1, "ember", "tailWhip"), ...L(3, "fireSpin"), ...L(5, "fireFang"), ...L(7, "willOWisp")],
    evolutions: [evoItem("ninetales", FIRE_STONE)]
  },
  ninetales: {
    id: "ninetales", spriteSlug: "ninetales", name: "九尾",
    learnset: [...L(1, "ember"), ...L(3, "fireSpin"), ...L(5, "fireFang"), ...L(7, "flamethrower"), ...L(8, "willOWisp"), ...L(9, "confuseRay")]
  },
  houndour: {
    id: "houndour", spriteSlug: "houndour", name: "戴鲁比",
    learnset: [...L(1, "bite", "ember"), ...L(3, "feintAttack"), ...L(5, "fireFang"), ...L(7, "snarl")],
    evolutions: [evoLv("houndoom", 6)]
  },
  houndoom: {
    id: "houndoom", spriteSlug: "houndoom", name: "黑鲁加",
    learnset: [...L(1, "ember"), ...L(3, "feintAttack"), ...L(5, "fireFang"), ...L(6, "crunch"), ...L(8, "flamethrower"), ...L(9, "nastyPlot")]
  },

  // ===== 雪原 / 超能 =====
  seel: {
    id: "seel", spriteSlug: "seel", name: "小海狮",
    learnset: [...L(1, "headbutt", "powderSnow"), ...L(3, "waterGun"), ...L(5, "auroraBeam")],
    evolutions: [evoLv("dewgong", 6)]
  },
  dewgong: {
    id: "dewgong", spriteSlug: "dewgong", name: "白海狮",
    learnset: [...L(1, "powderSnow"), ...L(3, "waterGun"), ...L(5, "auroraBeam"), ...L(6, "aquaJet"), ...L(8, "iceBeam"), ...L(8, "surf")]
  },
  drowzee: {
    id: "drowzee", spriteSlug: "drowzee", name: "催眠貘",
    learnset: [...L(1, "pound", "hypnosis"), ...L(3, "confusion"), ...L(5, "psybeam")],
    evolutions: [evoLv("hypno", 6)]
  },
  hypno: {
    id: "hypno", spriteSlug: "hypno", name: "引梦貘人",
    learnset: [...L(1, "confusion", "hypnosis"), ...L(3, "psybeam"), ...L(6, "zenHeadbutt"), ...L(8, "psychic"), ...L(9, "calmMind")]
  },
  abra: {
    id: "abra", spriteSlug: "abra", name: "凯西",
    learnset: [...L(1, "confusion")],
    evolutions: [evoLv("kadabra", 4)]
  },
  kadabra: {
    id: "kadabra", spriteSlug: "kadabra", name: "勇基拉",
    learnset: [...L(1, "confusion"), ...L(4, "psybeam"), ...L(6, "zenHeadbutt"), ...L(7, "calmMind")],
    evolutions: [evoItem("alakazam", LINKING_CORD)]
  },
  alakazam: {
    id: "alakazam", spriteSlug: "alakazam", name: "胡地",
    learnset: [...L(1, "confusion"), ...L(4, "psybeam"), ...L(6, "zenHeadbutt"), ...L(8, "psychic"), ...L(9, "calmMind")]
  },
  dratini: {
    id: "dratini", spriteSlug: "dratini", name: "迷你龙",
    learnset: [...L(1, "twister", "tackle"), ...L(3, "dragonBreath"), ...L(5, "dragonTail")],
    evolutions: [evoLv("dragonair", 4)]
  },
  dragonair: {
    id: "dragonair", spriteSlug: "dragonair", name: "哈克龙",
    learnset: [...L(1, "twister"), ...L(3, "dragonBreath"), ...L(4, "dragonTail"), ...L(6, "aquaTail"), ...L(7, "dragonDance")],
    evolutions: [evoLv("dragonite", 8)]
  },
  dragonite: {
    id: "dragonite", spriteSlug: "dragonite", name: "快龙",
    learnset: [...L(1, "dragonBreath"), ...L(4, "dragonTail"), ...L(6, "wingAttack"), ...L(8, "dragonClaw"), ...L(8, "dragonPulse"), ...L(9, "hyperBeam")],
    capture: { baseRate: 0.2, class: "elite" }
  },
  clefairy: {
    id: "clefairy", spriteSlug: "clefairy", name: "皮皮",
    learnset: [...L(1, "pound", "growl"), ...L(3, "fairyWind"), ...L(5, "disarmingVoice"), ...L(7, "drainingKiss")],
    evolutions: [evoItem("clefable", MOON_STONE)]
  },
  clefable: {
    id: "clefable", spriteSlug: "clefable", name: "皮可西",
    learnset: [...L(1, "fairyWind"), ...L(3, "disarmingVoice"), ...L(5, "drainingKiss"), ...L(8, "dazzlingGleam"), ...L(9, "moonblast")]
  },
  sneasel: {
    id: "sneasel", spriteSlug: "sneasel", name: "狃拉",
    learnset: [...L(1, "scratch", "feintAttack"), ...L(3, "iceShard"), ...L(5, "furyCutter"), ...L(7, "nightSlash")],
    evolutions: [evoItem("weavile", SHARP_CLAW)]
  },
  weavile: {
    id: "weavile", spriteSlug: "weavile", name: "玛狃拉",
    learnset: [...L(1, "feintAttack"), ...L(3, "iceShard"), ...L(5, "nightSlash"), ...L(7, "iceFang"), ...L(8, "icicleCrash"), ...L(9, "crunch")]
  },
  deino: {
    id: "deino", spriteSlug: "deino", name: "单首龙",
    learnset: [...L(1, "tackle", "bite"), ...L(3, "dragonBreath"), ...L(5, "crunch")],
    evolutions: [evoLv("zweilous", 4)]
  },
  zweilous: {
    id: "zweilous", spriteSlug: "zweilous", name: "双首暴龙",
    learnset: [...L(1, "bite"), ...L(3, "dragonBreath"), ...L(4, "crunch"), ...L(6, "dragonClaw"), ...L(7, "feintAttack")],
    evolutions: [evoLv("hydreigon", 8)]
  },
  hydreigon: {
    id: "hydreigon", spriteSlug: "hydreigon", name: "三首恶龙",
    learnset: [...L(1, "dragonBreath"), ...L(4, "crunch"), ...L(6, "dragonClaw"), ...L(8, "dragonPulse"), ...L(8, "snarl"), ...L(9, "hyperBeam")],
    capture: { baseRate: 0.2, class: "elite" }
  },

  // ===== 伊布（石头分叉） =====
  eevee: {
    id: "eevee", spriteSlug: "eevee", name: "伊布",
    learnset: [...L(1, "tackle", "growl"), ...L(3, "quickAttack"), ...L(5, "bite"), ...L(7, "doubleEdge")],
    evolutions: [evoItem("vaporeon", WATER_STONE), evoItem("jolteon", THUNDER_STONE), evoItem("flareon", FIRE_STONE)]
  },
  vaporeon: {
    id: "vaporeon", spriteSlug: "vaporeon", name: "水伊布",
    learnset: [...L(1, "tackle", "quickAttack"), ...L(5, "waterGun"), ...L(7, "bubbleBeam"), ...L(8, "aquaTail"), ...L(9, "surf")]
  },
  jolteon: {
    id: "jolteon", spriteSlug: "jolteon", name: "雷伊布",
    learnset: [...L(1, "tackle", "quickAttack"), ...L(5, "thunderShock"), ...L(7, "spark"), ...L(8, "thunderbolt"), ...L(9, "discharge")]
  },
  flareon: {
    id: "flareon", spriteSlug: "flareon", name: "火伊布",
    learnset: [...L(1, "tackle", "quickAttack"), ...L(5, "ember"), ...L(7, "fireFang"), ...L(8, "flamethrower"), ...L(9, "flareBlitz")]
  },

  // ===== 单点线（不进化） =====
  snorlax: {
    id: "snorlax", spriteSlug: "snorlax", name: "卡比兽",
    learnset: [...L(1, "tackle", "headbutt"), ...L(4, "bodySlam"), ...L(6, "crunch"), ...L(8, "doubleEdge"), ...L(9, "hyperBeam")]
  },
  aerodactyl: {
    id: "aerodactyl", spriteSlug: "aerodactyl", name: "化石翼龙",
    learnset: [...L(1, "bite", "wingAttack"), ...L(4, "rockTomb"), ...L(6, "aerialAce"), ...L(8, "rockSlide"), ...L(9, "crunch"), ...L(9, "stoneEdge")]
  },
  heracross: {
    id: "heracross", spriteSlug: "heracross", name: "赫拉克罗斯",
    learnset: [...L(1, "tackle", "lowKick"), ...L(4, "furyCutter"), ...L(6, "brickBreak"), ...L(8, "xScissor"), ...L(9, "closeCombat")]
  },
  delibird: {
    id: "delibird", spriteSlug: "delibird", name: "信使鸟",
    learnset: [...L(1, "peck", "powderSnow"), ...L(4, "iceShard"), ...L(6, "aerialAce"), ...L(8, "auroraBeam"), ...L(9, "iceBeam")]
  },
  sableye: {
    id: "sableye", spriteSlug: "sableye", name: "勾魂眼",
    learnset: [...L(1, "scratch", "astonish"), ...L(4, "feintAttack"), ...L(6, "shadowSneak"), ...L(8, "shadowClaw"), ...L(9, "shadowBall")]
  }
} satisfies Record<string, MonsterSpecies>;

export type SpeciesId = keyof typeof SPECIES;
