import { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../lib/supabase';
import { AuthContext } from '../../context/AuthContextDefinition';
import { isHealthKitSupported, openHealthApp } from '../../lib/healthKitBridge';
import type { HealthDataRecord } from '../../utils/bedtimeCalculator';
import {
  parseSleepNights,
  calculateWeeklyAverageScore,
  calculateRecoveryStatus,
} from '../../utils/sleepScoreCalculator';
import { calculateSleepDebtFromNights, getIdealSleepMinutes } from '../../utils/sleepDebtCalculator';

/**
 * WeeklySleepReport - 每周睡眠报告展开卡片
 *
 * 展示过去 7 天的睡眠统计摘要：
 * - 平均时长和评分
 * - 睡眠结构占比（深睡/REM/浅睡）
 * - HRV 趋势
 * - 睡眠债务状态
 */
export function WeeklySleepReport() {
  // TODO: 当 profile.weeklyReport.* 翻译键添加到 zh.json/en.json 后，使用 t() 替换三元表达式
  const { uiLanguage } = useTranslation();
  const auth = useContext(AuthContext);
  const userId = auth?.userId;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthDataRecord[]>([]);

  const isSupported = isHealthKitSupported();

  const language = useMemo(() => {
    return uiLanguage.startsWith('zh') ? 'zh' : 'en';
  }, [uiLanguage]);

  /**
   * 展开时获取数据（带竞态条件防护）
   * 使用 cancelled 标志确保组件卸载或依赖变化后不会更新 state
   */
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!userId || !supabase) return;

      setIsLoading(true);
      try {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const { data, error } = await supabase
          .from('health_data')
          .select('*')
          .eq('user_id', userId)
          .gte('start_date', fourteenDaysAgo.toISOString())
          .in('data_type', [
            'HKCategoryTypeIdentifierSleepAnalysis',
            'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          ])
          .order('start_date', { ascending: false })
          .limit(5000);

        if (error) {
          console.error('[WeeklySleepReport] Error:', error);
          return;
        }

        if (!cancelled) {
          setHealthData(data || []);
        }
      } catch (err) {
        console.error('[WeeklySleepReport] Error:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    if (isExpanded && healthData.length === 0) {
      fetchData();
    }

    return () => {
      cancelled = true;
    };
  }, [isExpanded, healthData.length, userId]);

  // 计算报告数据
  const reportData = useMemo(() => {
    if (healthData.length === 0) return null;

    // Debug: 日志记录数据统计，帮助排查数据问题（仅开发环境）
    if (import.meta.env.DEV) {
      const sleepRecords = healthData.filter(d => d.data_type === 'HKCategoryTypeIdentifierSleepAnalysis');
      const hrvRecords = healthData.filter(d => d.data_type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN');
      console.log(`[WeeklySleepReport] 数据统计: 总计 ${healthData.length} 条, 睡眠 ${sleepRecords.length} 条, HRV ${hrvRecords.length} 条`);
    }

    // 先解析一次 nights，后续函数复用此结果，避免重复解析
    const nights = parseSleepNights(healthData);

    // NOTE: calculateWeeklyAverageScore 内部会再次调用 parseSleepNights，
    // 因为其依赖的 calculateDaytimeHrvAvg 未导出，暂时无法避免。
    const weekScore = calculateWeeklyAverageScore(healthData, 7);
    const recovery = calculateRecoveryStatus(healthData);
    // 使用 calculateSleepDebtFromNights 直接传入 nights，避免重复解析
    const debt = calculateSleepDebtFromNights(nights, getIdealSleepMinutes(), 7);

    // 计算过去 7 天的夜晚
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekNights = nights.filter(n => n.sleepStart >= sevenDaysAgo);

    // Debug: 每晚详情（仅开发环境）
    if (import.meta.env.DEV) {
      console.log(`[WeeklySleepReport] 解析出 ${nights.length} 个夜晚, 过去7天 ${weekNights.length} 个夜晚`);
      for (const n of weekNights) {
        console.log(`  ${n.nightDate}: 总睡 ${n.totalSleepMinutes}min, 深睡 ${n.deepSleepMinutes}min, REM ${n.remSleepMinutes}min, 浅睡 ${n.coreSleepMinutes}min, 觉醒 ${n.awakenings}次, 来源数 ${new Set(n.stages.map(s => s.source_bundle_id)).size}`);
      }
    }

    if (weekNights.length === 0) return null;

    // 平均睡眠时长
    const avgSleepMinutes = Math.round(
      weekNights.reduce((sum, n) => sum + n.totalSleepMinutes, 0) / weekNights.length
    );

    // 睡眠结构平均占比
    const totalSleep = weekNights.reduce((sum, n) => sum + n.totalSleepMinutes, 0);
    const totalDeep = weekNights.reduce((sum, n) => sum + n.deepSleepMinutes, 0);
    const totalRem = weekNights.reduce((sum, n) => sum + n.remSleepMinutes, 0);
    const totalCore = weekNights.reduce((sum, n) => sum + n.coreSleepMinutes, 0);

    const deepPercent = totalSleep > 0 ? Math.round((totalDeep / totalSleep) * 100) : 0;
    const remPercent = totalSleep > 0 ? Math.round((totalRem / totalSleep) * 100) : 0;
    const corePercent = totalSleep > 0 ? Math.round((totalCore / totalSleep) * 100) : 0;

    // 平均觉醒次数
    const avgAwakenings = Math.round(
      weekNights.reduce((sum, n) => sum + n.awakenings, 0) / weekNights.length * 10
    ) / 10;

    return {
      nightCount: weekNights.length,
      avgSleepMinutes,
      avgSleepHours: Math.floor(avgSleepMinutes / 60),
      avgSleepMins: avgSleepMinutes % 60,
      deepPercent,
      remPercent,
      corePercent,
      avgAwakenings,
      weekScore,
      recovery,
      debt,
    };
  }, [healthData]);

  if (!isSupported) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Header Row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-chart-column text-violet-500"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">
              {/* TODO: 添加 i18n 键 profile.weeklyReport.title 后替换为 t('profile.weeklyReport.title') */}
              {language === 'zh' ? '每周睡眠报告' : 'Weekly Sleep Report'}
            </p>
            <p className="text-xs text-gray-400">
              {/* TODO: 添加 i18n 键 profile.weeklyReport.subtitle 后替换为 t('profile.weeklyReport.subtitle') */}
              {language === 'zh' ? '过去 7 天睡眠总结' : 'Last 7 days summary'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reportData?.weekScore && (
            <span className={`text-lg font-semibold ${
              reportData.weekScore.grade === 'excellent' ? 'text-green-600' :
              reportData.weekScore.grade === 'good' ? 'text-blue-600' :
              reportData.weekScore.grade === 'fair' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {reportData.weekScore.averageScore}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="border-t border-gray-100"></div>

        {/* Loading */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-violet-300 mb-2"></i>
            <p className="text-sm text-gray-400">
              {/* TODO: 添加 i18n 键 profile.weeklyReport.loading 后替换为 t('profile.weeklyReport.loading') */}
              {language === 'zh' ? '生成报告中...' : 'Generating report...'}
            </p>
          </div>
        )}

        {/* No Data */}
        {!isLoading && !reportData && (
          <div className="p-6 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <i className="fa-solid fa-bed text-2xl text-gray-300"></i>
            </div>
            <p className="text-sm text-gray-500 text-center">
              {/* TODO: 添加 i18n 键 profile.weeklyReport.noData 后替换为 t('profile.weeklyReport.noData') */}
              {language === 'zh' ? '暂无足够的睡眠数据' : 'Not enough sleep data yet'}
            </p>
          </div>
        )}

        {/* Report Content */}
        {!isLoading && reportData && (
          <div className="p-4 space-y-4">
            {/* Overview Stats */}
            <div className="grid grid-cols-3 gap-3">
              {/* Avg Duration */}
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="text-xs text-indigo-500 mb-1">
                  {/* TODO: 添加 i18n 键 profile.weeklyReport.avgDuration 后替换为 t('profile.weeklyReport.avgDuration') */}
                  {language === 'zh' ? '平均时长' : 'Avg Duration'}
                </p>
                <p className="text-lg font-bold text-indigo-700">
                  {reportData.avgSleepHours}h{reportData.avgSleepMins > 0 ? ` ${reportData.avgSleepMins}m` : ''}
                </p>
              </div>

              {/* Avg Score */}
              {reportData.weekScore && (
                <div className="bg-violet-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-violet-500 mb-1">
                    {/* TODO: 添加 i18n 键 profile.weeklyReport.avgScore 后替换为 t('profile.weeklyReport.avgScore') */}
                    {language === 'zh' ? '平均评分' : 'Avg Score'}
                  </p>
                  <p className="text-lg font-bold text-violet-700">
                    {reportData.weekScore.averageScore}
                  </p>
                </div>
              )}

              {/* Nights - 有效夜数：过去7天中有睡眠阶段记录的夜晚数 */}
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-xs text-purple-500 mb-1">
                  {/* TODO: 添加 i18n 键 profile.weeklyReport.validNights 后替换为 t('profile.weeklyReport.validNights') */}
                  {language === 'zh' ? '有效夜数' : 'Valid Nights'}
                </p>
                <p className="text-lg font-bold text-purple-700">
                  {reportData.nightCount}<span className="text-xs font-normal text-purple-400">/7</span>
                </p>
              </div>
            </div>

            {/* Sleep Structure */}
            {(reportData.deepPercent > 0 || reportData.remPercent > 0) && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                  {/* TODO: 添加 i18n 键 profile.weeklyReport.sleepStructure 后替换为 t('profile.weeklyReport.sleepStructure') */}
                  {language === 'zh' ? '睡眠结构' : 'Sleep Structure'}
                </p>
                {/* Stacked bar */}
                <div className="h-4 rounded-full overflow-hidden flex bg-gray-100">
                  {reportData.deepPercent > 0 && (
                    <div
                      className="bg-indigo-600 transition-all duration-500"
                      style={{ width: `${reportData.deepPercent}%` }}
                    />
                  )}
                  {reportData.remPercent > 0 && (
                    <div
                      className="bg-purple-400 transition-all duration-500"
                      style={{ width: `${reportData.remPercent}%` }}
                    />
                  )}
                  {reportData.corePercent > 0 && (
                    <div
                      className="bg-blue-300 transition-all duration-500"
                      style={{ width: `${reportData.corePercent}%` }}
                    />
                  )}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                    <span className="text-xs text-gray-500">
                      {/* TODO: 添加 i18n 键 profile.weeklyReport.deep 后替换为 t('profile.weeklyReport.deep') */}
                      {language === 'zh' ? '深睡' : 'Deep'} {reportData.deepPercent}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400"></div>
                    <span className="text-xs text-gray-500">
                      REM {reportData.remPercent}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-300"></div>
                    <span className="text-xs text-gray-500">
                      {/* TODO: 添加 i18n 键 profile.weeklyReport.light 后替换为 t('profile.weeklyReport.light') */}
                      {language === 'zh' ? '浅睡' : 'Light'} {reportData.corePercent}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Stats Row */}
            <div className="flex items-center gap-3">
              {/* Awakenings */}
              <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <i className="fa-solid fa-eye text-gray-400 text-xs"></i>
                <div>
                  <p className="text-xs text-gray-400">
                    {/* TODO: 添加 i18n 键 profile.weeklyReport.wake 后替换为 t('profile.weeklyReport.wake') */}
                    {language === 'zh' ? '觉醒' : 'Wake'}
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    {/* TODO: 添加 i18n 键 profile.weeklyReport.perNight 后替换为 t('profile.weeklyReport.perNight') */}
                    {reportData.avgAwakenings}{language === 'zh' ? '次/晚' : '/night'}
                  </p>
                </div>
              </div>

              {/* Recovery */}
              {reportData.recovery && (
                <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <i className={`fa-solid fa-heart-pulse text-xs ${
                    reportData.recovery.status === 'well_recovered' ? 'text-emerald-500' :
                    reportData.recovery.status === 'normal' ? 'text-sky-500' : 'text-amber-500'
                  }`}></i>
                  <div>
                    <p className="text-xs text-gray-400">HRV</p>
                    <p className="text-sm font-medium text-gray-700">
                      {reportData.recovery.shortTermAvg}ms
                    </p>
                  </div>
                </div>
              )}

              {/* Debt */}
              {reportData.debt.validNightCount > 0 && (
                <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <i className={`fa-solid fa-scale-unbalanced text-xs ${
                    reportData.debt.severity === 'none' ? 'text-green-500' :
                    reportData.debt.severity === 'mild' ? 'text-yellow-500' :
                    'text-orange-500'
                  }`}></i>
                  <div>
                    <p className="text-xs text-gray-400">
                      {/* TODO: 添加 i18n 键 profile.weeklyReport.debt 后替换为 t('profile.weeklyReport.debt') */}
                      {language === 'zh' ? '债务' : 'Debt'}
                    </p>
                    <p className="text-sm font-medium text-gray-700">
                      {reportData.debt.totalDebtMinutes <= 0
                        ? (/* TODO: 添加 i18n 键 profile.weeklyReport.debtNone 后替换为 t('profile.weeklyReport.debtNone') */
                           language === 'zh' ? '无' : 'None')
                        : `${Math.floor(reportData.debt.totalDebtMinutes / 60)}h${reportData.debt.totalDebtMinutes % 60}m`
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Apple Health Link */}
            <button
              onClick={() => {
                if (import.meta.env.DEV) {
                  console.log('[WeeklySleepReport] Opening Apple Health...');
                }
                openHealthApp();
              }}
              className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-pink-50 to-red-50 rounded-xl hover:from-pink-100 hover:to-red-100 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <i className="fa-solid fa-heart text-pink-500"></i>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-700">
                    {/* TODO: 添加 i18n 键 profile.weeklyReport.viewInHealth 后替换为 t('profile.weeklyReport.viewInHealth') */}
                    {language === 'zh' ? '在 Apple Health 中查看睡眠' : 'View Sleep in Apple Health'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {/* TODO: 添加 i18n 键 profile.weeklyReport.dataSource 后替换为 t('profile.weeklyReport.dataSource', { count: reportData.nightCount }) */}
                    {language === 'zh'
                      ? `数据来源：Apple Health · ${reportData.nightCount}/7 晚已同步`
                      : `Source: Apple Health · ${reportData.nightCount}/7 nights synced`
                    }
                  </p>
                </div>
              </div>
              <i className="fa-solid fa-arrow-up-right-from-square text-xs text-pink-400"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
