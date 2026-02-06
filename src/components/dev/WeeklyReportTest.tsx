/**
 * 每周行为报告测试组件
 *
 * 用于测试：
 * 1. 周报生成 API (weekly-behavior-analyzer)
 * 2. 周报推送 API (send-weekly-report)
 * 3. 周报详情展示（用户画像、跨数据洞察、建议等）
 *
 * 研究依据：
 * - CBT meta-analysis (2023): 认知行为疗法效果
 * - Mindfulness interventions (2025): 正念干预研究
 * - Executive function training (2024): 执行功能训练
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================================================
// 类型定义
// ============================================================================

interface UserProfile {
  persona_type: string;
  adhd_profile?: {
    primary_challenge: string;
    secondary_challenge: string;
  };
  key_traits: string[];
  strengths: string[];
  challenges: string[];
}

interface CrossDataInsight {
  pattern: string;
  evidence: string;
  data_sources: string[];
}

interface Insight {
  observation: string;
  implication: string;
}

interface Recommendation {
  action: string;
  reason: string;
  research_basis?: string;
  priority: number;
}

interface Alert {
  need_attention: boolean;
  reason: string | null;
  suggested_intervention?: string;
}

interface Summary {
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
  total_focus_minutes: number;
  total_drift_minutes: number;
  focus_ratio: number;
  routine_days: number;
  highlight: string;
}

interface WeeklyReport {
  id: string;
  user_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  summary: Summary;
  user_profile: UserProfile;
  cross_data_insights: CrossDataInsight[] | null;
  insights: Insight[];
  recommendations: Recommendation[];
  alerts: Alert;
  push_title: string;
  push_body: string;
  analyzed_at: string;
  pushed_at: string | null;
  model_used: string;
  created_at: string;
}

// ============================================================================
// 周报详情卡片组件
// ============================================================================

function ReportDetailCard({ report }: { report: WeeklyReport }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'profile', 'insights'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const { summary, user_profile, cross_data_insights, insights, recommendations, alerts } = report;

  return (
    <div className="space-y-4">
      {/* 推送预览 */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-xl p-4">
        <div className="text-white/80 text-sm mb-1">{report.push_title}</div>
        <div className="text-white font-medium">{report.push_body}</div>
      </div>

      {/* 本周摘要 */}
      <div className="bg-[#2a2a2a] rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('summary')}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="text-white font-bold">📊 本周摘要</span>
          <span className="text-gray-400">{expandedSections.has('summary') ? '−' : '+'}</span>
        </button>
        {expandedSections.has('summary') && summary && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="任务完成" value={`${summary.completed_tasks}/${summary.total_tasks}`} subValue={`${summary.completion_rate}%`} color="blue" />
              <StatCard label="专注时长" value={`${summary.total_focus_minutes}分钟`} subValue={`专注率 ${summary.focus_ratio}%`} color="green" />
              <StatCard label="习惯天数" value={`${summary.routine_days}/7天`} color="purple" />
              <StatCard label="分心时长" value={`${summary.total_drift_minutes}分钟`} color="orange" />
            </div>
            {summary.highlight && (
              <div className="mt-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                <span className="text-yellow-400 text-sm">✨ {summary.highlight}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 用户画像 */}
      <div className="bg-[#2a2a2a] rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('profile')}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="text-white font-bold">👤 用户画像</span>
          <span className="text-gray-400">{expandedSections.has('profile') ? '−' : '+'}</span>
        </button>
        {expandedSections.has('profile') && user_profile && (
          <div className="px-4 pb-4 space-y-3">
            {/* 人格类型 */}
            <div className="bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-lg p-3 text-center">
              <span className="text-2xl font-bold text-white">{user_profile.persona_type}</span>
              {user_profile.adhd_profile && (
                <div className="text-gray-400 text-xs mt-1">
                  主要挑战: {user_profile.adhd_profile.primary_challenge} | 次要: {user_profile.adhd_profile.secondary_challenge}
                </div>
              )}
            </div>

            {/* 特征标签 */}
            <div>
              <div className="text-gray-400 text-xs mb-2">关键特征</div>
              <div className="flex flex-wrap gap-2">
                {user_profile.key_traits?.map((trait, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                    {trait}
                  </span>
                ))}
              </div>
            </div>

            {/* 优势 */}
            <div>
              <div className="text-gray-400 text-xs mb-2">💪 优势</div>
              <div className="space-y-1">
                {user_profile.strengths?.map((s, i) => (
                  <div key={i} className="text-green-400 text-sm">✓ {s}</div>
                ))}
              </div>
            </div>

            {/* 挑战 */}
            <div>
              <div className="text-gray-400 text-xs mb-2">🎯 挑战</div>
              <div className="space-y-1">
                {user_profile.challenges?.map((c, i) => (
                  <div key={i} className="text-orange-400 text-sm">• {c}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 跨数据关联洞察 */}
      {cross_data_insights && cross_data_insights.length > 0 && (
        <div className="bg-[#2a2a2a] rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('cross')}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <span className="text-white font-bold">🔗 跨数据关联</span>
            <span className="text-gray-400">{expandedSections.has('cross') ? '−' : '+'}</span>
          </button>
          {expandedSections.has('cross') && (
            <div className="px-4 pb-4 space-y-3">
              {cross_data_insights.map((insight, i) => (
                <div key={i} className="bg-[#1e1e1e] rounded-lg p-3">
                  <div className="text-cyan-400 font-medium mb-1">{insight.pattern}</div>
                  <div className="text-gray-300 text-sm mb-2">{insight.evidence}</div>
                  <div className="flex flex-wrap gap-1">
                    {insight.data_sources?.map((src, j) => (
                      <span key={j} className="px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded">
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 洞察 */}
      <div className="bg-[#2a2a2a] rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('insights')}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="text-white font-bold">💡 本周洞察</span>
          <span className="text-gray-400">{expandedSections.has('insights') ? '−' : '+'}</span>
        </button>
        {expandedSections.has('insights') && insights && (
          <div className="px-4 pb-4 space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="bg-[#1e1e1e] rounded-lg p-3">
                <div className="text-white font-medium mb-1">{insight.observation}</div>
                <div className="text-gray-400 text-sm">→ {insight.implication}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 建议 */}
      <div className="bg-[#2a2a2a] rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('recommendations')}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="text-white font-bold">🎯 个性化建议</span>
          <span className="text-gray-400">{expandedSections.has('recommendations') ? '−' : '+'}</span>
        </button>
        {expandedSections.has('recommendations') && recommendations && (
          <div className="px-4 pb-4 space-y-3">
            {recommendations.map((rec, i) => (
              <div key={i} className="bg-[#1e1e1e] rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    rec.priority === 1 ? 'bg-red-500/30 text-red-300' :
                    rec.priority === 2 ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-gray-500/30 text-gray-300'
                  }`}>
                    P{rec.priority}
                  </span>
                  <div className="flex-1">
                    <div className="text-white font-medium">{rec.action}</div>
                    <div className="text-gray-400 text-sm mt-1">{rec.reason}</div>
                    {rec.research_basis && (
                      <div className="text-blue-400 text-xs mt-2 italic">
                        📚 {rec.research_basis}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预警 */}
      {alerts?.need_attention && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
          <div className="text-red-400 font-bold mb-2">⚠️ 需要关注</div>
          <div className="text-red-300 text-sm">{alerts.reason}</div>
          {alerts.suggested_intervention && (
            <div className="text-yellow-400 text-sm mt-2">
              💡 建议: {alerts.suggested_intervention}
            </div>
          )}
        </div>
      )}

      {/* 元信息 */}
      <div className="text-gray-500 text-xs text-center">
        分析时间: {new Date(report.analyzed_at).toLocaleString()} | 模型: {report.model_used}
      </div>
    </div>
  );
}

// 统计卡片子组件
function StatCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'from-blue-600/30 to-blue-800/30',
    green: 'from-green-600/30 to-green-800/30',
    purple: 'from-purple-600/30 to-purple-800/30',
    orange: 'from-orange-600/30 to-orange-800/30',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-3`}>
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className="text-white font-bold text-lg">{value}</div>
      {subValue && <div className="text-gray-400 text-xs">{subValue}</div>}
    </div>
  );
}

// ============================================================================
// 周报列表项组件
// ============================================================================

function ReportListItem({
  report,
  isSelected,
  onClick,
}: {
  report: WeeklyReport;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected
          ? 'bg-gradient-to-r from-orange-600/30 to-red-600/30 border border-orange-500/50'
          : 'bg-[#1e1e1e] hover:bg-[#2a2a2a]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-white font-medium">
          {report.period_start} ~ {report.period_end}
        </span>
        {report.pushed_at ? (
          <span className="text-green-400 text-xs">✓ 已推送</span>
        ) : (
          <span className="text-yellow-400 text-xs">待推送</span>
        )}
      </div>
      <div className="text-gray-400 text-sm truncate">
        {report.user_profile?.persona_type || '分析中...'}
      </div>
      {report.summary && (
        <div className="text-gray-500 text-xs mt-1">
          完成率: {report.summary.completion_rate}% | 专注: {report.summary.total_focus_minutes}分钟
        </div>
      )}
    </button>
  );
}

// ============================================================================
// 主测试组件
// ============================================================================

// 模拟数据用于演示模式
const DEMO_REPORT: WeeklyReport = {
  id: 'demo-001',
  user_id: 'demo-user',
  period_type: 'weekly',
  period_start: '2026-01-27',
  period_end: '2026-02-02',
  summary: {
    total_tasks: 15,
    completed_tasks: 11,
    completion_rate: 73,
    total_focus_minutes: 245,
    total_drift_minutes: 42,
    focus_ratio: 85,
    routine_days: 5,
    highlight: '睡眠充足时任务完成率提高了40%！',
  },
  user_profile: {
    persona_type: '情绪敏感型执行者',
    adhd_profile: {
      primary_challenge: 'emotional_regulation',
      secondary_challenge: 'time_management',
    },
    key_traits: ['对情绪变化敏感', '夜间效率更高', '需要外部提醒'],
    strengths: ['有意识地克服阻力', '愿意尝试新方法'],
    challenges: ['情绪波动影响执行力', '容易被手机分心'],
  },
  cross_data_insights: [
    {
      pattern: '情绪状态影响电话接听',
      evidence: '当记忆中有焦虑情绪时，电话拒接率提高60%',
      data_sources: ['user_memories.EMO', 'call_records'],
    },
    {
      pattern: '睡眠-执行力关联',
      evidence: '睡眠≥7小时后，次日任务完成率为85%；睡眠<6小时时仅为45%',
      data_sources: ['health_data.sleep', 'tasks.completion_rate'],
    },
    {
      pattern: '分解任务有效',
      evidence: '使用"5分钟法则"后，拖延任务的启动成功率从30%提升到75%',
      data_sources: ['user_memories.EFFECTIVE', 'tasks.is_skip'],
    },
  ],
  insights: [
    {
      observation: '下午3-5点是你的专注低谷期',
      implication: '可以把重要任务安排在上午或晚上',
    },
    {
      observation: '本周有3天连续完成晨间习惯',
      implication: '习惯养成正在建立，继续保持可形成自动化',
    },
  ],
  recommendations: [
    {
      action: '尝试5分钟正念呼吸练习',
      reason: '你的情绪波动影响执行力，正念可以帮助情绪调节',
      research_basis: 'Mindfulness-based interventions meta-analysis (2025) 表明正念对ADHD情绪调节有显著效果',
      priority: 1,
    },
    {
      action: '固定睡眠时间在11:30pm前',
      reason: '你的数据显示睡眠充足与任务完成率高度相关',
      research_basis: '睡眠与执行功能研究显示睡眠不足会降低前额叶皮层功能',
      priority: 1,
    },
    {
      action: '使用"2分钟法则"启动拖延任务',
      reason: '你之前使用分解任务策略效果很好',
      research_basis: 'Behavioral activation RCT (2025) 证实小步骤启动可有效减少拖延',
      priority: 2,
    },
  ],
  alerts: {
    need_attention: true,
    reason: '检测到连续3天睡眠不足6小时，可能影响下周执行力',
    suggested_intervention: '今晚尝试提前30分钟上床，明天观察状态变化',
  },
  push_title: '📊 本周回顾',
  push_body: '这周发现一个有趣的规律：睡眠充足时你的完成率提高了40%！点击看看还有什么发现～',
  analyzed_at: new Date().toISOString(),
  pushed_at: null,
  model_used: 'gemini-2.5-flash-preview-05-20',
  created_at: new Date().toISOString(),
};

export function WeeklyReportTest({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    // 默认上周一
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - daysToLastMonday - 7);
    return lastMonday.toISOString().split('T')[0];
  });

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 获取报告列表
  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    addLog('正在获取周报列表...');

    try {
      const {
        data: { user },
      } = await supabase!.auth.getUser();
      if (!user) {
        throw new Error('用户未登录');
      }

      const { data, error } = await supabase!
        .from('user_behavior_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_type', 'weekly')
        .order('period_start', { ascending: false })
        .limit(10);

      if (error) throw error;

      setReports(data || []);
      addLog(`找到 ${data?.length || 0} 份周报`);

      // 自动选择最新的
      if (data && data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      addLog(`❌ 错误: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 手动触发生成周报
  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    addLog(`正在生成周报 (${weekStart})...`);

    try {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (!session) {
        throw new Error('用户未登录');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-behavior-analyzer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: session.user.id,
            week_start: weekStart,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      addLog(`✅ 周报生成成功!`);
      addLog(`分析用户: ${result.summary?.success || 0} 成功`);

      // 刷新列表
      await fetchReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      addLog(`❌ 生成失败: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  // 测试推送
  const testPush = async () => {
    if (!selectedReport) return;

    setLoading(true);
    addLog(`正在测试推送 (${selectedReport.id})...`);

    try {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (!session) {
        throw new Error('用户未登录');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-weekly-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: session.user.id,
            week_start: selectedReport.period_start,
            force: true,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      addLog(`✅ 推送成功!`);
      addLog(`结果: ${JSON.stringify(result.summary)}`);

      // 刷新列表
      await fetchReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addLog(`❌ 推送失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-white/80 hover:text-white">
            ← 返回
          </button>
          <h1 className="text-xl font-bold text-white">📊 每周行为报告</h1>
          <button
            onClick={() => {
              setDemoMode(!demoMode);
              if (!demoMode) {
                setSelectedReport(DEMO_REPORT);
                setReports([DEMO_REPORT]);
                setError(null);
                addLog('✅ 已切换到演示模式');
              } else {
                setSelectedReport(null);
                setReports([]);
                addLog('ℹ️ 已退出演示模式');
              }
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              demoMode
                ? 'bg-yellow-400 text-black'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            {demoMode ? '演示中' : 'Demo'}
          </button>
        </div>
        <p className="text-white/70 text-sm mt-1 text-center">
          基于循证研究的个性化行为分析
          {demoMode && <span className="ml-2 text-yellow-300">(演示模式 - 无需登录)</span>}
        </p>
      </div>

      {/* 主内容 */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* 生成控制 */}
        {!demoMode && (
          <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs block mb-1">周开始日期</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-orange-400 outline-none text-sm"
                />
              </div>
              <button
                onClick={generateReport}
                disabled={generating}
                className="mt-5 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm"
              >
                {generating ? '生成中...' : '🤖 生成周报'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={fetchReports}
                disabled={loading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm"
              >
                🔄 刷新列表
              </button>
              <button
                onClick={testPush}
                disabled={loading || !selectedReport}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm"
              >
                📬 测试推送
              </button>
            </div>
          </div>
        )}

        {/* 演示模式提示 */}
        {demoMode && (
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4 mb-4">
            <div className="text-yellow-400 font-bold mb-2">🎭 演示模式</div>
            <div className="text-yellow-300/80 text-sm">
              当前显示的是模拟数据，用于预览 UI 效果。
              登录后可使用完整功能。
            </div>
            <button
              onClick={() => {
                setDemoMode(false);
                setSelectedReport(null);
                setReports([]);
              }}
              className="mt-3 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
            >
              退出演示模式
            </button>
          </div>
        )}

        {/* 报告列表 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
          <h3 className="text-white font-bold mb-3">📋 历史报告</h3>
          {reports.length === 0 ? (
            <div className="text-gray-500 text-center py-8">暂无报告，点击"生成周报"开始</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {reports.map((report) => (
                <ReportListItem
                  key={report.id}
                  report={report}
                  isSelected={selectedReport?.id === report.id}
                  onClick={() => setSelectedReport(report)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 报告详情 */}
        {selectedReport && (
          <div className="mb-4">
            <h3 className="text-white font-bold mb-3">📄 报告详情</h3>
            <ReportDetailCard report={selectedReport} />
          </div>
        )}

        {/* 错误信息 */}
        {error && !demoMode && (
          <div className="bg-red-900/30 border border-red-500 text-red-400 p-4 rounded-xl mb-4">
            ❌ {error}
          </div>
        )}

        {/* 日志 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-bold">📋 日志</h3>
            <button onClick={() => setLogs([])} className="text-gray-500 hover:text-white text-sm">
              清空
            </button>
          </div>
          <div className="bg-[#1e1e1e] rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500">暂无日志</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-gray-300 mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeeklyReportTest;
