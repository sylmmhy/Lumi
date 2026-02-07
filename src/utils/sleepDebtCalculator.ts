/**
 * 睡眠债务计算器
 * 追踪累计睡眠债务并提供恢复建议
 *
 * 原理：
 * - 睡眠债务 = 理想睡眠时长 - 实际睡眠时长的累计差值
 * - 使用滑动窗口（默认 14 天）计算
 * - 严重度分级帮助用户直观理解
 *
 * 依赖 sleepScoreCalculator 中的 parseSleepNights()
 */

import type { HealthDataRecord } from './bedtimeCalculator';
import { parseSleepNights, type SleepNightData } from './sleepScoreCalculator';

// ==================== 类型定义 ====================

/** 睡眠债务严重度 */
export type SleepDebtSeverity = 'none' | 'mild' | 'moderate' | 'severe';

/** 睡眠债务计算结果 */
export interface SleepDebtResult {
  /** 累计债务（分钟），正数=欠债，负数=盈余 */
  totalDebtMinutes: number;
  /** 严重度等级 */
  severity: SleepDebtSeverity;
  /** 日均债务（分钟） */
  dailyAverageDebtMinutes: number;
  /** 有效数据天数 */
  validNightCount: number;
  /** 回看天数 */
  lookbackDays: number;
  /** 理想睡眠时长（分钟） */
  idealSleepMinutes: number;
  /** 每晚详情（最新在前） */
  nightDetails: NightDebtDetail[];
  /** 恢复建议 */
  recoveryPlan: RecoveryPlan | null;
}

/** 单晚债务详情 */
export interface NightDebtDetail {
  /** 夜间日期 */
  date: string;
  /** 实际睡眠（分钟） */
  actualMinutes: number;
  /** 差值（分钟），正数=不足，负数=多睡 */
  debtMinutes: number;
}

/** 恢复计划 */
export interface RecoveryPlan {
  /** 建议每晚多睡的分钟数 */
  extraMinutesPerNight: number;
  /** 预计恢复天数 */
  estimatedDaysToRecover: number;
  /** 建议文本 key（用于 i18n） */
  suggestion: string;
}

// ==================== 常量 ====================

/** 默认理想睡眠时长（8 小时 = 480 分钟） */
const DEFAULT_IDEAL_SLEEP_MINUTES = 480;

/** 债务阈值（分钟） */
const SEVERITY_THRESHOLDS = {
  none: 30,       // <30min = 无债务
  mild: 120,      // 30-120min = 轻微
  moderate: 300,  // 120-300min = 中等
  // >300min = 严重
} as const;

/** 恢复建议：每晚额外睡眠时长范围 */
const RECOVERY_EXTRA_MIN = 30;
const RECOVERY_EXTRA_MAX = 60;

// ==================== 核心函数 ====================

/**
 * 计算睡眠债务
 *
 * @param healthData - 原始健康数据（或已解析的夜晚数据）
 * @param idealMinutes - 理想睡眠时长（分钟），默认 480（8h）
 * @param lookbackDays - 回看天数，默认 14
 * @returns 睡眠债务计算结果
 */
export function calculateSleepDebt(
  healthData: HealthDataRecord[],
  idealMinutes: number = DEFAULT_IDEAL_SLEEP_MINUTES,
  lookbackDays: number = 14
): SleepDebtResult {
  const nights = parseSleepNights(healthData);
  return calculateSleepDebtFromNights(nights, idealMinutes, lookbackDays);
}

/**
 * 从已解析的夜晚数据计算睡眠债务
 * （避免重复解析，提高性能）
 */
export function calculateSleepDebtFromNights(
  nights: SleepNightData[],
  idealMinutes: number = DEFAULT_IDEAL_SLEEP_MINUTES,
  lookbackDays: number = 14
): SleepDebtResult {
  // 筛选回看窗口内的数据
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const recentNights = nights.filter(n => n.sleepStart >= cutoff);

  // 计算每晚债务
  const nightDetails: NightDebtDetail[] = recentNights.map(night => {
    const debtMinutes = idealMinutes - night.totalSleepMinutes;
    return {
      date: night.nightDate,
      actualMinutes: night.totalSleepMinutes,
      debtMinutes: Math.round(debtMinutes),
    };
  });

  // 累计债务
  const totalDebtMinutes = nightDetails.reduce((sum, n) => sum + n.debtMinutes, 0);

  // 日均债务
  const validNightCount = nightDetails.length;
  const dailyAverageDebtMinutes = validNightCount > 0
    ? Math.round(totalDebtMinutes / validNightCount)
    : 0;

  // 判断严重度（基于累计债务的绝对值）
  const absDebt = Math.abs(totalDebtMinutes);
  let severity: SleepDebtSeverity;

  if (totalDebtMinutes <= 0) {
    // 盈余或刚好
    severity = 'none';
  } else if (absDebt < SEVERITY_THRESHOLDS.none) {
    severity = 'none';
  } else if (absDebt < SEVERITY_THRESHOLDS.mild) {
    severity = 'mild';
  } else if (absDebt < SEVERITY_THRESHOLDS.moderate) {
    severity = 'moderate';
  } else {
    severity = 'severe';
  }

  // 恢复计划
  const recoveryPlan = totalDebtMinutes > SEVERITY_THRESHOLDS.none
    ? generateRecoveryPlan(totalDebtMinutes, severity)
    : null;

  return {
    totalDebtMinutes: Math.round(totalDebtMinutes),
    severity,
    dailyAverageDebtMinutes,
    validNightCount,
    lookbackDays,
    idealSleepMinutes: idealMinutes,
    nightDetails,
    recoveryPlan,
  };
}

// ==================== 内部辅助函数 ====================

/** 恢复天数上限 */
const MAX_RECOVERY_DAYS = 30;

/**
 * 生成恢复计划
 *
 * @param totalDebtMinutes - 累计债务分钟数
 * @param severity - 债务严重度
 * @returns 恢复计划（包含每晚额外睡眠时长、预计天数和建议文本）
 */
function generateRecoveryPlan(totalDebtMinutes: number, severity: SleepDebtSeverity): RecoveryPlan {
  // 根据严重度决定每晚额外睡眠时长
  let extraMinutes: number;
  switch (severity) {
    case 'mild':
      extraMinutes = RECOVERY_EXTRA_MIN; // 30min/night
      break;
    case 'moderate':
      extraMinutes = 45; // 45min/night
      break;
    case 'severe':
      extraMinutes = RECOVERY_EXTRA_MAX; // 60min/night
      break;
    default:
      extraMinutes = RECOVERY_EXTRA_MIN;
  }

  const rawEstimatedDays = Math.ceil(totalDebtMinutes / extraMinutes);

  // 限制恢复天数上限为 30 天，避免不切实际的恢复周期
  const estimatedDays = Math.min(rawEstimatedDays, MAX_RECOVERY_DAYS);

  // 如果实际天数超过上限，提示用户需要循序渐进
  const suggestion = rawEstimatedDays > MAX_RECOVERY_DAYS
    ? `profile.sleepDebt.recoveryTipLongTerm`
    : `profile.sleepDebt.recoveryTip`;

  return {
    extraMinutesPerNight: extraMinutes,
    estimatedDaysToRecover: estimatedDays,
    suggestion,
  };
}

/**
 * 从 localStorage 获取用户设置的理想睡眠时长
 * @returns 理想睡眠时长（分钟），默认 480
 */
export function getIdealSleepMinutes(): number {
  try {
    const stored = localStorage.getItem('lumi_ideal_sleep_minutes');
    if (stored) {
      const value = parseInt(stored, 10);
      // 合理范围：5h - 12h
      if (value >= 300 && value <= 720) {
        return value;
      }
    }
  } catch {
    // localStorage 不可用时使用默认值
  }
  return DEFAULT_IDEAL_SLEEP_MINUTES;
}

/**
 * 保存用户设置的理想睡眠时长
 * @param minutes - 理想睡眠时长（分钟）
 */
export function setIdealSleepMinutes(minutes: number): void {
  try {
    // 限制范围
    const clamped = Math.max(300, Math.min(720, Math.round(minutes)));
    localStorage.setItem('lumi_ideal_sleep_minutes', clamped.toString());
  } catch {
    // localStorage 不可用时忽略
  }
}
