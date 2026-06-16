import { MOVES, type MoveId } from "../data/moves";
import type { Move } from "../data/types";
import { typeEffectiveness } from "./typeChart";
import type { BattleCommand, BattleEvent, BattleMonster, BattleStateView, BattleTurnResult } from "./types";

type BattleEngineOptions = {
  playerRoster: BattleMonster[];
  opponentRoster: BattleMonster[];
};

export class BattleEngine {
  private playerRoster: BattleMonster[];
  private opponentRoster: BattleMonster[];
  private playerActiveIndex = 0;
  private opponentActiveIndex = 0;

  constructor(options: BattleEngineOptions) {
    this.playerRoster = options.playerRoster;
    this.opponentRoster = options.opponentRoster;
  }

  view(): BattleStateView {
    return {
      player: {
        activeIndex: this.playerActiveIndex,
        active: this.playerRoster[this.playerActiveIndex],
        roster: this.playerRoster
      },
      opponent: {
        activeIndex: this.opponentActiveIndex,
        active: this.opponentRoster[this.opponentActiveIndex],
        roster: this.opponentRoster
      }
    };
  }

  runTurn(playerCommand: BattleCommand): BattleTurnResult {
    const log: string[] = [];
    const events: BattleEvent[] = [];

    if (playerCommand.type === "switch") {
      this.switchPlayer(playerCommand.targetIndex, log, events);
    }

    const opponentCommand = this.pickOpponentCommand();
    const activePlayer = this.playerRoster[this.playerActiveIndex];
    const opponent = this.opponentRoster[this.opponentActiveIndex];

    if (playerCommand.type === "move") {
      const playerAction = () => this.useMove(activePlayer, opponent, playerCommand.moveId, log, events);
      const opponentAction = () => this.useMove(opponent, activePlayer, opponentCommand.moveId, log, events);

      if (effectiveSpeed(activePlayer) >= effectiveSpeed(opponent)) {
        playerAction();
        if (!isFainted(opponent)) {
          opponentAction();
        }
      } else {
        opponentAction();
        if (!isFainted(activePlayer)) {
          playerAction();
        }
      }
    } else if (!isFainted(opponent)) {
      this.useMove(opponent, this.playerRoster[this.playerActiveIndex], opponentCommand.moveId, log, events);
    }

    this.autoPromoteFaintedOpponent(log, events);
    this.autoPromoteFaintedPlayer(log, events);

    return {
      log,
      events,
      outcome: this.getOutcome()
    };
  }

  private switchPlayer(targetIndex: number, log: string[], events: BattleEvent[]): void {
    const target = this.playerRoster[targetIndex];
    if (!target || target.currentHp <= 0 || targetIndex === this.playerActiveIndex) {
      log.push("无法换到这个位置。");
      events.push({ type: "message", text: "无法换到这个位置。" });
      return;
    }

    const previous = this.playerRoster[this.playerActiveIndex];
    this.playerActiveIndex = targetIndex;
    log.push(`${previous.name} 回来！去吧，${target.name}！`);
    events.push({ type: "message", text: `${previous.name} 回来！去吧，${target.name}！` });
  }

  private pickOpponentCommand(): { type: "move"; moveId: MoveId } {
    const active = this.opponentRoster[this.opponentActiveIndex];
    const damagingMove = active.moves.find((moveId) => MOVES[moveId].power > 0) ?? active.moves[0];
    return { type: "move", moveId: damagingMove };
  }

  private useMove(user: BattleMonster, target: BattleMonster, moveId: MoveId, log: string[], events: BattleEvent[]): void {
    if (isFainted(user)) {
      return;
    }

    const move = MOVES[moveId];
    log.push(`${user.name} 使用了 ${move.name}。`);
    events.push({
      type: "move",
      userId: user.instanceId,
      targetId: target.instanceId,
      userSide: user.side,
      targetSide: target.side,
      userName: user.name,
      targetName: target.name,
      moveId,
      moveName: move.name,
      animation: move.animation
    });

    if (Math.random() * 100 > adjustedAccuracy(move, user)) {
      log.push("但是没有命中。");
      events.push({ type: "message", text: "但是没有命中。" });
      return;
    }

    if (move.category === "status") {
      this.applyStatusMove(move, user, target, log, events);
      return;
    }

    const hpBefore = target.currentHp;
    const damage = calculateDamage(user, target, move);
    target.currentHp = Math.max(0, target.currentHp - damage);
    log.push(`${target.name} 受到了 ${damage} 点伤害。`);

    const effectiveness = typeEffectiveness(move.type, target.types);
    events.push({
      type: "damage",
      targetId: target.instanceId,
      targetName: target.name,
      damage,
      hpBefore,
      hpAfter: target.currentHp,
      effectiveness,
      fainted: isFainted(target)
    });

    if (effectiveness > 1) {
      log.push("效果绝佳！");
    } else if (effectiveness > 0 && effectiveness < 1) {
      log.push("效果不太好。");
    } else if (effectiveness === 0) {
      log.push("没有效果。");
    }

    if (isFainted(target)) {
      log.push(`${target.name} 倒下了。`);
    }
  }

  private applyStatusMove(move: Move, user: BattleMonster, target: BattleMonster, log: string[], events: BattleEvent[]): void {
    if (move.id === "growl") {
      target.statStages.atk = clampStage(target.statStages.atk - 1);
      log.push(`${target.name} 的攻击下降了。`);
      events.push({ type: "message", text: `${target.name} 的攻击下降了。` });
      return;
    }

    if (move.id === "smokescreen" || move.id === "sandAttack") {
      target.statStages.accuracy = clampStage(target.statStages.accuracy - 1);
      log.push(`${target.name} 的命中下降了。`);
      events.push({ type: "message", text: `${target.name} 的命中下降了。` });
      return;
    }

    if (move.id === "withdraw" || move.id === "harden") {
      user.statStages.def = clampStage(user.statStages.def + 1);
      log.push(`${user.name} 的防御提高了。`);
      events.push({ type: "message", text: `${user.name} 的防御提高了。` });
    }
  }

  private autoPromoteFaintedOpponent(log: string[], events: BattleEvent[]): void {
    if (!isFainted(this.opponentRoster[this.opponentActiveIndex])) {
      return;
    }

    const nextIndex = this.opponentRoster.findIndex((monster) => monster.currentHp > 0);
    if (nextIndex >= 0) {
      this.opponentActiveIndex = nextIndex;
      log.push(`对手派出了 ${this.opponentRoster[nextIndex].name}。`);
      events.push({ type: "message", text: `对手派出了 ${this.opponentRoster[nextIndex].name}。` });
    }
  }

  private autoPromoteFaintedPlayer(log: string[], events: BattleEvent[]): void {
    if (!isFainted(this.playerRoster[this.playerActiveIndex])) {
      return;
    }

    const nextIndex = this.playerRoster.findIndex((monster) => monster.currentHp > 0);
    if (nextIndex >= 0) {
      this.playerActiveIndex = nextIndex;
      log.push(`${this.playerRoster[nextIndex].name} 自动上场。`);
      events.push({ type: "message", text: `${this.playerRoster[nextIndex].name} 自动上场。` });
    }
  }

  private getOutcome(): "ongoing" | "player" | "opponent" {
    if (this.opponentRoster.every(isFainted)) {
      return "player";
    }

    if (this.playerRoster.every(isFainted)) {
      return "opponent";
    }

    return "ongoing";
  }
}

function isFainted(monster: BattleMonster): boolean {
  return monster.currentHp <= 0;
}

function effectiveSpeed(monster: BattleMonster): number {
  return monster.stats.spe * stageMultiplier(monster.statStages.spe);
}

function adjustedAccuracy(move: Move, user: BattleMonster): number {
  return move.accuracy * stageMultiplier(user.statStages.accuracy);
}

function calculateDamage(user: BattleMonster, target: BattleMonster, move: Move): number {
  const attack = move.category === "physical" ? user.stats.atk : user.stats.spa;
  const defense = move.category === "physical" ? target.stats.def : target.stats.spd;
  const stab = user.types.includes(move.type) ? 1.5 : 1;
  const effectiveness = typeEffectiveness(move.type, target.types);
  const base = (((2 * user.level) / 5 + 2) * move.power * (attack / Math.max(1, defense))) / 12 + 2;
  return Math.max(1, Math.floor(base * stab * effectiveness));
}

function stageMultiplier(stage: number): number {
  if (stage >= 0) {
    return (2 + stage) / 2;
  }

  return 2 / (2 + Math.abs(stage));
}

function clampStage(stage: number): number {
  return Math.max(-6, Math.min(6, stage));
}
