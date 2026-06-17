import type { Move } from "./types";

export const MOVES = {
  scratch: { id: "scratch", name: "抓", animation: "contact", accuracy: 100, calcName: "Scratch" },
  tackle: { id: "tackle", name: "撞击", animation: "contact", accuracy: 100, calcName: "Tackle" },
  ember: { id: "ember", name: "火花", animation: "projectile", accuracy: 100, calcName: "Ember" },
  flameBurst: { id: "flameBurst", name: "烈焰溅射", animation: "projectile", accuracy: 95, calcName: "Flame Burst" },
  vineWhip: { id: "vineWhip", name: "藤鞭", animation: "contact", accuracy: 100, calcName: "Vine Whip" },
  waterGun: { id: "waterGun", name: "水枪", animation: "projectile", accuracy: 100, calcName: "Water Gun" },
  gust: { id: "gust", name: "起风", animation: "projectile", accuracy: 100, calcName: "Gust" },
  rockThrow: { id: "rockThrow", name: "落石", animation: "projectile", accuracy: 90, calcName: "Rock Throw" },
  growl: { id: "growl", name: "叫声", animation: "status", accuracy: 100, calcName: "Growl" },
  smokescreen: { id: "smokescreen", name: "烟幕", animation: "status", accuracy: 100, calcName: "Smokescreen" },
  withdraw: { id: "withdraw", name: "缩入壳中", animation: "status", accuracy: 100, calcName: "Withdraw" },
  harden: { id: "harden", name: "变硬", animation: "status", accuracy: 100, calcName: "Harden" },
  sandAttack: { id: "sandAttack", name: "泼沙", animation: "status", accuracy: 100, calcName: "Sand Attack" }
} satisfies Record<string, Move>;

export type MoveId = keyof typeof MOVES;
