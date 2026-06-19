import type { MoveId } from "./moves";

/**
 * Item registry. Items drive four systems:
 * - `held`  — battle effect via `@smogon/calc`'s item (passed through as
 *   `calcItem`); equip onto a monster's `heldItem` (stores the item id).
 * - `stone` — evolution trigger; matched against a species' `EvolutionRule.requiredItem`.
 * - `tm`    — teaches `teachesMove` when used (reuses the move-learn flow).
 * - `medicine` / `berry` — immediate HP / revive / level effects when used.
 *
 * The doc §11 "single backpack slot + immediate decision" economy lives in the
 * run state / pickup flow, not here; this is just the catalog.
 */
export type ItemKind = "held" | "stone" | "tm" | "medicine" | "berry";

export type Item = {
  id: string;
  name: string;
  kind: ItemKind;
  desc: string;
  /** held / berry: the `@smogon/calc` item name applied in battle. */
  calcItem?: string;
  /** tm: the move taught when used. */
  teachesMove?: MoveId;
  /** medicine / berry: flat HP restored (use `healFull` for a full heal). */
  heal?: number;
  healFull?: boolean;
  /** medicine: revive a fainted monster to this fraction of max HP (0..1). */
  revive?: number;
  /** rare candy: in-game levels granted. */
  candyLevels?: number;
};

export const ITEMS = {
  // --- Type-boost held items (boost matching-type moves ~20%) ---
  charcoal: { id: "charcoal", name: "木炭", kind: "held", calcItem: "Charcoal", desc: "提高火属性招式威力。" },
  mysticWater: { id: "mysticWater", name: "神秘水滴", kind: "held", calcItem: "Mystic Water", desc: "提高水属性招式威力。" },
  miracleSeed: { id: "miracleSeed", name: "奇迹种子", kind: "held", calcItem: "Miracle Seed", desc: "提高草属性招式威力。" },
  magnet: { id: "magnet", name: "磁铁", kind: "held", calcItem: "Magnet", desc: "提高电属性招式威力。" },
  neverMeltIce: { id: "neverMeltIce", name: "不融冰", kind: "held", calcItem: "Never-Melt Ice", desc: "提高冰属性招式威力。" },
  blackBelt: { id: "blackBelt", name: "黑带", kind: "held", calcItem: "Black Belt", desc: "提高格斗属性招式威力。" },
  poisonBarb: { id: "poisonBarb", name: "毒针", kind: "held", calcItem: "Poison Barb", desc: "提高毒属性招式威力。" },
  softSand: { id: "softSand", name: "柔软沙子", kind: "held", calcItem: "Soft Sand", desc: "提高地面属性招式威力。" },
  sharpBeak: { id: "sharpBeak", name: "锐利鸟嘴", kind: "held", calcItem: "Sharp Beak", desc: "提高飞行属性招式威力。" },
  twistedSpoon: { id: "twistedSpoon", name: "弯曲的汤匙", kind: "held", calcItem: "Twisted Spoon", desc: "提高超能属性招式威力。" },
  silverPowder: { id: "silverPowder", name: "银粉", kind: "held", calcItem: "Silver Powder", desc: "提高虫属性招式威力。" },
  hardStone: { id: "hardStone", name: "硬石头", kind: "held", calcItem: "Hard Stone", desc: "提高岩石属性招式威力。" },
  spellTag: { id: "spellTag", name: "诅咒之符", kind: "held", calcItem: "Spell Tag", desc: "提高幽灵属性招式威力。" },
  dragonFang: { id: "dragonFang", name: "龙之牙", kind: "held", calcItem: "Dragon Fang", desc: "提高龙属性招式威力。" },
  blackGlasses: { id: "blackGlasses", name: "黑色眼镜", kind: "held", calcItem: "Black Glasses", desc: "提高恶属性招式威力。" },
  fairyFeather: { id: "fairyFeather", name: "妖精之羽", kind: "held", calcItem: "Fairy Feather", desc: "提高妖精属性招式威力。" },
  silkScarf: { id: "silkScarf", name: "丝绸围巾", kind: "held", calcItem: "Silk Scarf", desc: "提高一般属性招式威力。" },

  // --- Signature held items ---
  lifeOrb: { id: "lifeOrb", name: "生命宝珠", kind: "held", calcItem: "Life Orb", desc: "招式威力提升，但每次攻击会损血。" },
  choiceBand: { id: "choiceBand", name: "讲究头带", kind: "held", calcItem: "Choice Band", desc: "攻击大幅提升，但只能使出第一个招式。" },
  choiceSpecs: { id: "choiceSpecs", name: "讲究眼镜", kind: "held", calcItem: "Choice Specs", desc: "特攻大幅提升，但只能使出第一个招式。" },
  choiceScarf: { id: "choiceScarf", name: "讲究围巾", kind: "held", calcItem: "Choice Scarf", desc: "速度大幅提升，但只能使出第一个招式。" },
  leftovers: { id: "leftovers", name: "吃剩的东西", kind: "held", calcItem: "Leftovers", desc: "每回合缓慢回复体力。" },
  assaultVest: { id: "assaultVest", name: "突击背心", kind: "held", calcItem: "Assault Vest", desc: "特防提升，但无法使用变化招式。" },
  eviolite: { id: "eviolite", name: "进化奇石", kind: "held", calcItem: "Eviolite", desc: "未进化宝可梦的防御与特防提升。" },
  shellBell: { id: "shellBell", name: "贝壳之铃", kind: "held", calcItem: "Shell Bell", desc: "造成伤害时回复少量体力。" },

  // --- Evolution stones / items (match EvolutionRule.requiredItem by id) ---
  fireStone: { id: "fireStone", name: "火之石", kind: "stone", desc: "让特定宝可梦进化的火红石头。" },
  waterStone: { id: "waterStone", name: "水之石", kind: "stone", desc: "让特定宝可梦进化的湛蓝石头。" },
  thunderStone: { id: "thunderStone", name: "雷之石", kind: "stone", desc: "让特定宝可梦进化的带电石头。" },
  leafStone: { id: "leafStone", name: "叶之石", kind: "stone", desc: "让特定宝可梦进化的草绿石头。" },
  moonStone: { id: "moonStone", name: "月之石", kind: "stone", desc: "让特定宝可梦进化的漆黑石头。" },
  linkingCord: { id: "linkingCord", name: "连接绳", kind: "stone", desc: "原本靠通信交换进化的宝可梦可用它进化。" },
  metalCoat: { id: "metalCoat", name: "金属外膜", kind: "stone", desc: "特殊的金属膜，让特定宝可梦进化。" },
  sharpClaw: { id: "sharpClaw", name: "锐利之爪", kind: "stone", desc: "锐利的爪子，让特定宝可梦进化。" },

  // --- Technical Machines (teach a move) ---
  tmFlamethrower: { id: "tmFlamethrower", name: "招式机·喷射火焰", kind: "tm", teachesMove: "flamethrower", desc: "教会宝可梦“喷射火焰”。" },
  tmThunderbolt: { id: "tmThunderbolt", name: "招式机·十万伏特", kind: "tm", teachesMove: "thunderbolt", desc: "教会宝可梦“十万伏特”。" },
  tmIceBeam: { id: "tmIceBeam", name: "招式机·冰冻光束", kind: "tm", teachesMove: "iceBeam", desc: "教会宝可梦“冰冻光束”。" },
  tmEarthquake: { id: "tmEarthquake", name: "招式机·地震", kind: "tm", teachesMove: "earthquake", desc: "教会宝可梦“地震”。" },
  tmShadowBall: { id: "tmShadowBall", name: "招式机·暗影球", kind: "tm", teachesMove: "shadowBall", desc: "教会宝可梦“暗影球”。" },
  tmDazzlingGleam: { id: "tmDazzlingGleam", name: "招式机·魔法闪耀", kind: "tm", teachesMove: "dazzlingGleam", desc: "教会宝可梦“魔法闪耀”。" },
  tmSludgeBomb: { id: "tmSludgeBomb", name: "招式机·污泥炸弹", kind: "tm", teachesMove: "sludgeBomb", desc: "教会宝可梦“污泥炸弹”。" },
  tmRockSlide: { id: "tmRockSlide", name: "招式机·岩崩", kind: "tm", teachesMove: "rockSlide", desc: "教会宝可梦“岩崩”。" },

  // --- Medicine ---
  potion: { id: "potion", name: "伤药", kind: "medicine", heal: 30, desc: "回复少量体力。" },
  superPotion: { id: "superPotion", name: "好伤药", kind: "medicine", heal: 60, desc: "回复中量体力。" },
  hyperPotion: { id: "hyperPotion", name: "厉害伤药", kind: "medicine", heal: 120, desc: "回复大量体力。" },
  fullRestore: { id: "fullRestore", name: "全满药", kind: "medicine", healFull: true, desc: "回复全部体力。" },
  revive: { id: "revive", name: "活力碎片", kind: "medicine", revive: 0.5, desc: "让一只倒下的宝可梦恢复一半体力。" },
  maxRevive: { id: "maxRevive", name: "活力块", kind: "medicine", revive: 1, desc: "让一只倒下的宝可梦完全恢复。" },
  rareCandy: { id: "rareCandy", name: "经验糖果", kind: "medicine", candyLevels: 1, desc: "使用后等级提升 1 级。" },

  // --- Berries (immediate use here; held auto-trigger is later) ---
  sitrusBerry: { id: "sitrusBerry", name: "文柚果", kind: "berry", calcItem: "Sitrus Berry", heal: 0, desc: "携带时体力低于一半会自动回复约 25% 体力。" },
  lumBerry: { id: "lumBerry", name: "木子果", kind: "berry", calcItem: "Lum Berry", desc: "携带时治愈任何异常状态。" }
} satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;

/**
 * Showdown `itemicons-sheet.png` sprite indices, used to crop each item's 24×24
 * icon (sheet is 16 columns: `left=(n%16)*24, top=⌊n/16⌋*24`). Only items that
 * exist in Showdown's battle item data have one — bag medicines, TMs, and the
 * linking cord aren't in it (it's a battle sim), so they fall back to a drawn
 * icon (see client/render/itemIcon.ts).
 */
export const ITEM_SPRITENUM: Partial<Record<ItemId, number>> = {
  charcoal: 61, mysticWater: 300, miracleSeed: 292, magnet: 273, neverMeltIce: 305,
  blackBelt: 32, poisonBarb: 343, softSand: 456, sharpBeak: 436, twistedSpoon: 520,
  silverPowder: 447, hardStone: 187, spellTag: 461, dragonFang: 106, blackGlasses: 35,
  fairyFeather: 754, silkScarf: 444, lifeOrb: 249, choiceBand: 68, choiceSpecs: 70,
  choiceScarf: 69, leftovers: 242, assaultVest: 581, eviolite: 130, shellBell: 438,
  fireStone: 142, waterStone: 529, thunderStone: 492, leafStone: 241, moonStone: 295,
  metalCoat: 286, sharpClaw: 382, sitrusBerry: 448, lumBerry: 262
};

/** Localized display name for an item id (falls back to the raw id). */
export function itemName(id: string | undefined): string {
  if (!id) return "无";
  return (ITEMS as Record<string, Item>)[id]?.name ?? id;
}

/** The `@smogon/calc` item name for a held item id, if it has a battle effect. */
export function itemCalcName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return (ITEMS as Record<string, Item>)[id]?.calcItem;
}
