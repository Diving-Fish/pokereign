import type { Move } from "./types";

/**
 * Move library. `calcName` must be a valid `@smogon/calc` (gen-9) move name —
 * type / category / base power are read from calc (`moveMeta` in smogonCalc.ts);
 * only `accuracy` and the visual `animation` live here. Organized by type so
 * species learnsets can pull a per-type kit (early / mid / strong / status).
 */
export const MOVES = {
  // --- Normal ---
  tackle: { id: "tackle", name: "撞击", animation: "contact", accuracy: 100, calcName: "Tackle", pp: 35 },
  scratch: { id: "scratch", name: "抓", animation: "contact", accuracy: 100, calcName: "Scratch", pp: 35 },
  pound: { id: "pound", name: "拍击", animation: "contact", accuracy: 100, calcName: "Pound", pp: 35 },
  quickAttack: { id: "quickAttack", name: "电光一闪", animation: "contact", accuracy: 100, calcName: "Quick Attack", pp: 30 },
  headbutt: { id: "headbutt", name: "头锤", animation: "contact", accuracy: 100, calcName: "Headbutt", pp: 15 },
  slash: { id: "slash", name: "居合斩", animation: "contact", accuracy: 100, calcName: "Slash", pp: 20 },
  bodySlam: { id: "bodySlam", name: "泰山压顶", animation: "contact", accuracy: 100, calcName: "Body Slam", pp: 15 },
  takeDown: { id: "takeDown", name: "舍身冲撞", animation: "contact", accuracy: 85, calcName: "Take Down", pp: 20 },
  doubleEdge: { id: "doubleEdge", name: "拼命", animation: "contact", accuracy: 100, calcName: "Double-Edge", pp: 15 },
  hyperBeam: { id: "hyperBeam", name: "破坏光线", animation: "projectile", accuracy: 90, calcName: "Hyper Beam", pp: 5 },
  growl: { id: "growl", name: "叫声", animation: "status", accuracy: 100, calcName: "Growl", pp: 40 },
  tailWhip: { id: "tailWhip", name: "摇尾巴", animation: "status", accuracy: 100, calcName: "Tail Whip", pp: 30 },
  swordsDance: { id: "swordsDance", name: "剑舞", animation: "status", accuracy: 100, calcName: "Swords Dance", pp: 20 },
  harden: { id: "harden", name: "变硬", animation: "status", accuracy: 100, calcName: "Harden", pp: 30 },

  // --- Fire ---
  ember: { id: "ember", name: "火花", animation: "projectile", accuracy: 100, calcName: "Ember", pp: 25 },
  flameBurst: { id: "flameBurst", name: "烈焰溅射", animation: "projectile", accuracy: 100, calcName: "Flame Burst", pp: 15 },
  fireFang: { id: "fireFang", name: "火焰牙", animation: "contact", accuracy: 95, calcName: "Fire Fang", pp: 15 },
  flamethrower: { id: "flamethrower", name: "喷射火焰", animation: "projectile", accuracy: 100, calcName: "Flamethrower", pp: 15 },
  fireSpin: { id: "fireSpin", name: "火焰旋涡", animation: "projectile", accuracy: 85, calcName: "Fire Spin", pp: 15 },
  flareBlitz: { id: "flareBlitz", name: "闪焰冲锋", animation: "contact", accuracy: 100, calcName: "Flare Blitz", pp: 15 },
  smokescreen: { id: "smokescreen", name: "烟幕", animation: "status", accuracy: 100, calcName: "Smokescreen", pp: 20 },
  willOWisp: { id: "willOWisp", name: "鬼火", animation: "status", accuracy: 85, calcName: "Will-O-Wisp", pp: 15 },

  // --- Water ---
  waterGun: { id: "waterGun", name: "水枪", animation: "projectile", accuracy: 100, calcName: "Water Gun", pp: 25 },
  bubbleBeam: { id: "bubbleBeam", name: "泡沫光线", animation: "projectile", accuracy: 100, calcName: "Bubble Beam", pp: 20 },
  aquaJet: { id: "aquaJet", name: "水流喷射", animation: "contact", accuracy: 100, calcName: "Aqua Jet", pp: 20 },
  aquaTail: { id: "aquaTail", name: "水流尾", animation: "contact", accuracy: 90, calcName: "Aqua Tail", pp: 10 },
  surf: { id: "surf", name: "冲浪", animation: "projectile", accuracy: 100, calcName: "Surf", pp: 15 },
  hydroPump: { id: "hydroPump", name: "水炮", animation: "projectile", accuracy: 80, calcName: "Hydro Pump", pp: 5 },
  withdraw: { id: "withdraw", name: "缩入壳中", animation: "status", accuracy: 100, calcName: "Withdraw", pp: 40 },

  // --- Grass ---
  absorb: { id: "absorb", name: "吸取", animation: "projectile", accuracy: 100, calcName: "Absorb", pp: 25 },
  vineWhip: { id: "vineWhip", name: "藤鞭", animation: "contact", accuracy: 100, calcName: "Vine Whip", pp: 25 },
  razorLeaf: { id: "razorLeaf", name: "飞叶快刀", animation: "projectile", accuracy: 95, calcName: "Razor Leaf", pp: 25 },
  megaDrain: { id: "megaDrain", name: "超级吸取", animation: "projectile", accuracy: 100, calcName: "Mega Drain", pp: 15 },
  gigaDrain: { id: "gigaDrain", name: "终极吸取", animation: "projectile", accuracy: 100, calcName: "Giga Drain", pp: 10 },
  seedBomb: { id: "seedBomb", name: "种子炸弹", animation: "projectile", accuracy: 100, calcName: "Seed Bomb", pp: 15 },
  leafBlade: { id: "leafBlade", name: "叶刃", animation: "contact", accuracy: 100, calcName: "Leaf Blade", pp: 15 },
  energyBall: { id: "energyBall", name: "能量球", animation: "projectile", accuracy: 100, calcName: "Energy Ball", pp: 10 },
  sleepPowder: { id: "sleepPowder", name: "催眠粉", animation: "status", accuracy: 75, calcName: "Sleep Powder", pp: 15 },

  // --- Electric ---
  thunderShock: { id: "thunderShock", name: "电击", animation: "projectile", accuracy: 100, calcName: "Thunder Shock", pp: 30 },
  spark: { id: "spark", name: "电光", animation: "contact", accuracy: 100, calcName: "Spark", pp: 20 },
  thunderFang: { id: "thunderFang", name: "雷电牙", animation: "contact", accuracy: 95, calcName: "Thunder Fang", pp: 15 },
  thunderbolt: { id: "thunderbolt", name: "十万伏特", animation: "projectile", accuracy: 100, calcName: "Thunderbolt", pp: 15 },
  discharge: { id: "discharge", name: "放电", animation: "projectile", accuracy: 100, calcName: "Discharge", pp: 15 },
  thunderWave: { id: "thunderWave", name: "电磁波", animation: "status", accuracy: 90, calcName: "Thunder Wave", pp: 20 },

  // --- Ice ---
  powderSnow: { id: "powderSnow", name: "细雪", animation: "projectile", accuracy: 100, calcName: "Powder Snow", pp: 25 },
  iceShard: { id: "iceShard", name: "冰砾", animation: "projectile", accuracy: 100, calcName: "Ice Shard", pp: 30 },
  iceFang: { id: "iceFang", name: "冰冻牙", animation: "contact", accuracy: 95, calcName: "Ice Fang", pp: 15 },
  auroraBeam: { id: "auroraBeam", name: "极光束", animation: "projectile", accuracy: 100, calcName: "Aurora Beam", pp: 20 },
  iceBeam: { id: "iceBeam", name: "冰冻光束", animation: "projectile", accuracy: 100, calcName: "Ice Beam", pp: 10 },
  icicleCrash: { id: "icicleCrash", name: "冰柱坠击", animation: "projectile", accuracy: 90, calcName: "Icicle Crash", pp: 10 },

  // --- Fighting ---
  karateChop: { id: "karateChop", name: "空手劈", animation: "contact", accuracy: 100, calcName: "Karate Chop", pp: 25 },
  doubleKick: { id: "doubleKick", name: "二连踢", animation: "contact", accuracy: 100, calcName: "Double Kick", pp: 30 },
  lowKick: { id: "lowKick", name: "踢倒", animation: "contact", accuracy: 100, calcName: "Low Kick", pp: 20 },
  brickBreak: { id: "brickBreak", name: "劈瓦", animation: "contact", accuracy: 100, calcName: "Brick Break", pp: 15 },
  closeCombat: { id: "closeCombat", name: "近身战", animation: "contact", accuracy: 100, calcName: "Close Combat", pp: 5 },
  bulkUp: { id: "bulkUp", name: "健美", animation: "status", accuracy: 100, calcName: "Bulk Up", pp: 20 },

  // --- Poison ---
  poisonSting: { id: "poisonSting", name: "毒针", animation: "projectile", accuracy: 100, calcName: "Poison Sting", pp: 35 },
  acid: { id: "acid", name: "溶解液", animation: "projectile", accuracy: 100, calcName: "Acid", pp: 30 },
  sludge: { id: "sludge", name: "污泥攻击", animation: "projectile", accuracy: 100, calcName: "Sludge", pp: 20 },
  poisonFang: { id: "poisonFang", name: "剧毒牙", animation: "contact", accuracy: 100, calcName: "Poison Fang", pp: 15 },
  sludgeBomb: { id: "sludgeBomb", name: "污泥炸弹", animation: "projectile", accuracy: 100, calcName: "Sludge Bomb", pp: 10 },
  poisonPowder: { id: "poisonPowder", name: "毒粉", animation: "status", accuracy: 75, calcName: "Poison Powder", pp: 35 },
  toxic: { id: "toxic", name: "剧毒", animation: "status", accuracy: 90, calcName: "Toxic", pp: 10 },

  // --- Ground ---
  mudSlap: { id: "mudSlap", name: "掷泥", animation: "projectile", accuracy: 100, calcName: "Mud-Slap", pp: 10 },
  mudShot: { id: "mudShot", name: "泥巴射击", animation: "projectile", accuracy: 95, calcName: "Mud Shot", pp: 15 },
  bulldoze: { id: "bulldoze", name: "重踏", animation: "contact", accuracy: 100, calcName: "Bulldoze", pp: 20 },
  dig: { id: "dig", name: "挖洞", animation: "contact", accuracy: 100, calcName: "Dig", pp: 10 },
  boneClub: { id: "boneClub", name: "骨棒", animation: "projectile", accuracy: 85, calcName: "Bone Club", pp: 20 },
  earthquake: { id: "earthquake", name: "地震", animation: "status", accuracy: 100, calcName: "Earthquake", pp: 10 },
  sandAttack: { id: "sandAttack", name: "泼沙", animation: "status", accuracy: 100, calcName: "Sand Attack", pp: 15 },

  // --- Flying ---
  peck: { id: "peck", name: "啄", animation: "contact", accuracy: 100, calcName: "Peck", pp: 35 },
  gust: { id: "gust", name: "起风", animation: "projectile", accuracy: 100, calcName: "Gust", pp: 35 },
  wingAttack: { id: "wingAttack", name: "翅膀攻击", animation: "contact", accuracy: 100, calcName: "Wing Attack", pp: 35 },
  aerialAce: { id: "aerialAce", name: "燕返", animation: "contact", accuracy: 100, calcName: "Aerial Ace", pp: 20 },
  airSlash: { id: "airSlash", name: "空气利刃", animation: "projectile", accuracy: 95, calcName: "Air Slash", pp: 15 },
  drillPeck: { id: "drillPeck", name: "啄钻", animation: "contact", accuracy: 100, calcName: "Drill Peck", pp: 20 },
  roost: { id: "roost", name: "羽栖", animation: "status", accuracy: 100, calcName: "Roost", pp: 5 },

  // --- Psychic ---
  confusion: { id: "confusion", name: "念力", animation: "projectile", accuracy: 100, calcName: "Confusion", pp: 25 },
  psybeam: { id: "psybeam", name: "幻象光线", animation: "projectile", accuracy: 100, calcName: "Psybeam", pp: 20 },
  zenHeadbutt: { id: "zenHeadbutt", name: "意念头锤", animation: "contact", accuracy: 90, calcName: "Zen Headbutt", pp: 15 },
  psychic: { id: "psychic", name: "精神强念", animation: "projectile", accuracy: 100, calcName: "Psychic", pp: 10 },
  hypnosis: { id: "hypnosis", name: "催眠术", animation: "status", accuracy: 60, calcName: "Hypnosis", pp: 20 },
  calmMind: { id: "calmMind", name: "冥想", animation: "status", accuracy: 100, calcName: "Calm Mind", pp: 20 },

  // --- Bug ---
  bugBite: { id: "bugBite", name: "虫咬", animation: "contact", accuracy: 100, calcName: "Bug Bite", pp: 20 },
  furyCutter: { id: "furyCutter", name: "连斩", animation: "contact", accuracy: 95, calcName: "Fury Cutter", pp: 20 },
  struggleBug: { id: "struggleBug", name: "虫之抵抗", animation: "projectile", accuracy: 100, calcName: "Struggle Bug", pp: 20 },
  silverWind: { id: "silverWind", name: "银色旋风", animation: "projectile", accuracy: 100, calcName: "Silver Wind", pp: 5 },
  xScissor: { id: "xScissor", name: "十字剪", animation: "contact", accuracy: 100, calcName: "X-Scissor", pp: 15 },
  bugBuzz: { id: "bugBuzz", name: "虫鸣", animation: "projectile", accuracy: 100, calcName: "Bug Buzz", pp: 10 },
  stringShot: { id: "stringShot", name: "吐丝", animation: "status", accuracy: 95, calcName: "String Shot", pp: 40 },

  // --- Rock ---
  rockThrow: { id: "rockThrow", name: "落石", animation: "projectile", accuracy: 90, calcName: "Rock Throw", pp: 15 },
  rockTomb: { id: "rockTomb", name: "岩石封锁", animation: "projectile", accuracy: 95, calcName: "Rock Tomb", pp: 15 },
  smackDown: { id: "smackDown", name: "击落", animation: "projectile", accuracy: 100, calcName: "Smack Down", pp: 15 },
  rockSlide: { id: "rockSlide", name: "岩崩", animation: "projectile", accuracy: 90, calcName: "Rock Slide", pp: 10 },
  stoneEdge: { id: "stoneEdge", name: "尖石攻击", animation: "projectile", accuracy: 80, calcName: "Stone Edge", pp: 5 },
  rockPolish: { id: "rockPolish", name: "岩石打磨", animation: "status", accuracy: 100, calcName: "Rock Polish", pp: 20 },

  // --- Ghost ---
  lick: { id: "lick", name: "舌舔", animation: "contact", accuracy: 100, calcName: "Lick", pp: 30 },
  astonish: { id: "astonish", name: "惊吓", animation: "contact", accuracy: 100, calcName: "Astonish", pp: 15 },
  shadowSneak: { id: "shadowSneak", name: "影子偷袭", animation: "contact", accuracy: 100, calcName: "Shadow Sneak", pp: 30 },
  shadowClaw: { id: "shadowClaw", name: "暗影爪", animation: "contact", accuracy: 100, calcName: "Shadow Claw", pp: 15 },
  hex: { id: "hex", name: "祸不单行", animation: "projectile", accuracy: 100, calcName: "Hex", pp: 10 },
  shadowBall: { id: "shadowBall", name: "暗影球", animation: "projectile", accuracy: 100, calcName: "Shadow Ball", pp: 15 },
  confuseRay: { id: "confuseRay", name: "奇异之光", animation: "status", accuracy: 100, calcName: "Confuse Ray", pp: 10 },

  // --- Dragon ---
  twister: { id: "twister", name: "龙卷风", animation: "projectile", accuracy: 100, calcName: "Twister", pp: 20 },
  dragonBreath: { id: "dragonBreath", name: "龙息", animation: "projectile", accuracy: 100, calcName: "Dragon Breath", pp: 20 },
  dragonClaw: { id: "dragonClaw", name: "龙爪", animation: "contact", accuracy: 100, calcName: "Dragon Claw", pp: 15 },
  dragonPulse: { id: "dragonPulse", name: "龙之波动", animation: "projectile", accuracy: 100, calcName: "Dragon Pulse", pp: 10 },
  dragonTail: { id: "dragonTail", name: "龙尾", animation: "contact", accuracy: 90, calcName: "Dragon Tail", pp: 10 },
  dragonDance: { id: "dragonDance", name: "龙之舞", animation: "status", accuracy: 100, calcName: "Dragon Dance", pp: 20 },

  // --- Dark ---
  bite: { id: "bite", name: "咬住", animation: "contact", accuracy: 100, calcName: "Bite", pp: 25 },
  feintAttack: { id: "feintAttack", name: "出奇一击", animation: "contact", accuracy: 100, calcName: "Feint Attack", pp: 20 },
  snarl: { id: "snarl", name: "大声咆哮", animation: "projectile", accuracy: 95, calcName: "Snarl", pp: 15 },
  nightSlash: { id: "nightSlash", name: "暗袭要害", animation: "contact", accuracy: 100, calcName: "Night Slash", pp: 15 },
  crunch: { id: "crunch", name: "咬碎", animation: "contact", accuracy: 100, calcName: "Crunch", pp: 15 },
  nastyPlot: { id: "nastyPlot", name: "诡计", animation: "status", accuracy: 100, calcName: "Nasty Plot", pp: 20 },

  // --- Steel ---
  metalClaw: { id: "metalClaw", name: "金属爪", animation: "contact", accuracy: 95, calcName: "Metal Claw", pp: 35 },
  bulletPunch: { id: "bulletPunch", name: "子弹拳", animation: "contact", accuracy: 100, calcName: "Bullet Punch", pp: 30 },
  ironHead: { id: "ironHead", name: "铁头", animation: "contact", accuracy: 100, calcName: "Iron Head", pp: 15 },
  flashCannon: { id: "flashCannon", name: "加农光炮", animation: "projectile", accuracy: 100, calcName: "Flash Cannon", pp: 10 },
  ironDefense: { id: "ironDefense", name: "铁壁", animation: "status", accuracy: 100, calcName: "Iron Defense", pp: 15 },
  metalSound: { id: "metalSound", name: "金属音", animation: "status", accuracy: 85, calcName: "Metal Sound", pp: 40 },

  // --- Fairy ---
  fairyWind: { id: "fairyWind", name: "妖精之风", animation: "projectile", accuracy: 100, calcName: "Fairy Wind", pp: 30 },
  disarmingVoice: { id: "disarmingVoice", name: "魅惑之声", animation: "projectile", accuracy: 100, calcName: "Disarming Voice", pp: 15 },
  drainingKiss: { id: "drainingKiss", name: "吸取之吻", animation: "contact", accuracy: 100, calcName: "Draining Kiss", pp: 10 },
  dazzlingGleam: { id: "dazzlingGleam", name: "魔法闪耀", animation: "projectile", accuracy: 100, calcName: "Dazzling Gleam", pp: 10 },
  playRough: { id: "playRough", name: "嬉闹", animation: "contact", accuracy: 90, calcName: "Play Rough", pp: 10 },
  moonblast: { id: "moonblast", name: "月亮之力", animation: "projectile", accuracy: 100, calcName: "Moonblast", pp: 15 },
  sweetKiss: { id: "sweetKiss", name: "天使之吻", animation: "status", accuracy: 75, calcName: "Sweet Kiss", pp: 10 }
} satisfies Record<string, Move>;

export type MoveId = keyof typeof MOVES;
