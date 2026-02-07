import { useState, useCallback, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../lib/supabase';
import { AuthContext } from '../../context/AuthContextDefinition';
import { isHealthKitSupported, healthKitAsync } from '../../lib/healthKitBridge';
import {
  calculateOptimalBedtime,
  formatTimeUntilBedtime,
  type BedtimeRecommendation as BedtimeRecommendationType,
  type HealthDataRecord,
} from '../../utils/bedtimeCalculator';
import {
  calculateWeeklyAverageScore,
  calculateRecoveryStatus,
  parseSleepNights,
  type SleepScoreResult,
  type RecoveryAnalysis,
} from '../../utils/sleepScoreCalculator';
import {
  isBedtimeReminderSupported,
  bedtimeReminderAsync,
} from '../../lib/bedtimeReminderBridge';
import {
  calculateSleepDebtFromNights,
  getIdealSleepMinutes,
  type SleepDebtResult,
} from '../../utils/sleepDebtCalculator';
import type { TranslationParams } from '../../context/LanguageContextDefinition';

/** SVG 圆环周长常量，半径 = 34 */
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 34;

/** 翻译函数类型 */
type TranslationFn = (key: string, params?: TranslationParams) => string;

/**
 * 获取规律性评级的显示信息（文本、颜色、背景色）
 * @param rating - 规律性等级
 * @param t - i18n 翻译函数
 */
function getRegularityDisplay(
  rating: 'excellent' | 'good' | 'fair' | 'poor',
  t: TranslationFn,
) {
  const displays = {
    excellent: { text: t('profile.sleepScore.grade.excellent'), color: 'text-green-600', bg: 'bg-green-100' },
    good: { text: t('profile.sleepScore.grade.good'), color: 'text-blue-600', bg: 'bg-blue-100' },
    fair: { text: t('profile.sleepScore.grade.fair'), color: 'text-yellow-600', bg: 'bg-yellow-100' },
    poor: { text: t('profile.sleepScore.grade.poor'), color: 'text-red-600', bg: 'bg-red-100' },
  };
  return displays[rating];
}

/**
 * 获取 HRV 状态的显示信息（文本、颜色、图标）
 * @param status - HRV 状态
 * @param t - i18n 翻译函数
 * @param language - 语言代码（'zh' | 'en'），用于无 i18n 键的文本
 */
function getHrvStatusDisplay(
  status: 'high' | 'normal' | 'low',
  t: TranslationFn,
  language: string,
) {
  const displays = {
    // TODO: 添加 i18n 键 profile.bedtime.hrvStatus.high / .low
    high: { text: language === 'zh' ? '良好' : 'Good', color: 'text-green-600', icon: 'fa-arrow-up' },
    normal: { text: t('profile.recovery.normal'), color: 'text-blue-600', icon: 'fa-minus' },
    low: { text: language === 'zh' ? '偏低' : 'Low', color: 'text-amber-600', icon: 'fa-arrow-down' },
  };
  return displays[status];
}

/**
 * 获取评分等级的颜色和显示文本
 * @param grade - 评分等级
 * @param t - i18n 翻译函数
 */
function getGradeDisplay(
  grade: 'excellent' | 'good' | 'fair' | 'poor',
  t: TranslationFn,
) {
  const displays = {
    excellent: { color: 'text-green-600', bg: 'bg-green-50', ring: 'stroke-green-500', text: t('profile.sleepScore.grade.excellent') },
    good: { color: 'text-blue-600', bg: 'bg-blue-50', ring: 'stroke-blue-500', text: t('profile.sleepScore.grade.good') },
    fair: { color: 'text-yellow-600', bg: 'bg-yellow-50', ring: 'stroke-yellow-500', text: t('profile.sleepScore.grade.fair') },
    poor: { color: 'text-red-600', bg: 'bg-red-50', ring: 'stroke-red-500', text: t('profile.sleepScore.grade.poor') },
  };
  return displays[grade];
}

/**
 * 获取维度状态对应的 Tailwind 背景色类名
 * @param status - 维度状态
 */
function getDimStatusColor(status: 'optimal' | 'good' | 'fair' | 'poor') {
  const colors = {
    optimal: 'bg-green-500',
    good: 'bg-blue-500',
    fair: 'bg-yellow-500',
    poor: 'bg-red-500',
  };
  return colors[status];
}

/**
 * 根据睡眠债务严重程度返回 Tailwind 背景色类名
 * @param severity - 债务严重程度
 */
function getSleepDebtBgColor(severity: string): string {
  switch (severity) {
    case 'none': return 'bg-green-50';
    case 'mild': return 'bg-yellow-50';
    case 'moderate': return 'bg-orange-50';
    default: return 'bg-red-50';
  }
}

/**
 * BedtimeRecommendation - 展示基于 HealthKit 数据的最佳入睡时间建议
 *
 * 基于科学研究的个性化睡眠建议框架：
 * - 心率最低点时间分析
 * - 睡眠规律性分析
 * - HRV 状态分析
 */
export function BedtimeRecommendation() {
  const { uiLanguage, t } = useTranslation();
  const auth = useContext(AuthContext);
  const userId = auth?.userId;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [healthData, setHealthData] = useState<HealthDataRecord[]>([]);
  const [timeUntil, setTimeUntil] = useState<string>('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  // 检查入睡提醒桥接是否可用
  const isReminderSupported = isBedtimeReminderSupported();

  // 检查是否支持 HealthKit（仅 iOS）
  const isSupported = isHealthKitSupported();

  // 语言
  const language = useMemo(() => {
    return uiLanguage.startsWith('zh') ? 'zh' : 'en';
  }, [uiLanguage]);

  /**
   * 从 Supabase 获取健康数据（过去 30 天）
   */
  const fetchHealthData = useCallback(async () => {
    if (!userId || !supabase) return;

    setIsLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 只查询睡眠建议所需的三种数据类型，避免被高频类型（步数等）占满默认 1000 行限制
      const { data, error } = await supabase
        .from('health_data')
        .select('*')
        .eq('user_id', userId)
        .gte('start_date', thirtyDaysAgo.toISOString())
        .in('data_type', [
          'HKQuantityTypeIdentifierHeartRate',
          'HKCategoryTypeIdentifierSleepAnalysis',
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        ])
        .order('start_date', { ascending: false })
        .limit(5000);

      if (error) {
        console.error('[BedtimeRecommendation] Error fetching health data:', error);
        return;
      }

      setHealthData(data || []);
      console.log('[BedtimeRecommendation] Fetched', data?.length || 0, 'records');
    } catch (err) {
      console.error('[BedtimeRecommendation] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * 同步更多历史数据（30天）然后刷新
   */
  const handleSyncMoreData = useCallback(async () => {
    if (!isSupported) return;

    setIsSyncing(true);
    try {
      // 先检查/请求权限
      const permissionStatus = await healthKitAsync.getPermissionStatus();
      if (permissionStatus !== 'granted') {
        const granted = await healthKitAsync.requestPermission();
        if (!granted) {
          console.log('[BedtimeRecommendation] Permission not granted');
          setIsSyncing(false);
          return;
        }
      }

      // 同步 30 天的历史数据
      console.log('[BedtimeRecommendation] Syncing 30 days of health data...');
      const result = await healthKitAsync.syncData(30);
      console.log('[BedtimeRecommendation] Sync result:', result);

      if (result.success) {
        // 同步完成后重新获取数据
        await fetchHealthData();
      }
    } catch (err) {
      console.error('[BedtimeRecommendation] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSupported, fetchHealthData]);

  /**
   * 计算最佳入睡时间（纯派生数据，无副作用）
   */
  const recommendation = useMemo<BedtimeRecommendationType | null>(() => {
    if (healthData.length === 0) return null;
    const result = calculateOptimalBedtime(healthData, language);
    console.log('[BedtimeRecommendation] Calculated recommendation:', result);
    return result;
  }, [healthData, language]);

  /**
   * 合并计算：睡眠评分、睡眠债务、恢复状态
   * 先调用一次 parseSleepNights，避免重复解析
   */
  const derivedSleepData = useMemo<{
    weeklyScore: { averageScore: number; grade: 'excellent' | 'good' | 'fair' | 'poor'; nightCount: number; scores: SleepScoreResult[] } | null;
    sleepDebt: SleepDebtResult;
    recovery: RecoveryAnalysis | null;
  } | null>(() => {
    if (healthData.length === 0) return null;

    // 解析一次睡眠夜晚数据，复用于 sleepDebt 计算
    const nights = parseSleepNights(healthData);

    // 睡眠质量评分（7 天周均）
    const weeklyScore = calculateWeeklyAverageScore(healthData, 7);
    if (weeklyScore) {
      console.log('[BedtimeRecommendation] Sleep score:', weeklyScore.averageScore, 'from', weeklyScore.nightCount, 'nights');
    }

    // 睡眠债务（14 天），使用已解析的 nights 避免重复 parseSleepNights
    const idealMinutes = getIdealSleepMinutes();
    const sleepDebt = calculateSleepDebtFromNights(nights, idealMinutes, 14);
    if (sleepDebt.validNightCount > 0) {
      console.log('[BedtimeRecommendation] Sleep debt:', sleepDebt.totalDebtMinutes, 'min,', sleepDebt.severity);
    }

    // 恢复状态（SDNN 趋势）
    const recovery = calculateRecoveryStatus(healthData);
    if (recovery) {
      console.log('[BedtimeRecommendation] Recovery status:', recovery.status, 'trend:', recovery.trend);
    }

    return { weeklyScore, sleepDebt, recovery };
  }, [healthData]);

  // 从 derivedSleepData 中提取各项数据
  const sleepScoreData = derivedSleepData?.weeklyScore ?? null;
  const sleepDebtData = derivedSleepData?.sleepDebt ?? null;
  const recoveryData = derivedSleepData?.recovery ?? null;

  /**
   * 获取入睡提醒当前状态（添加竞态防护）
   */
  useEffect(() => {
    if (!isReminderSupported || !isExpanded) return;

    let cancelled = false;

    bedtimeReminderAsync.getStatus().then(status => {
      if (!cancelled) {
        setReminderEnabled(status.scheduled);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isReminderSupported, isExpanded]);

  /**
   * 切换入睡提醒开关
   */
  const handleToggleReminder = useCallback(async () => {
    if (!recommendation || recommendation.confidence < 30) return;

    setReminderLoading(true);
    try {
      if (reminderEnabled) {
        // 取消提醒
        const success = await bedtimeReminderAsync.cancel();
        if (success) {
          setReminderEnabled(false);
          console.log('[BedtimeRecommendation] Reminder cancelled');
        }
      } else {
        // 调度提醒：解析推荐时间并验证格式
        const [hour, minute] = recommendation.recommendedBedtime.split(':').map(Number);
        if (isNaN(hour) || isNaN(minute)) {
          console.error('[BedtimeReminder] Invalid bedtime format:', recommendation.recommendedBedtime);
          return;
        }
        const result = await bedtimeReminderAsync.schedule(hour, minute, 30);
        if (result.success) {
          setReminderEnabled(true);
          console.log('[BedtimeRecommendation] Reminder scheduled at', result.reminderTime);
        }
      }
    } catch (err) {
      console.error('[BedtimeRecommendation] Toggle reminder error:', err);
    } finally {
      setReminderLoading(false);
    }
  }, [reminderEnabled, recommendation]);

  /**
   * 更新倒计时
   */
  useEffect(() => {
    if (!recommendation) return;

    const updateTimeUntil = () => {
      setTimeUntil(formatTimeUntilBedtime(recommendation.recommendedBedtimeDate, language));
    };

    updateTimeUntil();
    const interval = setInterval(updateTimeUntil, 60000); // 每分钟更新

    return () => clearInterval(interval);
  }, [recommendation, language]);

  /**
   * 展开时自动获取数据（添加竞态防护）
   */
  useEffect(() => {
    if (!isExpanded || healthData.length > 0) return;

    let cancelled = false;

    // fetchHealthData 内部会设置 isLoading 和 healthData 状态
    // 由于 fetchHealthData 是 useCallback，这里通过 cancelled 标志防止组件卸载后的状态更新
    const doFetch = async () => {
      if (!cancelled) {
        await fetchHealthData();
      }
    };
    doFetch();

    return () => {
      cancelled = true;
    };
  }, [isExpanded, healthData.length, fetchHealthData]);

  // 非 iOS 设备不显示此组件
  if (!isSupported) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Main Row - Clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-moon text-indigo-500"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">
              {/* TODO: 添加 i18n 键 profile.bedtime.title */}
              {language === 'zh' ? '最佳入睡时间' : 'Optimal Bedtime'}
            </p>
            <p className="text-xs text-gray-400">
              {/* TODO: 添加 i18n 键 profile.bedtime.subtitle */}
              {language === 'zh' ? '基于你的健康数据分析' : 'Based on your health data'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recommendation && recommendation.confidence >= 30 && (
            <span className="text-lg font-semibold text-indigo-600">
              {recommendation.recommendedBedtime}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-indigo-300 mb-2"></i>
            <p className="text-sm text-gray-400">
              {/* TODO: 添加 i18n 键 profile.bedtime.analyzing */}
              {language === 'zh' ? '分析你的睡眠数据...' : 'Analyzing your sleep data...'}
            </p>
          </div>
        )}

        {/* No Data or Low Confidence */}
        {!isLoading && !isSyncing && (!recommendation || recommendation.confidence < 30) && (
          <div className="p-6 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <i className="fa-solid fa-chart-line text-2xl text-gray-300"></i>
            </div>
            <p className="text-sm text-gray-500 text-center mb-2">
              {/* TODO: 添加 i18n 键 profile.bedtime.noData */}
              {language === 'zh'
                ? '数据不足以生成建议'
                : 'Not enough data for recommendations'}
            </p>
            <p className="text-xs text-gray-400 text-center px-4 mb-4">
              {/* TODO: 添加 i18n 键 profile.bedtime.noDataHint */}
              {recommendation?.insufficientDataReason || (language === 'zh'
                ? '请同步更多 HealthKit 历史数据，需要至少 5 天的睡眠和心率数据。'
                : 'Please sync more HealthKit history. At least 5 days of sleep and heart rate data is needed.')}
            </p>
            <button
              onClick={handleSyncMoreData}
              disabled={isSyncing}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium rounded-xl hover:shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <i className="fa-solid fa-cloud-arrow-down"></i>
              {/* TODO: 添加 i18n 键 profile.bedtime.syncHistory */}
              {language === 'zh' ? '同步 30 天历史数据' : 'Sync 30 Days History'}
            </button>
          </div>
        )}

        {/* Syncing State */}
        {isSyncing && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-indigo-400 mb-3"></i>
            <p className="text-sm text-indigo-600 font-medium">
              {/* TODO: 添加 i18n 键 profile.bedtime.syncing */}
              {language === 'zh' ? '正在同步历史数据...' : 'Syncing history data...'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {/* TODO: 添加 i18n 键 profile.bedtime.syncWait */}
              {language === 'zh' ? '这可能需要几秒钟' : 'This may take a few seconds'}
            </p>
          </div>
        )}

        {/* Recommendation Display */}
        {!isLoading && recommendation && recommendation.confidence >= 30 && (
          <>
            {/* Main Recommendation */}
            <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50">
              <div className="text-center">
                <p className="text-xs text-indigo-600 uppercase tracking-wide mb-2">
                  {/* TODO: 添加 i18n 键 profile.bedtime.recommended */}
                  {language === 'zh' ? '今晚建议入睡时间' : 'Recommended Bedtime Tonight'}
                </p>
                <p className="text-5xl font-bold text-indigo-600 mb-2">
                  {recommendation.recommendedBedtime}
                </p>
                <p className="text-sm text-indigo-500">
                  {timeUntil}
                </p>
              </div>

              {/* Confidence Indicator */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="text-xs text-gray-500">
                  {/* TODO: 添加 i18n 键 profile.bedtime.confidence */}
                  {language === 'zh' ? '置信度' : 'Confidence'}
                </span>
                <div className="flex-1 max-w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${recommendation.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-indigo-600">{recommendation.confidence}%</span>
              </div>
            </div>

            {/* Bedtime Reminder Toggle (iOS only) */}
            {isReminderSupported && (
              <div className="px-4 pb-2">
                <button
                  onClick={handleToggleReminder}
                  disabled={reminderLoading}
                  className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-indigo-100 hover:bg-indigo-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <i className={`fa-solid fa-bell text-indigo-500 text-sm ${reminderEnabled ? '' : 'opacity-50'}`}></i>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700">
                        {t('profile.bedtimeReminder.title')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.reminderHint（当前 bedtimeReminder.description 文本不匹配） */}
                        {language === 'zh' ? '提前 30 分钟提醒' : '30 min before bedtime'}
                      </p>
                    </div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative ${reminderEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                    {reminderLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <i className="fa-solid fa-spinner fa-spin text-white text-xs"></i>
                      </div>
                    ) : (
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${reminderEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    )}
                  </div>
                </button>
              </div>
            )}

            {/* Analysis Factors */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                {/* TODO: 添加 i18n 键 profile.bedtime.analysisFactors */}
                {language === 'zh' ? '分析依据' : 'Analysis Factors'}
              </p>

              {/* Heart Rate Nadir */}
              {recommendation.factors.heartRateNadir && (
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-heart-pulse text-red-500 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {/* TODO: 添加 i18n 键 profile.bedtime.hrNadir */}
                        {language === 'zh' ? '心率最低点' : 'HR Nadir Time'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.daysOfData */}
                        {language === 'zh'
                          ? `${recommendation.factors.heartRateNadir.dataPoints} 天数据`
                          : `${recommendation.factors.heartRateNadir.dataPoints} days of data`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-red-600">
                    {recommendation.factors.heartRateNadir.averageNadirTime}
                  </p>
                </div>
              )}

              {/* Sleep Regularity */}
              {recommendation.factors.sleepRegularity && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-clock text-blue-500 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {/* TODO: 添加 i18n 键 profile.bedtime.sleepRegularity */}
                        {language === 'zh' ? '睡眠规律性' : 'Sleep Regularity'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.avgBedtime */}
                        {language === 'zh'
                          ? `平均 ${recommendation.factors.sleepRegularity.averageBedtime} 入睡`
                          : `Avg bedtime ${recommendation.factors.sleepRegularity.averageBedtime}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${getRegularityDisplay(recommendation.factors.sleepRegularity.rating, t).bg} ${getRegularityDisplay(recommendation.factors.sleepRegularity.rating, t).color}`}>
                      {getRegularityDisplay(recommendation.factors.sleepRegularity.rating, t).text}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      ±{recommendation.factors.sleepRegularity.standardDeviationMinutes} min
                    </p>
                  </div>
                </div>
              )}

              {/* HRV Status */}
              {recommendation.factors.hrvStatus && (
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-wave-square text-purple-500 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {/* TODO: 添加 i18n 键 profile.bedtime.todayHrv */}
                        {language === 'zh' ? '今日 HRV' : "Today's HRV"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.avgHrv */}
                        {language === 'zh'
                          ? `平均 ${recommendation.factors.hrvStatus.averageHrv} ms`
                          : `Avg ${recommendation.factors.hrvStatus.averageHrv} ms`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-purple-600">
                      {recommendation.factors.hrvStatus.currentHrv} ms
                    </span>
                    <i className={`fa-solid ${getHrvStatusDisplay(recommendation.factors.hrvStatus.status, t, language).icon} ${getHrvStatusDisplay(recommendation.factors.hrvStatus.status, t, language).color} text-xs`}></i>
                  </div>
                </div>
              )}

              {/* Recovery Status Indicator */}
              {recoveryData && (
                <div className={`flex items-center justify-between p-3 rounded-xl ${
                  recoveryData.status === 'well_recovered' ? 'bg-emerald-50' :
                  recoveryData.status === 'normal' ? 'bg-sky-50' : 'bg-amber-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      recoveryData.status === 'well_recovered' ? 'bg-emerald-100' :
                      recoveryData.status === 'normal' ? 'bg-sky-100' : 'bg-amber-100'
                    }`}>
                      <i className={`fa-solid ${
                        recoveryData.status === 'well_recovered' ? 'fa-battery-full' :
                        recoveryData.status === 'normal' ? 'fa-battery-half' : 'fa-battery-quarter'
                      } ${
                        recoveryData.status === 'well_recovered' ? 'text-emerald-500' :
                        recoveryData.status === 'normal' ? 'text-sky-500' : 'text-amber-500'
                      } text-sm`}></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {t('profile.recovery.title')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.sdnnInfo */}
                        {language === 'zh'
                          ? `SDNN ${recoveryData.shortTermAvg}ms (${recoveryData.dataPoints}天)`
                          : `SDNN ${recoveryData.shortTermAvg}ms (${recoveryData.dataPoints} days)`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      recoveryData.status === 'well_recovered' ? 'bg-emerald-100 text-emerald-700' :
                      recoveryData.status === 'normal' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {recoveryData.status === 'well_recovered'
                        ? t('profile.recovery.wellRecovered')
                        : recoveryData.status === 'normal'
                          ? t('profile.recovery.normal')
                          : t('profile.recovery.needsRecovery')
                      }
                    </span>
                    <i className={`fa-solid ${
                      recoveryData.trend === 'rising' ? 'fa-arrow-trend-up text-emerald-500' :
                      recoveryData.trend === 'stable' ? 'fa-minus text-sky-500' : 'fa-arrow-trend-down text-amber-500'
                    } text-xs`}></i>
                  </div>
                </div>
              )}
            </div>

            {/* Personalized Suggestion */}
            <div className="px-4 pb-4">
              <div className="p-4 bg-indigo-50 rounded-xl">
                <div className="flex items-start gap-2">
                  <i className="fa-solid fa-lightbulb text-indigo-500 mt-0.5"></i>
                  <p className="text-sm text-indigo-700 leading-relaxed">
                    {recommendation.suggestion}
                  </p>
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <div className="px-4 pb-4">
              <button
                onClick={fetchHealthData}
                disabled={isLoading}
                className="w-full py-2.5 px-4 border border-indigo-200 text-indigo-600 font-medium rounded-xl hover:bg-indigo-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`}></i>
                <span>
                  {/* TODO: 添加 i18n 键 profile.bedtime.refreshAnalysis / profile.bedtime.analyzing */}
                  {isLoading
                    ? (language === 'zh' ? '分析中...' : 'Analyzing...')
                    : (language === 'zh' ? '刷新分析' : 'Refresh Analysis')}
                </span>
              </button>
            </div>

            {/* Sleep Debt Section */}
            {sleepDebtData && sleepDebtData.validNightCount > 0 && (
              <div className="px-4 pb-4">
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      {t('profile.sleepDebt.title')}
                    </p>
                    <span className="text-xs text-gray-400">
                      {/* TODO: 添加 i18n 键 profile.bedtime.pastDays */}
                      {language === 'zh'
                        ? `过去 ${sleepDebtData.lookbackDays} 天`
                        : `Past ${sleepDebtData.lookbackDays} days`}
                    </span>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${getSleepDebtBgColor(sleepDebtData.severity)}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      sleepDebtData.severity === 'none' ? 'bg-green-100' :
                      sleepDebtData.severity === 'mild' ? 'bg-yellow-100' :
                      sleepDebtData.severity === 'moderate' ? 'bg-orange-100' : 'bg-red-100'
                    }`}>
                      <i className={`fa-solid ${
                        sleepDebtData.totalDebtMinutes <= 0 ? 'fa-check' : 'fa-scale-unbalanced'
                      } ${
                        sleepDebtData.severity === 'none' ? 'text-green-600' :
                        sleepDebtData.severity === 'mild' ? 'text-yellow-600' :
                        sleepDebtData.severity === 'moderate' ? 'text-orange-600' : 'text-red-600'
                      } text-sm`}></i>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-bold ${
                          sleepDebtData.severity === 'none' ? 'text-green-700' :
                          sleepDebtData.severity === 'mild' ? 'text-yellow-700' :
                          sleepDebtData.severity === 'moderate' ? 'text-orange-700' : 'text-red-700'
                        }`}>
                          {sleepDebtData.totalDebtMinutes <= 0
                            ? t('profile.sleepDebt.none')
                            : `${Math.floor(Math.abs(sleepDebtData.totalDebtMinutes) / 60)}h ${Math.abs(sleepDebtData.totalDebtMinutes) % 60}m`
                          }
                        </span>
                        {sleepDebtData.totalDebtMinutes > 30 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            sleepDebtData.severity === 'mild' ? 'bg-yellow-200 text-yellow-700' :
                            sleepDebtData.severity === 'moderate' ? 'bg-orange-200 text-orange-700' :
                            'bg-red-200 text-red-700'
                          }`}>
                            {sleepDebtData.severity === 'mild'
                              ? t('profile.sleepDebt.mild')
                              : sleepDebtData.severity === 'moderate'
                                ? t('profile.sleepDebt.moderate')
                                : t('profile.sleepDebt.severe')
                            }
                          </span>
                        )}
                      </div>
                      {sleepDebtData.totalDebtMinutes <= 0 && (
                        <p className="text-xs text-green-600">
                          {/* TODO: 添加 i18n 键 profile.sleepDebt.surplusAmount */}
                          {`${t('profile.sleepDebt.surplus')} ${Math.floor(Math.abs(sleepDebtData.totalDebtMinutes) / 60)}h ${Math.abs(sleepDebtData.totalDebtMinutes) % 60}m`}
                        </p>
                      )}
                      {sleepDebtData.recoveryPlan && (
                        <p className="text-xs text-gray-500 mt-1">
                          {/* TODO: 添加 i18n 键 profile.bedtime.extraSleep */}
                          {language === 'zh'
                            ? `建议每晚多睡 ${sleepDebtData.recoveryPlan.extraMinutesPerNight} 分钟`
                            : `Try sleeping ${sleepDebtData.recoveryPlan.extraMinutesPerNight} min extra/night`
                          }
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sleep Quality Score Section */}
            {sleepScoreData && (
              <div className="px-4 pb-4">
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                    {t('profile.sleepScore.title')}
                  </p>

                  {/* Score Ring + Grade */}
                  <div className="flex items-center gap-4 mb-4">
                    {/* SVG Score Ring */}
                    <div className="relative w-20 h-20 flex-shrink-0">
                      <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                        {/* Background ring */}
                        <circle
                          cx="40" cy="40" r="34"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                        />
                        {/* Score ring */}
                        <circle
                          cx="40" cy="40" r="34"
                          fill="none"
                          className={getGradeDisplay(sleepScoreData.grade, t).ring}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${(sleepScoreData.averageScore / 100) * CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-bold ${getGradeDisplay(sleepScoreData.grade, t).color}`}>
                          {sleepScoreData.averageScore}
                        </span>
                      </div>
                    </div>

                    {/* Grade + Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${getGradeDisplay(sleepScoreData.grade, t).bg} ${getGradeDisplay(sleepScoreData.grade, t).color}`}>
                          {getGradeDisplay(sleepScoreData.grade, t).text}
                        </span>
                        <span className="text-xs text-gray-400">
                          {t('profile.sleepScore.weekAvg')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {/* TODO: 添加 i18n 键 profile.bedtime.basedOnNights */}
                        {language === 'zh'
                          ? `基于 ${sleepScoreData.nightCount} 晚数据`
                          : `Based on ${sleepScoreData.nightCount} nights`}
                      </p>
                    </div>
                  </div>

                  {/* Dimension Bars (Last night's score if available) */}
                  {sleepScoreData.scores.length > 0 && (() => {
                    const lastNight = sleepScoreData.scores[0];
                    const dims = [
                      // TODO: 以下维度使用短标签，与 i18n 键（profile.sleepScore.dim.*）文本不完全一致，需添加专用短标签键
                      { key: 'totalSleep', label: language === 'zh' ? '总时长' : 'Total Sleep', data: lastNight.dimensions.totalSleep },
                      { key: 'efficiency', label: language === 'zh' ? '效率' : 'Efficiency', data: lastNight.dimensions.efficiency },
                      { key: 'deepSleep', label: language === 'zh' ? '深睡' : 'Deep', data: lastNight.dimensions.deepSleep },
                      { key: 'remSleep', label: language === 'zh' ? 'REM' : 'REM', data: lastNight.dimensions.remSleep },
                      { key: 'latency', label: language === 'zh' ? '入睡' : 'Latency', data: lastNight.dimensions.latency },
                      { key: 'awakenings', label: language === 'zh' ? '觉醒' : 'Wake', data: lastNight.dimensions.awakenings },
                    ];

                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 mb-2">
                          {/* TODO: 添加 i18n 键 profile.bedtime.lastNightDetails */}
                          {language === 'zh' ? '昨晚各维度' : 'Last night details'}
                        </p>
                        {dims.map(dim => (
                          <div key={dim.key} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">{dim.label}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${getDimStatusColor(dim.data.status)}`}
                                style={{ width: `${dim.data.score}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right flex-shrink-0">{dim.data.score}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}

        {/* Health Disclaimer */}
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
          <div className="flex items-start gap-2">
            <i className="fa-solid fa-info-circle text-amber-500 mt-0.5 text-xs"></i>
            <p className="text-xs text-amber-700">
              {/* TODO: 添加 i18n 键 profile.bedtime.disclaimer */}
              {language === 'zh'
                ? '睡眠建议仅供参考，旨在帮助您建立更健康的睡眠习惯，不能替代专业医疗建议。如有睡眠问题，请咨询医生。'
                : 'Sleep recommendations are for reference only and cannot replace professional medical advice. Consult a doctor if you have sleep concerns.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
