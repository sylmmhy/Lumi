/**
 * 后端 API 测试组件
 * 
 * 用于测试：
 * 1. 习惯叠加 (Habit Stacking) API
 * 2. AI 每日报告生成 API
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================================================
// 类型定义
// ============================================================================

interface AnchorHabit {
  task_id: string;
  title: string;
  completion_rate: number;
  anchor_score: number;
  avg_completion_time: string | null;
}

interface HabitStackSuggestion {
  anchor_task_id: string;
  anchor_title: string;
  position: 'before' | 'after';
  confidence: number;
  reasoning: string;
  reminder_text: string;
}

interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  ai_summary: string;
  goals_data: unknown;
  created_at: string;
}

// ============================================================================
// 习惯叠加测试组件
// ============================================================================

export function HabitStackingTest({ onBack }: { onBack: () => void }) {
  const [newHabit, setNewHabit] = useState('吃维生素');
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [anchors, setAnchors] = useState<AnchorHabit[]>([]);
  const [suggestions, setSuggestions] = useState<HabitStackSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 获取锚点习惯
  const fetchAnchors = async () => {
    setLoading(true);
    setError(null);
    addLog('正在获取锚点习惯...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('用户未登录');
      }

      addLog(`用户 ID: ${user.id.substring(0, 8)}...`);

      const { data, error } = await supabase.rpc('get_anchor_habits', {
        p_user_id: user.id
      });

      if (error) throw error;

      setAnchors(data || []);
      addLog(`找到 ${data?.length || 0} 个锚点习惯`);

      if (data && data.length > 0) {
        data.forEach((a: AnchorHabit) => {
          addLog(`  - ${a.title} (完成率: ${Math.round(a.completion_rate * 100)}%, 评分: ${a.anchor_score.toFixed(2)})`);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      addLog(`❌ 错误: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 获取习惯挂载建议
  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    addLog(`正在为「${newHabit}」获取挂载建议...`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('用户未登录');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-habit-stack`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            new_habit: newHabit,
            duration_minutes: duration,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }

      setAnchors(result.anchors || []);
      setSuggestions(result.suggestions || []);
      addLog(`✅ ${result.message}`);
      addLog(`找到 ${result.suggestions?.length || 0} 个建议`);

      if (result.suggestions) {
        result.suggestions.forEach((s: HabitStackSuggestion, i: number) => {
          addLog(`  ${i + 1}. 挂载在「${s.anchor_title}」${s.position === 'after' ? '之后' : '之前'}`);
          addLog(`     置信度: ${(s.confidence * 100).toFixed(0)}%`);
          addLog(`     理由: ${s.reasoning}`);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      addLog(`❌ 错误: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 检查兼容性
  const checkCompatibility = async (anchorTaskId: string) => {
    addLog(`检查「${newHabit}」与锚点的兼容性...`);

    try {
      const { data, error } = await supabase.rpc('check_habit_stack_compatibility', {
        p_anchor_task_id: anchorTaskId,
        p_new_habit_keyword: newHabit,
        p_new_habit_duration_minutes: duration,
      });

      if (error) throw error;

      addLog(`兼容性检查结果:`);
      addLog(`  - 总分: ${(data.score * 100).toFixed(0)}%`);
      addLog(`  - 时间兼容: ${data.time_compatible ? '✅' : '❌'}`);
      addLog(`  - 场景兼容: ${data.context_compatible ? '✅' : '❌'}`);
      addLog(`  - 规则兼容: ${data.rule_compatible ? '✅' : '❌'}`);
      addLog(`  - 建议: ${data.suggestion}`);
      
      if (data.warnings && data.warnings.length > 0) {
        addLog(`  ⚠️ 警告:`);
        data.warnings.forEach((w: string) => addLog(`    - ${w}`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addLog(`❌ 兼容性检查失败: ${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-yellow-400 mb-6">🔗 习惯叠加测试</h2>

        {/* 输入区域 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-2">新习惯名称</label>
            <input
              type="text"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              className="w-full bg-[#1e1e1e] text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-yellow-400 outline-none"
              placeholder="输入新习惯名称"
            />
          </div>
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-2">预计时长（分钟）</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-[#1e1e1e] text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-yellow-400 outline-none"
              min={1}
              max={60}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchAnchors}
              disabled={loading}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              {loading ? '加载中...' : '📍 获取锚点习惯'}
            </button>
            <button
              onClick={fetchSuggestions}
              disabled={loading || !newHabit}
              className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              {loading ? '加载中...' : '🤖 AI 推荐挂载'}
            </button>
          </div>
        </div>

        {/* 锚点习惯列表 */}
        {anchors.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
            <h3 className="text-white font-bold mb-3">📍 锚点习惯</h3>
            <div className="space-y-2">
              {anchors.map((anchor) => (
                <div
                  key={anchor.task_id}
                  className="bg-[#1e1e1e] p-3 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="text-white font-medium">{anchor.title}</div>
                    <div className="text-gray-500 text-sm">
                      完成率: {Math.round(anchor.completion_rate * 100)}% | 
                      评分: {anchor.anchor_score?.toFixed(2) || 'N/A'} |
                      时间: {anchor.avg_completion_time || '未知'}
                    </div>
                  </div>
                  <button
                    onClick={() => checkCompatibility(anchor.task_id)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
                  >
                    检查兼容性
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI 推荐结果 */}
        {suggestions.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
            <h3 className="text-white font-bold mb-3">🤖 AI 推荐</h3>
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={i} className="bg-[#1e1e1e] p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{s.position === 'after' ? '➡️' : '⬅️'}</span>
                    <span className="text-white font-medium">
                      「{s.anchor_title}」{s.position === 'after' ? '之后' : '之前'}
                    </span>
                    <span className="ml-auto bg-green-600 text-white px-2 py-1 rounded text-sm">
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{s.reasoning}</p>
                  <p className="text-yellow-400 text-sm">💬 {s.reminder_text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-400 p-4 rounded-xl mb-4">
            ❌ {error}
          </div>
        )}

        {/* 日志区域 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-bold">📋 日志</h3>
            <button
              onClick={() => setLogs([])}
              className="text-gray-500 hover:text-white text-sm"
            >
              清空
            </button>
          </div>
          <div className="bg-[#1e1e1e] rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500">暂无日志</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-gray-300 mb-1">{log}</div>
              ))
            )}
          </div>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="w-full py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl"
        >
          ← 返回菜单
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// AI 每日报告测试组件
// ============================================================================

export function DailyReportTest({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 手动触发报告生成
  const triggerReport = async (force = false) => {
    setLoading(true);
    setError(null);
    addLog(`正在${force ? '强制' : ''}生成报告...`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('用户未登录');
      }

      addLog(`用户 ID: ${session.user.id.substring(0, 8)}...`);
      addLog(`目标日期: ${selectedDate}`);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: session.user.id,
            date: selectedDate,
            force: force,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      addLog(`✅ 报告生成成功`);
      addLog(`报告 ID: ${result.report?.id || 'N/A'}`);
      
      if (result.report?.ai_summary) {
        addLog(`AI 摘要预览: ${result.report.ai_summary.substring(0, 100)}...`);
      }

      // 刷新报告列表
      await fetchReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
      addLog(`❌ 错误: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 获取历史报告
  const fetchReports = async () => {
    setLoading(true);
    addLog('正在获取历史报告...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('用户未登录');
      }

      const { data, error } = await supabase
        .from('daily_goal_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('report_date', { ascending: false })
        .limit(10);

      if (error) throw error;

      setReports(data || []);
      addLog(`找到 ${data?.length || 0} 条报告`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addLog(`❌ 获取报告失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 查看用户的 Goals 数据
  const fetchGoalsData = async () => {
    addLog('正在获取目标数据...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('用户未登录');
      }

      // 获取目标
      const { data: goals, error: goalsError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (goalsError) throw goalsError;

      addLog(`找到 ${goals?.length || 0} 个活跃目标:`);
      goals?.forEach(g => {
        addLog(`  - ${g.name} (${g.goal_type})`);
        addLog(`    当前目标: ${g.current_target_time || 'N/A'}`);
        addLog(`    连续成功: ${g.consecutive_success} 天`);
      });

      // 获取今天的 entries
      const today = new Date().toISOString().split('T')[0];
      const { data: entries, error: entriesError } = await supabase
        .from('goal_entries')
        .select('*, goals(name)')
        .eq('user_id', user.id)
        .eq('entry_date', today);

      if (entriesError) throw entriesError;

      addLog(`今天的记录 (${entries?.length || 0} 条):`);
      entries?.forEach(e => {
        addLog(`  - ${e.goals?.name}: ${e.status} @ ${e.actual_time || 'N/A'}`);
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addLog(`❌ 错误: ${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-yellow-400 mb-6">📊 AI 每日报告测试</h2>

        {/* 控制区域 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-2">报告日期</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-[#1e1e1e] text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-yellow-400 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => triggerReport(false)}
              disabled={loading}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              {loading ? '生成中...' : '📝 生成报告'}
            </button>
            <button
              onClick={() => triggerReport(true)}
              disabled={loading}
              className="py-2 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              {loading ? '生成中...' : '🔄 强制重新生成'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={fetchReports}
              disabled={loading}
              className="py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              📋 获取历史报告
            </button>
            <button
              onClick={fetchGoalsData}
              disabled={loading}
              className="py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-lg"
            >
              🎯 查看目标数据
            </button>
          </div>
        </div>

        {/* 报告列表 */}
        {reports.length > 0 && (
          <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
            <h3 className="text-white font-bold mb-3">📋 历史报告</h3>
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="bg-[#1e1e1e] p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{report.report_date}</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">
                    {report.ai_summary || '(无摘要)'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-400 p-4 rounded-xl mb-4">
            ❌ {error}
          </div>
        )}

        {/* 日志区域 */}
        <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-bold">📋 日志</h3>
            <button
              onClick={() => setLogs([])}
              className="text-gray-500 hover:text-white text-sm"
            >
              清空
            </button>
          </div>
          <div className="bg-[#1e1e1e] rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500">暂无日志</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-gray-300 mb-1">{log}</div>
              ))
            )}
          </div>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="w-full py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl"
        >
          ← 返回菜单
        </button>
      </div>
    </div>
  );
}
