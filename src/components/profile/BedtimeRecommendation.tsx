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

/**
 * BedtimeRecommendation - 展示基于 HealthKit 数据的最佳入睡时间建议
 *
 * 基于科学研究的个性化睡眠建议框架：
 * - 心率最低点时间分析
 * - 睡眠规律性分析
 * - HRV 状态分析
 */
export function BedtimeRecommendation() {
  const { uiLanguage } = useTranslation();
  const auth = useContext(AuthContext);
  const userId = auth?.userId;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [healthData, setHealthData] = useState<HealthDataRecord[]>([]);
  const [recommendation, setRecommendation] = useState<BedtimeRecommendationType | null>(null);
  const [timeUntil, setTimeUntil] = useState<string>('');

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

      const { data, error } = await supabase
        .from('health_data')
        .select('*')
        .eq('user_id', userId)
        .gte('start_date', thirtyDaysAgo.toISOString())
        .order('start_date', { ascending: false });

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
   * 计算最佳入睡时间
   */
  useEffect(() => {
    if (healthData.length > 0) {
      const result = calculateOptimalBedtime(healthData, language);
      setRecommendation(result);
      console.log('[BedtimeRecommendation] Calculated recommendation:', result);
    }
  }, [healthData, language]);

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
   * 展开时自动获取数据
   */
  useEffect(() => {
    if (isExpanded && healthData.length === 0) {
      fetchHealthData();
    }
  }, [isExpanded, healthData.length, fetchHealthData]);

  // 非 iOS 设备不显示此组件
  if (!isSupported) {
    return null;
  }

  /**
   * 获取规律性评级的显示
   */
  const getRegularityDisplay = (rating: 'excellent' | 'good' | 'fair' | 'poor') => {
    const displays = {
      excellent: { text: language === 'zh' ? '优秀' : 'Excellent', color: 'text-green-600', bg: 'bg-green-100' },
      good: { text: language === 'zh' ? '良好' : 'Good', color: 'text-blue-600', bg: 'bg-blue-100' },
      fair: { text: language === 'zh' ? '一般' : 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' },
      poor: { text: language === 'zh' ? '需改善' : 'Needs Work', color: 'text-red-600', bg: 'bg-red-100' },
    };
    return displays[rating];
  };

  /**
   * 获取 HRV 状态的显示
   */
  const getHrvStatusDisplay = (status: 'high' | 'normal' | 'low') => {
    const displays = {
      high: { text: language === 'zh' ? '良好' : 'Good', color: 'text-green-600', icon: 'fa-arrow-up' },
      normal: { text: language === 'zh' ? '正常' : 'Normal', color: 'text-blue-600', icon: 'fa-minus' },
      low: { text: language === 'zh' ? '偏低' : 'Low', color: 'text-amber-600', icon: 'fa-arrow-down' },
    };
    return displays[status];
  };

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
              {language === 'zh' ? '最佳入睡时间' : 'Optimal Bedtime'}
            </p>
            <p className="text-xs text-gray-400">
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
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-indigo-300 mb-2"></i>
            <p className="text-sm text-gray-400">
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
              {language === 'zh'
                ? '数据不足以生成建议'
                : 'Not enough data for recommendations'}
            </p>
            <p className="text-xs text-gray-400 text-center px-4 mb-4">
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
              {language === 'zh' ? '同步 30 天历史数据' : 'Sync 30 Days History'}
            </button>
          </div>
        )}

        {/* Syncing State */}
        {isSyncing && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-indigo-400 mb-3"></i>
            <p className="text-sm text-indigo-600 font-medium">
              {language === 'zh' ? '正在同步历史数据...' : 'Syncing history data...'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
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

            {/* Analysis Factors */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
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
                        {language === 'zh' ? '心率最低点' : 'HR Nadir Time'}
                      </p>
                      <p className="text-xs text-gray-400">
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
                        {language === 'zh' ? '睡眠规律性' : 'Sleep Regularity'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {language === 'zh'
                          ? `平均 ${recommendation.factors.sleepRegularity.averageBedtime} 入睡`
                          : `Avg bedtime ${recommendation.factors.sleepRegularity.averageBedtime}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${getRegularityDisplay(recommendation.factors.sleepRegularity.rating).bg} ${getRegularityDisplay(recommendation.factors.sleepRegularity.rating).color}`}>
                      {getRegularityDisplay(recommendation.factors.sleepRegularity.rating).text}
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
                        {language === 'zh' ? '今日 HRV' : "Today's HRV"}
                      </p>
                      <p className="text-xs text-gray-400">
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
                    <i className={`fa-solid ${getHrvStatusDisplay(recommendation.factors.hrvStatus.status).icon} ${getHrvStatusDisplay(recommendation.factors.hrvStatus.status).color} text-xs`}></i>
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
                  {isLoading
                    ? (language === 'zh' ? '分析中...' : 'Analyzing...')
                    : (language === 'zh' ? '刷新分析' : 'Refresh Analysis')}
                </span>
              </button>
            </div>
          </>
        )}

        {/* Health Disclaimer */}
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
          <div className="flex items-start gap-2">
            <i className="fa-solid fa-info-circle text-amber-500 mt-0.5 text-xs"></i>
            <p className="text-xs text-amber-700">
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
