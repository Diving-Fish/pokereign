import type { Move } from "./types";

export const MOVES = {
  scratch: {
    id: "scratch",
    name: "抓",
    type: "normal",
    category: "physical",
    animation: "contact",
    power: 40,
    accuracy: 100
  },
  tackle: {
    id: "tackle",
    name: "撞击",
    type: "normal",
    category: "physical",
    animation: "contact",
    power: 40,
    accuracy: 100
  },
  ember: {
    id: "ember",
    name: "火花",
    type: "fire",
    category: "special",
    animation: "projectile",
    power: 40,
    accuracy: 100
  },
  flameBurst: {
    id: "flameBurst",
    name: "烈焰溅射",
    type: "fire",
    category: "special",
    animation: "projectile",
    power: 70,
    accuracy: 95
  },
  vineWhip: {
    id: "vineWhip",
    name: "藤鞭",
    type: "grass",
    category: "physical",
    animation: "contact",
    power: 45,
    accuracy: 100
  },
  waterGun: {
    id: "waterGun",
    name: "水枪",
    type: "water",
    category: "special",
    animation: "projectile",
    power: 40,
    accuracy: 100
  },
  gust: {
    id: "gust",
    name: "起风",
    type: "flying",
    category: "special",
    animation: "projectile",
    power: 40,
    accuracy: 100
  },
  rockThrow: {
    id: "rockThrow",
    name: "落石",
    type: "rock",
    category: "physical",
    animation: "projectile",
    power: 50,
    accuracy: 90
  },
  growl: {
    id: "growl",
    name: "叫声",
    type: "normal",
    category: "status",
    animation: "status",
    power: 0,
    accuracy: 100
  },
  smokescreen: {
    id: "smokescreen",
    name: "烟幕",
    type: "normal",
    category: "status",
    animation: "status",
    power: 0,
    accuracy: 100
  },
  withdraw: {
    id: "withdraw",
    name: "缩入壳中",
    type: "water",
    category: "status",
    animation: "status",
    power: 0,
    accuracy: 100
  },
  harden: {
    id: "harden",
    name: "变硬",
    type: "normal",
    category: "status",
    animation: "status",
    power: 0,
    accuracy: 100
  },
  sandAttack: {
    id: "sandAttack",
    name: "泼沙",
    type: "ground",
    category: "status",
    animation: "status",
    power: 0,
    accuracy: 100
  }
} satisfies Record<string, Move>;

export type MoveId = keyof typeof MOVES;
