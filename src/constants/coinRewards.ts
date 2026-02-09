/**
 * 前端金币奖励配置（与后端 award-coins 默认值保持一致）。
 * 产品规则：1 个金币 = 1 个完成的任务
 */
export const COIN_REWARDS = {
  task_complete: 1,
  session_complete: 0,
  visual_verification: 0,
  photo_verification: 0,
  streak_bonus: 0,
  resistance_bonus: 0,
} as const;

export type CoinRewardSource = keyof typeof COIN_REWARDS;

/**
 * 获取某个金币来源的奖励值。
 *
 * @param {CoinRewardSource} source - 奖励来源
 * @returns {number} 对应的金币数量
 */
export function getCoinReward(source: CoinRewardSource): number {
  return COIN_REWARDS[source];
}

/**
 * 估算「任务完成」主流程应显示的金币数量（不包含 streak 等附加项）。
 *
 * @param {boolean} includeSessionBonus - 是否包含 session_complete 奖励
 * @returns {number} 估算金币
 */
export function estimateCompletionCoins(includeSessionBonus: boolean): number {
  const base = COIN_REWARDS.task_complete;
  return includeSessionBonus ? base + COIN_REWARDS.session_complete : base;
}
