/**
 * 最佳入睡时间计算器
 * 基于科学研究的个性化睡眠建议框架
 *
 * 参考文献：
 * - https://academic.oup.com/sleep/article/47/4/zsad325/7501518
 * - https://ouraring.com/blog/ideal-bedtime/
 * - https://pubmed.ncbi.nlm.nih.gov/38411360/
 */

/**
 * 健康数据记录类型
 */
export interface HealthDataRecord {
  id: string;
  user_id: string;
  data_type: string;
  value: number | null;
  unit: string | null;
  sleep_stage: string | null;
  start_date: string;
  end_date: string;
  source_name: string | null;
  source_bundle_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 最佳入睡时间计算结果
 */
export interface BedtimeRecommendation {
  /** 建议入睡时间（HH:mm 格式） */
  recommendedBedtime: string;
  /** 建议入睡时间的 Date 对象（今天或明天） */
  recommendedBedtimeDate: Date;
  /** 置信度 (0-100)，数据越充足越高 */
  confidence: number;
  /** 计算因素详情 */
  factors: {
    /** 心率最低点分析 */
    heartRateNadir?: {
      /** 平均最低点时间 */
      averageNadirTime: string;
      /** 基于此推算的建议入睡时间 */
      suggestedBedtime: string;
      /** 数据天数 */
      dataPoints: number;
    };
    /** 睡眠规律性分析 */
    sleepRegularity?: {
      /** 平均入睡时间 */
      averageBedtime: string;
      /** 标准差（分钟） */
      standardDeviationMinutes: number;
      /** 规律性评级 */
      rating: 'excellent' | 'good' | 'fair' | 'poor';
      /** 数据天数 */
      dataPoints: number;
    };
    /** HRV 状态分析 */
    hrvStatus?: {
      /** 当前 HRV */
      currentHrv: number;
      /** 平均 HRV */
      averageHrv: number;
      /** HRV 状态 */
      status: 'high' | 'normal' | 'low';
      /** 建议调整（分钟） */
      adjustment: number;
    };
  };
  /** 个性化建议文本 */
  suggestion: string;
  /** 数据不足时的原因 */
  insufficientDataReason?: string;
}

/**
 * 将分钟数转换为 HH:mm 格式
 */
function minutesToTimeString(minutes: number): string {
  // 处理负数或超过一天的情况
  minutes = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 将 HH:mm 格式转换为分钟数（从午夜算起）
 */
function timeStringToMinutes(timeStr: string): number {
  const [hours, mins] = timeStr.split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * 将 Date 对象转换为当天的分钟数
 */
function dateToMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * 计算时间的循环平均值（处理跨午夜的情况）
 * 使用向量平均法
 */
function calculateCircularMean(minutesArray: number[]): number {
  if (minutesArray.length === 0) return 0;

  let sinSum = 0;
  let cosSum = 0;
  const minutesInDay = 1440;

  for (const minutes of minutesArray) {
    const angle = (minutes / minutesInDay) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const avgAngle = Math.atan2(sinSum / minutesArray.length, cosSum / minutesArray.length);
  let avgMinutes = (avgAngle / (2 * Math.PI)) * minutesInDay;
  if (avgMinutes < 0) avgMinutes += minutesInDay;

  return avgMinutes;
}

/**
 * 计算循环标准差（分钟）
 */
function calculateCircularStd(minutesArray: number[], mean: number): number {
  if (minutesArray.length <= 1) return 0;

  const minutesInDay = 1440;
  let sumSquaredDiff = 0;

  for (const minutes of minutesArray) {
    // 计算最短循环距离
    let diff = minutes - mean;
    if (diff > minutesInDay / 2) diff -= minutesInDay;
    if (diff < -minutesInDay / 2) diff += minutesInDay;
    sumSquaredDiff += diff * diff;
  }

  return Math.sqrt(sumSquaredDiff / minutesArray.length);
}

/**
 * 分析心率数据，找到最低点时间
 *
 * 原理：追踪过去7天心率曲线，找到最低点出现时间
 * 理想状态：入睡后2-3小时达到最低点
 * 例如：如果最低点在凌晨4点，建议12-1点入睡
 */
function analyzeHeartRateNadir(
  heartRateData: HealthDataRecord[]
): BedtimeRecommendation['factors']['heartRateNadir'] | undefined {
  if (heartRateData.length < 10) return undefined;

  // 按日期分组
  const dataByDate = new Map<string, HealthDataRecord[]>();
  heartRateData.forEach(record => {
    const date = new Date(record.start_date).toDateString();
    if (!dataByDate.has(date)) {
      dataByDate.set(date, []);
    }
    dataByDate.get(date)!.push(record);
  });

  // 找每天夜间（22:00 - 06:00）的最低心率时间
  const nadirTimes: number[] = [];

  dataByDate.forEach(records => {
    // 筛选夜间数据
    const nightRecords = records.filter(r => {
      const hour = new Date(r.start_date).getHours();
      return hour >= 22 || hour < 6;
    });

    if (nightRecords.length < 3) return;

    // 找最低心率
    let minHr = Infinity;
    let minHrTime: Date | null = null;

    nightRecords.forEach(r => {
      if (r.value !== null && r.value < minHr) {
        minHr = r.value;
        minHrTime = new Date(r.start_date);
      }
    });

    if (minHrTime) {
      nadirTimes.push(dateToMinutesOfDay(minHrTime));
    }
  });

  if (nadirTimes.length < 3) return undefined;

  // 计算平均最低点时间
  const avgNadirMinutes = calculateCircularMean(nadirTimes);

  // 理想入睡时间 = 最低点时间 - 2.5小时（150分钟）
  const suggestedBedtimeMinutes = avgNadirMinutes - 150;

  return {
    averageNadirTime: minutesToTimeString(avgNadirMinutes),
    suggestedBedtime: minutesToTimeString(suggestedBedtimeMinutes),
    dataPoints: nadirTimes.length,
  };
}

/**
 * 分析睡眠规律性
 *
 * 原理：研究发现规律性与更高的睡眠质量相关
 * 计算过去14天入睡时间的标准差
 * 目标：标准差 < 30分钟
 */
function analyzeSleepRegularity(
  sleepData: HealthDataRecord[]
): BedtimeRecommendation['factors']['sleepRegularity'] | undefined {
  // 筛选 asleep 或 inBed 的开始时间作为入睡时间
  const bedtimes: number[] = [];
  const processedDates = new Set<string>();

  // 按日期排序，每天只取最早的入睡记录
  const sortedSleep = [...sleepData].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  sortedSleep.forEach(record => {
    // 只考虑入睡相关的阶段
    if (record.sleep_stage && ['inBed', 'asleep', 'asleepCore', 'asleepDeep'].includes(record.sleep_stage)) {
      const startDate = new Date(record.start_date);
      const dateKey = startDate.toDateString();

      // 每天只取第一条（最早入睡时间）
      if (!processedDates.has(dateKey)) {
        processedDates.add(dateKey);
        bedtimes.push(dateToMinutesOfDay(startDate));
      }
    }
  });

  if (bedtimes.length < 5) return undefined;

  // 计算循环平均值和标准差
  const avgBedtimeMinutes = calculateCircularMean(bedtimes);
  const stdMinutes = calculateCircularStd(bedtimes, avgBedtimeMinutes);

  // 评级
  let rating: 'excellent' | 'good' | 'fair' | 'poor';
  if (stdMinutes < 15) {
    rating = 'excellent';
  } else if (stdMinutes < 30) {
    rating = 'good';
  } else if (stdMinutes < 60) {
    rating = 'fair';
  } else {
    rating = 'poor';
  }

  return {
    averageBedtime: minutesToTimeString(avgBedtimeMinutes),
    standardDeviationMinutes: Math.round(stdMinutes),
    rating,
    dataPoints: bedtimes.length,
  };
}

/**
 * 分析 HRV 状态
 *
 * 原理：睡前的 HRV 可预测当晚睡眠质量
 * HRV 较低时：建议提前入睡、避免刺激
 * HRV 较高时：身体准备好了，可以正常入睡
 */
function analyzeHrvStatus(
  hrvData: HealthDataRecord[]
): BedtimeRecommendation['factors']['hrvStatus'] | undefined {
  if (hrvData.length < 3) return undefined;

  // 按时间排序
  const sorted = [...hrvData].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  // 获取最近的 HRV 值
  const currentHrv = sorted[0]?.value;
  if (currentHrv === null || currentHrv === undefined) return undefined;

  // 计算平均 HRV（过去 7 天）
  const recentHrvValues = sorted
    .slice(0, 14)
    .map(r => r.value)
    .filter((v): v is number => v !== null);

  if (recentHrvValues.length < 3) return undefined;

  const averageHrv = recentHrvValues.reduce((a, b) => a + b, 0) / recentHrvValues.length;

  // 判断状态和调整
  let status: 'high' | 'normal' | 'low';
  let adjustment: number;

  const ratio = currentHrv / averageHrv;

  if (ratio < 0.8) {
    status = 'low';
    adjustment = -30; // 建议提前30分钟
  } else if (ratio > 1.2) {
    status = 'high';
    adjustment = 0; // 正常时间即可
  } else {
    status = 'normal';
    adjustment = 0;
  }

  return {
    currentHrv: Math.round(currentHrv),
    averageHrv: Math.round(averageHrv),
    status,
    adjustment,
  };
}

/**
 * 生成个性化建议文本
 */
function generateSuggestion(
  factors: BedtimeRecommendation['factors'],
  recommendedBedtime: string,
  language: 'zh' | 'en' = 'zh'
): string {
  const parts: string[] = [];

  if (language === 'zh') {
    parts.push(`根据你的数据分析，建议今晚 ${recommendedBedtime} 入睡。`);

    if (factors.sleepRegularity) {
      const { rating, standardDeviationMinutes } = factors.sleepRegularity;
      if (rating === 'excellent' || rating === 'good') {
        parts.push(`你的睡眠规律性很好（波动 ${standardDeviationMinutes} 分钟），继续保持！`);
      } else {
        parts.push(`建议增强睡眠规律性，目前波动 ${standardDeviationMinutes} 分钟，目标是控制在 30 分钟以内。`);
      }
    }

    if (factors.hrvStatus) {
      const { status, currentHrv, averageHrv } = factors.hrvStatus;
      if (status === 'low') {
        parts.push(`今天 HRV 偏低（${currentHrv}ms vs 平均 ${averageHrv}ms），建议比平时早睡。`);
      } else if (status === 'high') {
        parts.push(`今天 HRV 良好（${currentHrv}ms），身体恢复状态不错。`);
      }
    }
  } else {
    parts.push(`Based on your data, we recommend going to bed at ${recommendedBedtime} tonight.`);

    if (factors.sleepRegularity) {
      const { rating, standardDeviationMinutes } = factors.sleepRegularity;
      if (rating === 'excellent' || rating === 'good') {
        parts.push(`Your sleep regularity is good (±${standardDeviationMinutes} min). Keep it up!`);
      } else {
        parts.push(`Try to improve sleep regularity. Current: ±${standardDeviationMinutes} min, target: <30 min.`);
      }
    }

    if (factors.hrvStatus) {
      const { status, currentHrv, averageHrv } = factors.hrvStatus;
      if (status === 'low') {
        parts.push(`Your HRV is lower today (${currentHrv}ms vs avg ${averageHrv}ms). Consider sleeping earlier.`);
      } else if (status === 'high') {
        parts.push(`Your HRV is good today (${currentHrv}ms). You're in good recovery condition.`);
      }
    }
  }

  return parts.join(' ');
}

/**
 * 计算最佳入睡时间
 *
 * @param healthData - 健康数据记录数组
 * @param language - 语言偏好
 * @returns 最佳入睡时间建议
 */
export function calculateOptimalBedtime(
  healthData: HealthDataRecord[],
  language: 'zh' | 'en' = 'zh'
): BedtimeRecommendation {
  // 按数据类型分组
  const heartRateData = healthData.filter(
    d => d.data_type === 'HKQuantityTypeIdentifierHeartRate' ||
         d.data_type === 'heart_rate'
  );
  const sleepData = healthData.filter(
    d => d.data_type === 'HKCategoryTypeIdentifierSleepAnalysis' ||
         d.data_type === 'sleep'
  );
  const hrvData = healthData.filter(
    d => d.data_type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' ||
         d.data_type === 'hrv'
  );

  // 分析各因素
  const factors: BedtimeRecommendation['factors'] = {};

  factors.heartRateNadir = analyzeHeartRateNadir(heartRateData);
  factors.sleepRegularity = analyzeSleepRegularity(sleepData);
  factors.hrvStatus = analyzeHrvStatus(hrvData);

  // 计算置信度
  let confidence = 0;
  const suggestedTimes: number[] = [];

  // 心率最低点分析权重最高
  if (factors.heartRateNadir) {
    confidence += 40;
    suggestedTimes.push(timeStringToMinutes(factors.heartRateNadir.suggestedBedtime));
  }

  // 睡眠规律性
  if (factors.sleepRegularity) {
    confidence += 35;
    suggestedTimes.push(timeStringToMinutes(factors.sleepRegularity.averageBedtime));
  }

  // HRV 状态
  if (factors.hrvStatus) {
    confidence += 25;
  }

  // 计算综合建议时间
  let recommendedBedtimeMinutes: number;

  if (suggestedTimes.length === 0) {
    // 无数据时使用默认值（22:30）
    recommendedBedtimeMinutes = 22 * 60 + 30;
  } else if (suggestedTimes.length === 1) {
    recommendedBedtimeMinutes = suggestedTimes[0];
  } else {
    // 多个数据源时使用循环平均
    recommendedBedtimeMinutes = calculateCircularMean(suggestedTimes);
  }

  // 应用 HRV 调整
  if (factors.hrvStatus) {
    recommendedBedtimeMinutes += factors.hrvStatus.adjustment;
  }

  const recommendedBedtime = minutesToTimeString(recommendedBedtimeMinutes);

  // 计算今天或明天的建议入睡时间 Date
  const now = new Date();
  const recommendedDate = new Date(now);
  const [recHours, recMinutes] = recommendedBedtime.split(':').map(Number);
  recommendedDate.setHours(recHours, recMinutes, 0, 0);

  // 如果建议时间已过，则设为明天
  if (recommendedDate.getTime() < now.getTime()) {
    recommendedDate.setDate(recommendedDate.getDate() + 1);
  }

  // 生成建议文本
  const suggestion = generateSuggestion(factors, recommendedBedtime, language);

  // 数据不足原因
  let insufficientDataReason: string | undefined;
  if (confidence < 30) {
    insufficientDataReason = language === 'zh'
      ? '数据不足，建议持续同步 HealthKit 数据以获得更准确的建议。需要至少 5 天的睡眠数据和心率数据。'
      : 'Insufficient data. Please continue syncing HealthKit data for better recommendations. At least 5 days of sleep and heart rate data is needed.';
  }

  return {
    recommendedBedtime,
    recommendedBedtimeDate: recommendedDate,
    confidence,
    factors,
    suggestion,
    insufficientDataReason,
  };
}

/**
 * 格式化时间差为可读文本
 */
export function formatTimeUntilBedtime(
  recommendedDate: Date,
  language: 'zh' | 'en' = 'zh'
): string {
  const now = new Date();
  const diffMs = recommendedDate.getTime() - now.getTime();

  if (diffMs < 0) {
    return language === 'zh' ? '已过建议入睡时间' : 'Past recommended bedtime';
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours > 0) {
    return language === 'zh'
      ? `距建议入睡还有 ${hours} 小时 ${minutes} 分钟`
      : `${hours}h ${minutes}m until bedtime`;
  } else {
    return language === 'zh'
      ? `距建议入睡还有 ${minutes} 分钟`
      : `${minutes}m until bedtime`;
  }
}
