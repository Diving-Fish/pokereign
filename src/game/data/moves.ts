import type { Move } from "./types";

export const MOVES = {
  scratch: { id: "scratch", name: "抓", animation: "contact", accuracy: 100, calcName: "Scratch", pp: 35 },
  tackle: { id: "tackle", name: "撞击", animation: "contact", accuracy: 100, calcName: "Tackle", pp: 35 },
  ember: { id: "ember", name: "火花", animation: "projectile", accuracy: 100, calcName: "Ember", pp: 25 },
  flameBurst: { id: "flameBurst", name: "烈焰溅射", animation: "projectile", accuracy: 95, calcName: "Flame Burst", pp: 15 },
  vineWhip: { id: "vineWhip", name: "藤鞭", animation: "contact", accuracy: 100, calcName: "Vine Whip", pp: 25 },
  waterGun: { id: "waterGun", name: "水枪", animation: "projectile", accuracy: 100, calcName: "Water Gun", pp: 25 },
  gust: { id: "gust", name: "起风", animation: "projectile", accuracy: 100, calcName: "Gust", pp: 35 },
  rockThrow: { id: "rockThrow", name: "落石", animation: "projectile", accuracy: 90, calcName: "Rock Throw", pp: 15 },
  growl: { id: "growl", name: "叫声", animation: "status", accuracy: 100, calcName: "Growl", pp: 40 },
  smokescreen: { id: "smokescreen", name: "烟幕", animation: "status", accuracy: 100, calcName: "Smokescreen", pp: 20 },
  withdraw: { id: "withdraw", name: "缩入壳中", animation: "status", accuracy: 100, calcName: "Withdraw", pp: 40 },
  harden: { id: "harden", name: "变硬", animation: "status", accuracy: 100, calcName: "Harden", pp: 30 },
  sandAttack: { id: "sandAttack", name: "泼沙", animation: "status", accuracy: 100, calcName: "Sand Attack", pp: 15 }
} satisfies Record<string, Move>;

export type MoveId = keyof typeof MOVES;
