/**
 * 睡眠质量评分计算器
 * 基于科学研究的 7 维度加权评分系统
 *
 * 参考文献：
 * - PRD: 基于科学研究的个性化睡眠建议框架
 * - https://academic.oup.com/sleep/article/47/4/zsad325/7501518
 *
 * 评分维度及权重：
 * | 维度 | 权重 | 理想范围 |
 * |------|------|---------|
 * | 总睡眠时长 | 25% | 7-9h |
 * | 睡眠效率 | 20% | >85% |
 * | 深度睡眠占比 | 15% | 15-20% |
 * | REM 睡眠占比 | 15% | 20-25% |
 * | 入睡潜伏期 | 10% | <20min |
 * | 觉醒次数 | 10% | <3次 |
 * | HRV 恢复度 | 5% | 上升=好 |
 */

import type { HealthDataRecord } from './bedtimeCalculator';

// ==================== 类型定义 ====================

/**
 * 单个夜晚的睡眠数据（按 18:00-18:00 夜间边界分组）
 */
export interface SleepNightData {
  /** 夜间日期标识（以入睡日期为准，如 "2026-02-05"） */
  nightDate: string;
  /** 入睡时间 */
  sleepStart: Date;
  /** 起床时间 */
  sleepEnd: Date;
  /** 上床时间（inBed 阶段开始） */
  inBedStart: Date | null;
  /** 总睡眠时长（分钟），不含 awake/inBed */
  totalSleepMinutes: number;
  /** 总在床时长（分钟），从 inBed 到最后起床 */
  totalInBedMinutes: number;
  /** 深度睡眠时长（分钟） */
  deepSleepMinutes: number;
  /** REM 睡眠时长（分钟） */
  remSleepMinutes: number;
  /** 核心/浅睡眠时长（分钟） */
  coreSleepMinutes: number;
  /** 觉醒次数 */
  awakenings: number;
  /** 入睡潜伏期（分钟）：从 inBed 到首个 sleep stage 的间隔 */
  latencyMinutes: number;
  /** 当晚的 HRV 数据（SDNN） */
  hrvValues: number[];
  /** 设备是否支持详细睡眠阶段分类（即是否存在 core/deep/rem 记录） */
  hasDetailedStages: boolean;
  /** 原始睡眠阶段记录 */
  stages: HealthDataRecord[];
}

/**
 * 睡眠评分结果
 */
export interface SleepScoreResult {
  /** 综合评分 (0-100) */
  totalScore: number;
  /** 评级 */
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  /** 各维度得分明细 */
  dimensions: {
    totalSleep: DimensionScore;
    efficiency: DimensionScore;
    deepSleep: DimensionScore;
    remSleep: DimensionScore;
    latency: DimensionScore;
    awakenings: DimensionScore;
    hrvRecovery: DimensionScore;
  };
  /** 用于计算的夜晚数据 */
  nightData: SleepNightData;
}

/**
 * 单个维度的评分
 */
export interface DimensionScore {
  /** 维度得分 (0-100) */
  score: number;
  /** 加权后得分 */
  weightedScore: number;
  /** 权重 */
  weight: number;
  /** 实际值 */
  actualValue: number;
  /** 理想范围描述 */
  idealRange: string;
  /** 状态 */
  status: 'optimal' | 'good' | 'fair' | 'poor';
}

// ==================== 常量 ====================

/** 评分维度权重 */
const WEIGHTS = {
  totalSleep: 0.25,
  efficiency: 0.20,
  deepSleep: 0.15,
  remSleep: 0.15,
  latency: 0.10,
  awakenings: 0.10,
  hrvRecovery: 0.05,
} as const;

/** 夜间边界时间（18:00），用于将跨午夜的睡眠归为同一夜 */
const NIGHT_BOUNDARY_HOUR = 18;

/** HealthKit 睡眠阶段标识 */
const SLEEP_STAGES = {
  IN_BED: 'inBed',
  ASLEEP: 'asleep',
  CORE: 'core',
  DEEP: 'deep',
  REM: 'rem',
  AWAKE: 'awake',
} as const;

// ==================== 核心函数 ====================

/**
 * 将 HealthKit 原始记录按夜间边界（18:00-18:00）分组为独立的夜晚
 *
 * 为什么用 18:00 作为边界？
 * 因为大多数人在 18:00 之后入睡、次日 18:00 之前起床。
 * 这样即使跨午夜的睡眠（如 23:00 → 07:00）也能归为同一夜。
 *
 * @param healthData - 原始健康数据记录
 * @returns 按夜分组的睡眠数据数组（最新的在前）
 */
export function parseSleepNights(healthData: HealthDataRecord[]): SleepNightData[] {
  // 筛选睡眠分析数据
  const sleepRecords = healthData.filter(
    d => d.data_type === 'HKCategoryTypeIdentifierSleepAnalysis' || d.data_type === 'sleep'
  );

  // 筛选 HRV 数据
  const hrvRecords = healthData.filter(
    d => d.data_type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' || d.data_type === 'hrv'
  );

  if (sleepRecords.length === 0) return [];

  // 按夜间边界分组：18:00 之前的记录归为前一天的夜晚
  const nightsMap = new Map<string, HealthDataRecord[]>();

  for (const record of sleepRecords) {
    const startDate = new Date(record.start_date);
    const nightKey = getNightKey(startDate);

    if (!nightsMap.has(nightKey)) {
      nightsMap.set(nightKey, []);
    }
    nightsMap.get(nightKey)!.push(record);
  }

  // 将 HRV 数据也按夜间边界分组
  const hrvByNight = new Map<string, number[]>();
  for (const record of hrvRecords) {
    const startDate = new Date(record.start_date);
    const hour = startDate.getHours();
    // 只取夜间 HRV（22:00 - 06:00），更能反映睡眠中的恢复状态
    if (hour >= 22 || hour < 6) {
      const nightKey = getNightKey(startDate);
      if (!hrvByNight.has(nightKey)) {
        hrvByNight.set(nightKey, []);
      }
      if (record.value !== null) {
        hrvByNight.get(nightKey)!.push(record.value);
      }
    }
  }

  // 转换为 SleepNightData（每个夜晚去重多来源）
  const nights: SleepNightData[] = [];

  for (const [nightKey, records] of nightsMap) {
    // 去重：当多个来源（Apple Watch + iPhone）上传了重叠记录时，
    // 选择最详细的来源（有 core/deep/rem 细分的来源优先）
    const deduped = deduplicateSources(records);
    const nightData = buildNightData(nightKey, deduped, hrvByNight.get(nightKey) || []);
    if (nightData) {
      nights.push(nightData);
    }
  }

  // 按日期倒序排列（最新的在前）
  nights.sort((a, b) => b.sleepStart.getTime() - a.sleepStart.getTime());

  return nights;
}

/**
 * 计算单个夜晚的睡眠评分
 *
 * @param nightData - 单个夜晚的睡眠数据
 * @param daytimeHrvAvg - 可选的日间 HRV 平均值（用于 HRV 恢复度计算）
 * @returns 睡眠评分结果
 */
export function calculateSleepScore(
  nightData: SleepNightData,
  daytimeHrvAvg?: number
): SleepScoreResult {
  const dimensions = {
    totalSleep: scoreTotalSleep(nightData.totalSleepMinutes),
    efficiency: scoreEfficiency(nightData.totalSleepMinutes, nightData.totalInBedMinutes),
    deepSleep: scoreDeepSleep(nightData.deepSleepMinutes, nightData.totalSleepMinutes, nightData.hasDetailedStages),
    remSleep: scoreRemSleep(nightData.remSleepMinutes, nightData.totalSleepMinutes, nightData.hasDetailedStages),
    latency: scoreLatency(nightData.latencyMinutes),
    awakenings: scoreAwakenings(nightData.awakenings),
    hrvRecovery: scoreHrvRecovery(nightData.hrvValues, daytimeHrvAvg),
  };

  // 计算加权总分
  const totalScore = Math.round(
    dimensions.totalSleep.weightedScore +
    dimensions.efficiency.weightedScore +
    dimensions.deepSleep.weightedScore +
    dimensions.remSleep.weightedScore +
    dimensions.latency.weightedScore +
    dimensions.awakenings.weightedScore +
    dimensions.hrvRecovery.weightedScore
  );

  // 评级
  const grade = totalScore >= 85 ? 'excellent'
    : totalScore >= 70 ? 'good'
    : totalScore >= 50 ? 'fair'
    : 'poor';

  return { totalScore, grade, dimensions, nightData };
}

/**
 * 计算最近 N 天的周均睡眠评分
 *
 * @param healthData - 原始健康数据
 * @param days - 回看天数（默认 7）
 * @returns 周均评分结果，如果数据不足返回 null
 */
export function calculateWeeklyAverageScore(
  healthData: HealthDataRecord[],
  days: number = 7
): { averageScore: number; grade: 'excellent' | 'good' | 'fair' | 'poor'; nightCount: number; scores: SleepScoreResult[] } | null {
  const nights = parseSleepNights(healthData);

  // 筛选最近 N 天
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const recentNights = nights.filter(n => n.sleepStart >= cutoff);

  if (recentNights.length === 0) return null;

  // 计算日间 HRV 平均值（用于所有夜晚的 HRV 恢复度计算）
  const daytimeHrvAvg = calculateDaytimeHrvAvg(healthData);

  // 计算每晚评分
  const scores = recentNights.map(night => calculateSleepScore(night, daytimeHrvAvg));

  // 计算平均分
  const averageScore = Math.round(
    scores.reduce((sum, s) => sum + s.totalScore, 0) / scores.length
  );

  const grade = averageScore >= 85 ? 'excellent'
    : averageScore >= 70 ? 'good'
    : averageScore >= 50 ? 'fair'
    : 'poor';

  return { averageScore, grade, nightCount: scores.length, scores };
}

// ==================== 内部辅助函数 ====================

/**
 * 去重多来源的睡眠记录
 *
 * 当 Apple Watch 和 iPhone 都上传了同一晚的睡眠数据时，
 * 它们的记录会重叠。我们需要选择最详细的来源，避免双重计算。
 *
 * 策略：
 * 1. 对于实际睡眠阶段（core/deep/rem/asleep），选择最详细的来源
 * 2. 保留所有来源的 inBed 记录（用于计算入睡潜伏期）
 */
function deduplicateSources(records: HealthDataRecord[]): HealthDataRecord[] {
  // 按来源分组
  const bySource = new Map<string, HealthDataRecord[]>();
  for (const r of records) {
    const source = r.source_bundle_id || 'unknown';
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(r);
  }

  // 只有一个来源时无需去重
  if (bySource.size <= 1) return records;

  // 评估每个来源的"详细程度"
  const DETAILED_STAGES = new Set([SLEEP_STAGES.CORE, SLEEP_STAGES.DEEP, SLEEP_STAGES.REM]);
  let bestSource = '';
  let bestDetailCount = -1;
  let bestTotalCount = 0;

  for (const [source, sourceRecords] of bySource) {
    const detailCount = sourceRecords.filter(r => r.sleep_stage && DETAILED_STAGES.has(r.sleep_stage)).length;
    const totalCount = sourceRecords.length;

    // 优先选择有详细阶段分类的来源；平局时选择记录数更多的
    if (detailCount > bestDetailCount || (detailCount === bestDetailCount && totalCount > bestTotalCount)) {
      bestSource = source;
      bestDetailCount = detailCount;
      bestTotalCount = totalCount;
    }
  }

  // 使用最佳来源的所有记录 + 其他来源的 inBed 记录
  const result: HealthDataRecord[] = [];
  for (const [source, sourceRecords] of bySource) {
    if (source === bestSource) {
      result.push(...sourceRecords);
    } else {
      // 其他来源只保留 inBed（有助于计算入睡潜伏期）
      result.push(...sourceRecords.filter(r => r.sleep_stage === 'inBed'));
    }
  }

  return result;
}

/**
 * 获取夜间日期键：18:00 之前的时间归为前一天
 */
function getNightKey(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < NIGHT_BOUNDARY_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

/**
 * 从记录数组构建单个夜晚数据
 */
function buildNightData(
  nightKey: string,
  records: HealthDataRecord[],
  hrvValues: number[]
): SleepNightData | null {
  // 按开始时间排序
  const sorted = [...records].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // 找到各阶段数据
  let inBedStart: Date | null = null;
  let firstSleepStart: Date | null = null;
  let lastSleepEnd: Date | null = null;
  let deepMinutes = 0;
  let remMinutes = 0;
  let coreMinutes = 0;
  let awakeCount = 0;
  let totalSleepMinutes = 0;

  for (const record of sorted) {
    const stage = record.sleep_stage;
    const start = new Date(record.start_date);
    const end = new Date(record.end_date);
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;

    if (!stage) continue;

    // inBed 阶段
    if (stage === SLEEP_STAGES.IN_BED) {
      if (!inBedStart || start < inBedStart) {
        inBedStart = start;
      }
    }

    // 实际睡眠阶段（core/deep/rem/asleep）
    if ([SLEEP_STAGES.CORE, SLEEP_STAGES.DEEP, SLEEP_STAGES.REM, SLEEP_STAGES.ASLEEP].includes(stage)) {
      if (!firstSleepStart || start < firstSleepStart) {
        firstSleepStart = start;
      }
      if (!lastSleepEnd || end > lastSleepEnd) {
        lastSleepEnd = end;
      }

      totalSleepMinutes += durationMinutes;

      switch (stage) {
        case SLEEP_STAGES.DEEP:
          deepMinutes += durationMinutes;
          break;
        case SLEEP_STAGES.REM:
          remMinutes += durationMinutes;
          break;
        case SLEEP_STAGES.CORE:
        case SLEEP_STAGES.ASLEEP:
          coreMinutes += durationMinutes;
          break;
      }
    }

    // 觉醒
    if (stage === SLEEP_STAGES.AWAKE) {
      awakeCount++;
    }
  }

  // 数据校验：至少需要有睡眠开始和结束时间
  if (!firstSleepStart || !lastSleepEnd) return null;

  // 如果没有 inBed 记录，使用第一个睡眠记录作为替代
  const effectiveInBedStart = inBedStart || firstSleepStart;

  // 计算在床总时长
  const totalInBedMinutes = (lastSleepEnd.getTime() - effectiveInBedStart.getTime()) / 60000;

  // 入睡潜伏期
  const latencyMinutes = Math.max(0,
    (firstSleepStart.getTime() - effectiveInBedStart.getTime()) / 60000
  );

  // 检查设备是否支持详细阶段分类（是否存在 core/deep/rem 记录）
  const hasDetailedStages = sorted.some(
    r => r.sleep_stage === SLEEP_STAGES.CORE
      || r.sleep_stage === SLEEP_STAGES.DEEP
      || r.sleep_stage === SLEEP_STAGES.REM
  );

  return {
    nightDate: nightKey,
    sleepStart: firstSleepStart,
    sleepEnd: lastSleepEnd,
    inBedStart: inBedStart,
    totalSleepMinutes: Math.round(totalSleepMinutes),
    totalInBedMinutes: Math.round(totalInBedMinutes),
    deepSleepMinutes: Math.round(deepMinutes),
    remSleepMinutes: Math.round(remMinutes),
    coreSleepMinutes: Math.round(coreMinutes),
    awakenings: awakeCount,
    latencyMinutes: Math.round(latencyMinutes),
    hrvValues,
    hasDetailedStages,
    stages: sorted,
  };
}

/**
 * 计算日间 HRV 平均值（06:00 - 22:00）
 */
function calculateDaytimeHrvAvg(healthData: HealthDataRecord[]): number | undefined {
  const hrvRecords = healthData.filter(
    d => (d.data_type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' || d.data_type === 'hrv')
      && d.value !== null
  );

  const daytimeValues = hrvRecords.filter(r => {
    const hour = new Date(r.start_date).getHours();
    return hour >= 6 && hour < 22;
  }).map(r => r.value!);

  if (daytimeValues.length < 3) return undefined;

  return daytimeValues.reduce((a, b) => a + b, 0) / daytimeValues.length;
}

// ==================== 评分维度函数 ====================

/**
 * 总睡眠时长评分（权重 25%）
 * 理想范围：7-9 小时（420-540 分钟）
 */
function scoreTotalSleep(minutes: number): DimensionScore {
  const weight = WEIGHTS.totalSleep;
  let score: number;

  if (minutes >= 420 && minutes <= 540) {
    // 理想范围：满分
    score = 100;
  } else if (minutes >= 360 && minutes < 420) {
    // 6-7h：线性递减
    score = 70 + (minutes - 360) / 60 * 30;
  } else if (minutes > 540 && minutes <= 600) {
    // 9-10h：轻微扣分
    score = 100 - (minutes - 540) / 60 * 20;
  } else if (minutes >= 300 && minutes < 360) {
    // 5-6h：较低
    score = 40 + (minutes - 300) / 60 * 30;
  } else if (minutes < 300) {
    // <5h：严重不足
    score = Math.max(0, minutes / 300 * 40);
  } else {
    // >10h：过度睡眠
    score = Math.max(30, 80 - (minutes - 600) / 60 * 25);
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(minutes),
    idealRange: '7-9h (420-540min)',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * 睡眠效率评分（权重 20%）
 * 理想范围：>85%
 * 效率 = 实际睡眠时长 / 在床总时长
 *
 * 注意：如果没有 inBed 记录，效率会被人为虚高（接近100%），
 * 因此在没有 inBed 数据时，效率分上限设为 80。
 */
function scoreEfficiency(sleepMinutes: number, inBedMinutes: number): DimensionScore {
  const weight = WEIGHTS.efficiency;

  if (inBedMinutes <= 0) {
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: '>85%', status: 'fair',
    };
  }

  const efficiency = (sleepMinutes / inBedMinutes) * 100;

  // 如果睡眠时长和在床时长几乎相等（差距<5%），说明没有 inBed 记录，
  // 此时效率数据不可靠，上限设为 80 分
  const noInBedData = (inBedMinutes - sleepMinutes) < inBedMinutes * 0.05;

  let score: number;

  if (efficiency >= 90) {
    score = 100;
  } else if (efficiency >= 85) {
    score = 85 + (efficiency - 85) / 5 * 15;
  } else if (efficiency >= 75) {
    score = 60 + (efficiency - 75) / 10 * 25;
  } else if (efficiency >= 65) {
    score = 30 + (efficiency - 65) / 10 * 30;
  } else {
    score = Math.max(0, efficiency / 65 * 30);
  }

  // 无 inBed 数据时限制上限
  if (noInBedData) {
    score = Math.min(score, 80);
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(efficiency),
    idealRange: '>85%',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * 深度睡眠占比评分（权重 15%）
 * 理想范围：15-20%（总睡眠时长）
 *
 * @param deepMinutes - 深度睡眠时长（分钟）
 * @param totalSleepMinutes - 总睡眠时长（分钟）
 * @param hasDetailedStages - 设备是否支持详细阶段分类
 */
function scoreDeepSleep(deepMinutes: number, totalSleepMinutes: number, hasDetailedStages: boolean): DimensionScore {
  const weight = WEIGHTS.deepSleep;

  // 无有效睡眠数据
  if (totalSleepMinutes <= 0) {
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: '15-20%', status: 'fair',
    };
  }

  // 深度睡眠为 0 但有足够的睡眠时长：区分设备能力
  if (deepMinutes === 0 && totalSleepMinutes > 60) {
    if (hasDetailedStages) {
      // 设备支持阶段分类但深度睡眠确实为 0 → 真的缺乏深睡，给低分
      return {
        score: 20, weightedScore: 20 * weight, weight,
        actualValue: 0, idealRange: '15-20%', status: 'poor',
      };
    }
    // 设备不支持阶段分类（只有 asleep/inBed）→ 数据缺失，给中性分数
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: '15-20%', status: 'fair',
    };
  }

  const ratio = (deepMinutes / totalSleepMinutes) * 100;
  let score: number;

  if (ratio >= 15 && ratio <= 20) {
    score = 100;
  } else if (ratio > 20 && ratio <= 25) {
    // 略高于理想范围，轻微扣分
    score = 90 + (25 - ratio) / 5 * 10;
  } else if (ratio >= 10 && ratio < 15) {
    score = 65 + (ratio - 10) / 5 * 35;
  } else if (ratio > 25 && ratio <= 30) {
    score = 75;
  } else if (ratio >= 5 && ratio < 10) {
    score = 30 + (ratio - 5) / 5 * 35;
  } else if (ratio < 5) {
    score = Math.max(10, ratio / 5 * 30);
  } else {
    score = 60; // >30%
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(ratio),
    idealRange: '15-20%',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * REM 睡眠占比评分（权重 15%）
 * 理想范围：20-25%（总睡眠时长）
 *
 * @param remMinutes - REM 睡眠时长（分钟）
 * @param totalSleepMinutes - 总睡眠时长（分钟）
 * @param hasDetailedStages - 设备是否支持详细阶段分类
 */
function scoreRemSleep(remMinutes: number, totalSleepMinutes: number, hasDetailedStages: boolean): DimensionScore {
  const weight = WEIGHTS.remSleep;

  // 无有效睡眠数据
  if (totalSleepMinutes <= 0) {
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: '20-25%', status: 'fair',
    };
  }

  // REM 睡眠为 0 但有足够的睡眠时长：区分设备能力
  if (remMinutes === 0 && totalSleepMinutes > 60) {
    if (hasDetailedStages) {
      // 设备支持阶段分类但 REM 确实为 0 → 真的缺乏 REM，给低分
      return {
        score: 20, weightedScore: 20 * weight, weight,
        actualValue: 0, idealRange: '20-25%', status: 'poor',
      };
    }
    // 设备不支持阶段分类（只有 asleep/inBed）→ 数据缺失，给中性分数
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: '20-25%', status: 'fair',
    };
  }

  const ratio = (remMinutes / totalSleepMinutes) * 100;
  let score: number;

  if (ratio >= 20 && ratio <= 25) {
    score = 100;
  } else if (ratio > 25 && ratio <= 30) {
    // 略高于理想范围，轻微扣分
    score = 85 + (30 - ratio) / 5 * 15;
  } else if (ratio >= 15 && ratio < 20) {
    score = 65 + (ratio - 15) / 5 * 35;
  } else if (ratio > 30 && ratio <= 35) {
    score = 70;
  } else if (ratio >= 10 && ratio < 15) {
    score = 30 + (ratio - 10) / 5 * 35;
  } else if (ratio < 10) {
    score = Math.max(10, ratio / 10 * 30);
  } else {
    score = 55; // >35%
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(ratio),
    idealRange: '20-25%',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * 入睡潜伏期评分（权重 10%）
 * 理想范围：<20 分钟
 */
function scoreLatency(latencyMinutes: number): DimensionScore {
  const weight = WEIGHTS.latency;
  let score: number;

  if (latencyMinutes <= 15) {
    score = 100;
  } else if (latencyMinutes <= 20) {
    score = 85 + (20 - latencyMinutes) / 5 * 15;
  } else if (latencyMinutes <= 30) {
    score = 60 + (30 - latencyMinutes) / 10 * 25;
  } else if (latencyMinutes <= 45) {
    score = 30 + (45 - latencyMinutes) / 15 * 30;
  } else {
    score = Math.max(0, 30 - (latencyMinutes - 45) / 15 * 15);
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(latencyMinutes),
    idealRange: '<20min',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * 觉醒次数评分（权重 10%）
 * 理想范围：<3 次
 */
function scoreAwakenings(count: number): DimensionScore {
  const weight = WEIGHTS.awakenings;
  let score: number;

  if (count <= 1) {
    score = 100;
  } else if (count <= 2) {
    score = 90;
  } else if (count <= 3) {
    score = 75;
  } else if (count <= 5) {
    score = 50 + (5 - count) / 2 * 25;
  } else {
    score = Math.max(10, 50 - (count - 5) * 8);
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: count,
    idealRange: '<3 times',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * HRV 恢复度评分（权重 5%）
 * 夜间 HRV 相比日间上升 = 好
 * 如果没有 HRV 数据则给中等分
 */
function scoreHrvRecovery(nightHrvValues: number[], daytimeHrvAvg?: number): DimensionScore {
  const weight = WEIGHTS.hrvRecovery;

  // 无数据时给较低中等分（不惩罚无数据用户，但也不白送分数）
  if (nightHrvValues.length === 0 || !daytimeHrvAvg || daytimeHrvAvg <= 0) {
    return {
      score: 50, weightedScore: 50 * weight, weight,
      actualValue: 0, idealRange: 'Rising vs daytime', status: 'fair',
    };
  }

  const nightAvg = nightHrvValues.reduce((a, b) => a + b, 0) / nightHrvValues.length;
  const ratio = nightAvg / daytimeHrvAvg;
  let score: number;

  if (ratio >= 1.15) {
    score = 100; // 明显上升
  } else if (ratio >= 1.05) {
    score = 85; // 轻微上升
  } else if (ratio >= 0.95) {
    score = 70; // 持平
  } else if (ratio >= 0.85) {
    score = 50; // 轻微下降
  } else {
    score = Math.max(20, 50 - (0.85 - ratio) * 200);
  }

  score = clampAndRound(score);

  return {
    score,
    weightedScore: score * weight,
    weight,
    actualValue: Math.round(nightAvg),
    idealRange: 'Rising vs daytime',
    status: score >= 85 ? 'optimal' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor',
  };
}

/**
 * 将分数限制在 0-100 范围并四舍五入为整数
 */
function clampAndRound(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ==================== 恢复状态分析 ====================

/** HRV 趋势方向 */
export type HrvTrend = 'rising' | 'stable' | 'falling';

/** 恢复状态 */
export type RecoveryStatus = 'well_recovered' | 'normal' | 'needs_recovery';

/** 恢复状态分析结果 */
export interface RecoveryAnalysis {
  /** 恢复状态 */
  status: RecoveryStatus;
  /** HRV 趋势 */
  trend: HrvTrend;
  /** 3 天滑动平均 SDNN */
  shortTermAvg: number;
  /** 14 天基线 SDNN */
  baselineAvg: number;
  /** 趋势比值（shortTerm / baseline） */
  trendRatio: number;
  /** 有效数据天数 */
  dataPoints: number;
}

/**
 * 计算恢复状态（基于 SDNN 趋势分析）
 *
 * Apple HealthKit 限制：
 * - RMSSD 不直接提供
 * - LF/HF 比值完全不可用
 * - 可用数据：SDNN (heartRateVariabilitySDNN)
 *
 * 方法：3 天滑动平均 vs 14 天基线
 * - >110% = rising（恢复良好）
 * - 90-110% = stable（正常）
 * - <90% = falling（需要恢复）
 *
 * @param healthData - 原始健康数据
 * @returns 恢复状态分析结果，数据不足返回 null
 */
export function calculateRecoveryStatus(healthData: HealthDataRecord[]): RecoveryAnalysis | null {
  // 筛选 HRV SDNN 数据
  const hrvRecords = healthData
    .filter(d =>
      (d.data_type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' || d.data_type === 'hrv')
      && d.value !== null
    )
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  if (hrvRecords.length < 5) return null;

  // 按天分组，取每天平均
  const dailyAvgMap = new Map<string, number[]>();
  for (const record of hrvRecords) {
    const dateKey = new Date(record.start_date).toISOString().split('T')[0];
    if (!dailyAvgMap.has(dateKey)) {
      dailyAvgMap.set(dateKey, []);
    }
    dailyAvgMap.get(dateKey)!.push(record.value!);
  }

  // 转为按日期排序的日均数组
  const dailyAvgs = Array.from(dailyAvgMap.entries())
    .map(([date, values]) => ({
      date,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date)); // 最新在前

  if (dailyAvgs.length < 3) return null;

  // 3 天滑动平均
  const shortTermValues = dailyAvgs.slice(0, 3).map(d => d.avg);
  const shortTermAvg = shortTermValues.reduce((a, b) => a + b, 0) / shortTermValues.length;

  // 14 天基线（最多取 14 天）
  const baselineValues = dailyAvgs.slice(0, 14).map(d => d.avg);
  const baselineAvg = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;

  if (baselineAvg <= 0) return null;

  // 趋势比值
  const trendRatio = shortTermAvg / baselineAvg;

  // 判断趋势
  let trend: HrvTrend;
  if (trendRatio > 1.10) {
    trend = 'rising';
  } else if (trendRatio < 0.90) {
    trend = 'falling';
  } else {
    trend = 'stable';
  }

  // 映射恢复状态
  let status: RecoveryStatus;
  switch (trend) {
    case 'rising':
      status = 'well_recovered';
      break;
    case 'stable':
      status = 'normal';
      break;
    case 'falling':
      status = 'needs_recovery';
      break;
  }

  return {
    status,
    trend,
    shortTermAvg: Math.round(shortTermAvg * 10) / 10,
    baselineAvg: Math.round(baselineAvg * 10) / 10,
    trendRatio: Math.round(trendRatio * 100) / 100,
    dataPoints: dailyAvgs.length,
  };
}
