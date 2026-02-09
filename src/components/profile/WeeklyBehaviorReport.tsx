import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContextDefinition';
import { useWeeklyBehaviorReport } from '../../hooks/useWeeklyBehaviorReport';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * 周行为分析报告组件
 * 展示 AI 生成的用户画像、洞察、建议和预警
 */
export const WeeklyBehaviorReport: React.FC = () => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const { report, loading } = useWeeklyBehaviorReport(auth?.userId || null);

  // 未登录不显示
  if (!auth?.userId) {
    return null;
  }

  // 加载中状态
  if (loading) {
    return (
      <div className="mb-4">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-4 border border-purple-100/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-spinner fa-spin text-white"></i>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                {t('weeklyReport.title') || '本周行为分析'}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                加载中...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 空状态 - 没有报告数据
  if (!report) {
    return (
      <div className="mb-4">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200/50">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center mb-3">
              <span className="text-3xl">🧠</span>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm mb-2">
              {t('weeklyReport.title') || '本周行为分析'}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              暂无周报数据。继续使用 Lumi，下周就能看到你的行为分析啦！
            </p>
            <div className="text-xs text-gray-500 bg-white/60 rounded-lg px-3 py-2">
              💡 周报每周一自动生成，基于你的任务、专注、习惯等数据
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summary = report.summary || {};
  const profile = report.user_profile || {};
  const insights = report.insights || [];
  const recommendations = report.recommendations || [];

  // alerts 可能是对象（旧格式）或数组（新格式），统一处理为数组
  const alertsData = report.alerts;
  const alerts = Array.isArray(alertsData)
    ? alertsData
    : (alertsData && typeof alertsData === 'object' && 'need_attention' in alertsData)
      ? [alertsData as { need_attention: boolean; reason: string; suggested_intervention?: string }]
      : [];

  // 计算完成率百分比
  const completionRate = summary.completion_rate
    ? Math.round(summary.completion_rate * 100)
    : 0;

  return (
    <div className="mb-4">
      {/* 🧠 周报头 - 用户画像 + 本周摘要 */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-4 border border-purple-100/50">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center flex-shrink-0 text-white text-lg">
            🧠
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">
              {t('weeklyReport.title') || '本周行为分析'}
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              {report.period_start} 至 {report.period_end}
            </p>
          </div>
        </div>

        {/* 用户画像标签 */}
        {profile.persona_type && (
          <div className="mb-3 pb-3 border-b border-purple-200/50">
            <p className="text-xs font-medium text-gray-700 mb-2">
              {t('weeklyReport.persona') || '你的用户画像'}
            </p>
            <div className="inline-block bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-medium">
              {profile.persona_type}
            </div>
          </div>
        )}

        {/* 本周摘要统计 */}
        <div className="grid grid-cols-2 gap-2">
          {summary.completion_rate !== undefined && (
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-xs text-gray-600">
                {t('weeklyReport.completionRate') || '完成率'}
              </p>
              <p className="text-lg font-bold text-purple-600">
                {completionRate}%
              </p>
            </div>
          )}

          {summary.focus_duration_minutes !== undefined && (
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-xs text-gray-600">
                {t('weeklyReport.focusTime') || '专注时长'}
              </p>
              <p className="text-lg font-bold text-blue-600">
                {Math.round(summary.focus_duration_minutes / 60)}h
              </p>
            </div>
          )}

          {summary.habit_streak_days !== undefined && (
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-xs text-gray-600">
                {t('weeklyReport.habitStreak') || '习惯连续'}
              </p>
              <p className="text-lg font-bold text-green-600">
                {summary.habit_streak_days} {t('weeklyReport.days') || '天'}
              </p>
            </div>
          )}

          {summary.tasks_completed !== undefined && (
            <div className="bg-white/60 rounded-lg p-2.5">
              <p className="text-xs text-gray-600">
                {t('weeklyReport.tasksCompleted') || '完成任务'}
              </p>
              <p className="text-lg font-bold text-orange-600">
                {summary.tasks_completed}/{summary.tasks_total}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 💡 关键洞察 */}
      {insights.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-100/50 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💡</span>
            <h4 className="font-semibold text-gray-900 text-sm">
              {t('weeklyReport.insights') || '本周发现'}
            </h4>
          </div>
          <div className="space-y-2.5">
            {insights.slice(0, 3).map((insight, idx) => (
              <div key={idx} className="bg-white/60 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-800 mb-1">
                  📍 {insight.observation}
                </p>
                <p className="text-xs text-gray-600">
                  {insight.implication}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🎯 个性化建议 */}
      {recommendations.length > 0 && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100/50 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎯</span>
            <h4 className="font-semibold text-gray-900 text-sm">
              {t('weeklyReport.recommendations') || '建议行动'}
            </h4>
          </div>
          <div className="space-y-2.5">
            {recommendations.slice(0, 3).map((rec, idx) => (
              <div key={idx} className="bg-white/60 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0 mt-0.5">✅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 mb-1">
                      {rec.action}
                    </p>
                    <p className="text-xs text-gray-600">
                      {rec.reason}
                    </p>
                    {rec.priority === 'high' && (
                      <span className="inline-block mt-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded font-medium">
                        {t('weeklyReport.highPriority') || '高优先级'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ⚠️ 预警信息 */}
      {alerts.some((a) => a.need_attention) && (
        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-4 border border-red-100/50 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h4 className="font-semibold text-gray-900 text-sm">
              {t('weeklyReport.alerts') || '需要关注'}
            </h4>
          </div>
          <div className="space-y-2">
            {alerts
              .filter((a) => a.need_attention)
              .map((alert, idx) => (
                <div key={idx} className="bg-white/60 rounded-lg p-3">
                  <p className="text-xs text-gray-700">
                    {alert.reason}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 查看完整报告按钮 */}
      <button className="w-full mt-4 py-2.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors active:scale-95">
        {t('weeklyReport.viewFull') || '查看完整报告'}
      </button>
    </div>
  );
};
