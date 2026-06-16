export const BATTLE_LAYOUT = {
  player: {
    platform: { x: 250, y: 392, width: 220, height: 48 },
    sprite: { scale: 2.9, footOffset: 34 },
    panel: { x: 600, y: 316 }
  },
  foe: {
    platform: { x: 690, y: 238, width: 190, height: 40 },
    sprite: { scale: 2.55, footOffset: 30 },
    panel: { x: 44, y: 62 }
  }
} as const;

export type BattleLayoutSide = keyof typeof BATTLE_LAYOUT;

export function getSpriteFootPosition(side: BattleLayoutSide, footOffset?: number): { x: number; y: number } {
  const layout = BATTLE_LAYOUT[side];
  return {
    x: layout.platform.x,
    y: layout.platform.y + layout.platform.height / 2 + (footOffset ?? layout.sprite.footOffset)
  };
}
