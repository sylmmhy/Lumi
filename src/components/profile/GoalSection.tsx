import { useState, useEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { AuthContext } from '../../context/AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import { SecondaryPageHeader } from '../common/SecondaryPageHeader';

/** 目标数据结构（对应 goals 表） */
interface Goal {
  id: string;
  goal_type: string;
  name: string;
  ultimate_target_time: string | null;
  current_target_time: string | null;
  baseline_time: string | null;
  advance_direction: string | null; // 'increase' | 'decrease'
  target_duration_minutes: number | null;
  consecutive_success: number;
  consecutive_failure: number;
  frequency_type: string;
  frequency_days: number[] | null;
  is_active: boolean;
  created_at: string;
}

/** 目标关联的习惯任务（对应 goal_routines 表） */
interface GoalRoutine {
  id: string;
  goal_id: string;
  name: string;
  duration_minutes: number | null;
  order_index: number;
  is_cutoff: boolean;
  is_flexible: boolean;
  is_active: boolean;
}

/** goal_type → 图标/颜色映射 */
const GOAL_TYPE_CONFIG: Record<string, { icon: string; bgColor: string; textColor: string; labelZh: string; label: string }> = {
  sleep: { icon: 'fa-moon', bgColor: 'bg-indigo-50', textColor: 'text-indigo-500', labelZh: '睡眠', label: 'Sleep' },
  wake: { icon: 'fa-sun', bgColor: 'bg-amber-50', textColor: 'text-amber-500', labelZh: '起床', label: 'Wake' },
  exercise: { icon: 'fa-dumbbell', bgColor: 'bg-green-50', textColor: 'text-green-500', labelZh: '运动', label: 'Exercise' },
  study: { icon: 'fa-book', bgColor: 'bg-blue-50', textColor: 'text-blue-500', labelZh: '学习', label: 'Study' },
  cooking: { icon: 'fa-utensils', bgColor: 'bg-rose-50', textColor: 'text-rose-500', labelZh: '做饭', label: 'Cooking' },
  meditation: { icon: 'fa-spa', bgColor: 'bg-teal-50', textColor: 'text-teal-500', labelZh: '冥想', label: 'Meditation' },
  reading: { icon: 'fa-book-open', bgColor: 'bg-cyan-50', textColor: 'text-cyan-500', labelZh: '阅读', label: 'Reading' },
  custom: { icon: 'fa-star', bgColor: 'bg-purple-50', textColor: 'text-purple-500', labelZh: '自定义', label: 'Custom' },
};

/** 默认配置（未知类型时使用） */
const DEFAULT_TYPE_CONFIG = { icon: 'fa-bullseye', bgColor: 'bg-gray-50', textColor: 'text-gray-500', labelZh: '目标', label: 'Goal' };

/**
 * 格式化时间字符串（HH:MM:SS → HH:MM）
 */
function formatTime(time: string | null): string {
  if (!time) return '--:--';
  return time.slice(0, 5);
}

/** 判断目标是否为时刻型（sleep/wake） */
function isClockType(goalType: string): boolean {
  return goalType === 'sleep' || goalType === 'wake';
}

/**
 * 将 HH:mm 时间编码转为人类可读的时长/频率文本
 * 时长型："00:10" → "10分钟" / "10 min"
 * 频率型："00:03" → "3次/周" / "3x/week"
 */
function formatDurationOrFrequency(time: string | null, goalType: string, isZh: boolean): string {
  if (!time) return '--';
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m;

  // 频率型目标：次数编码在分钟位
  if (goalType === 'cooking' || goalType === 'meditation') {
    return isZh ? `${totalMinutes}次/周` : `${totalMinutes}x/week`;
  }

  // 时长型目标
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) return isZh ? `${hours}小时` : `${hours}h`;
    return isZh ? `${hours}小时${mins}分钟` : `${hours}h ${mins}min`;
  }
  return isZh ? `${totalMinutes}分钟` : `${totalMinutes} min`;
}

/**
 * 计算从 baseline → ultimate 的进度百分比
 * current_target 越接近 ultimate，进度越高
 */
function calcProgress(baseline: string | null, current: string | null, ultimate: string | null): number {
  if (!baseline || !current || !ultimate) return 0;

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const base = toMinutes(baseline);
  const curr = toMinutes(current);
  const ult = toMinutes(ultimate);

  const totalRange = Math.abs(base - ult);
  if (totalRange === 0) return 100;

  const progress = Math.abs(base - curr);
  return Math.min(100, Math.round((progress / totalRange) * 100));
}

/**
 * GoalSection - 在 Profile 页面展示用户目标
 * 点击后打开全屏二级页面，展示目标详情和关联的 routines
 */
export function GoalSection() {
  const { uiLanguage } = useTranslation();
  const auth = useContext(AuthContext);
  const [showGoalsPage, setShowGoalsPage] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [routinesByGoal, setRoutinesByGoal] = useState<Record<string, GoalRoutine[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const isZh = uiLanguage?.startsWith('zh');

  /** 获取用户的活跃目标和关联 routines */
  const fetchGoals = useCallback(async () => {
    if (!auth?.userId || !supabase) return;

    setIsLoading(true);
    try {
      // 获取活跃目标
      const { data: goalsData, error: goalsError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', auth.userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (goalsError) throw goalsError;
      setGoals(goalsData || []);

      // 获取关联的 routines
      if (goalsData && goalsData.length > 0) {
        const goalIds = goalsData.map((g: Goal) => g.id);
        const { data: routinesData, error: routinesError } = await supabase
          .from('goal_routines')
          .select('*')
          .in('goal_id', goalIds)
          .eq('is_active', true)
          .order('order_index', { ascending: true });

        if (routinesError) throw routinesError;

        // 按 goal_id 分组
        const grouped = (routinesData || []).reduce((acc: Record<string, GoalRoutine[]>, r: GoalRoutine) => {
          if (!acc[r.goal_id]) acc[r.goal_id] = [];
          acc[r.goal_id].push(r);
          return acc;
        }, {} as Record<string, GoalRoutine[]>);
        setRoutinesByGoal(grouped);
      } else {
        setRoutinesByGoal({});
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [auth?.userId]);

  // 组件挂载时加载目标
  useEffect(() => {
    if (goals.length === 0) {
      fetchGoals();
    }
  }, [fetchGoals, goals.length]);

  // 打开全屏页面时刷新数据
  useEffect(() => {
    if (showGoalsPage) {
      fetchGoals();
    }
  }, [showGoalsPage, fetchGoals]);

  if (!auth?.isLoggedIn) {
    return null;
  }

  return (
    <>
      {/* Entry Row in Profile */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <button
          onClick={() => setShowGoalsPage(true)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-bullseye text-orange-500"></i>
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-800">
                {isZh ? '我的目标' : 'My Goals'}
              </p>
              <p className="text-xs text-gray-400">
                {isZh ? '查看和追踪你的目标进度' : 'View and track your goal progress'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
            ) : (
              <span className="text-sm text-gray-500">
                {goals.length > 0 ? (
                  isZh ? `${goals.length} 个活跃目标` : `${goals.length} active`
                ) : (
                  isZh ? '暂无目标' : 'No goals'
                )}
              </span>
            )}
            <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
          </div>
        </button>
      </div>

      {/* Full-screen Goals Page - Portal 模式渲染到 body */}
      {showGoalsPage && createPortal(
        <div className="fixed inset-0 bg-gray-50 z-[9999] flex flex-col">
          <SecondaryPageHeader
            title={isZh ? '我的目标' : 'My Goals'}
            onBack={() => setShowGoalsPage(false)}
          />

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <i className="fa-solid fa-spinner fa-spin text-gray-400 text-2xl"></i>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && goals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                  <i className="fa-solid fa-bullseye text-orange-300 text-2xl"></i>
                </div>
                <p className="text-gray-500 text-center leading-relaxed">
                  {isZh
                    ? '你还没有设定目标。\n和 Lumi 聊聊你想养成的习惯吧！'
                    : "You haven't set any goals yet.\nTell Lumi about the habits you want to build!"}
                </p>
              </div>
            )}

            {/* Goal Cards */}
            {!isLoading && goals.length > 0 && (
              <div className="space-y-4">
                {goals.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    routines={routinesByGoal[goal.id] || []}
                    isZh={isZh}
                  />
                ))}

                {/* Info Footer */}
                <div className="px-4 py-3 bg-white rounded-2xl shadow-sm">
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-circle-info text-gray-400 mt-0.5 text-sm"></i>
                    <p className="text-sm text-gray-500">
                      {isZh
                        ? 'Lumi 会根据你的完成情况自动调整目标，帮助你循序渐进地养成好习惯。'
                        : 'Lumi automatically adjusts your goals based on your progress to help you build habits gradually.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * 单个目标卡片组件
 */
function GoalCard({ goal, routines, isZh }: { goal: Goal; routines: GoalRoutine[]; isZh: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = GOAL_TYPE_CONFIG[goal.goal_type] || DEFAULT_TYPE_CONFIG;
  const progress = calcProgress(goal.baseline_time, goal.current_target_time, goal.ultimate_target_time);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 ${config.bgColor} rounded-full flex items-center justify-center`}>
            <i className={`fa-solid ${config.icon} ${config.textColor} text-sm`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{goal.name}</p>
            <p className="text-xs text-gray-400">
              {isZh ? config.labelZh : config.label}
              {goal.frequency_type === 'daily' && (isZh ? ' · 每天' : ' · Daily')}
              {goal.frequency_type === 'weekdays' && (isZh ? ' · 工作日' : ' · Weekdays')}
              {goal.frequency_type === 'weekends' && (isZh ? ' · 周末' : ' · Weekends')}
            </p>
          </div>
        </div>

        {/* Time Progress（仅当有目标时间时显示） */}
        {goal.current_target_time && goal.ultimate_target_time && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              {isClockType(goal.goal_type) ? (
                <>
                  <span>{isZh ? '当前目标' : 'Current'}: {formatTime(goal.current_target_time)}</span>
                  <span>{isZh ? '最终目标' : 'Target'}: {formatTime(goal.ultimate_target_time)}</span>
                </>
              ) : (
                <>
                  <span>{isZh ? '当前目标' : 'Current'}: {formatDurationOrFrequency(goal.current_target_time, goal.goal_type, isZh)}</span>
                  <span>{isZh ? '最终目标' : 'Target'}: {formatDurationOrFrequency(goal.ultimate_target_time, goal.goal_type, isZh)}</span>
                </>
              )}
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${config.textColor.replace('text-', 'bg-')}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {goal.baseline_time && (
              <p className="text-xs text-gray-400 mt-1">
                {isZh ? '基线' : 'Baseline'}: {isClockType(goal.goal_type) ? formatTime(goal.baseline_time) : formatDurationOrFrequency(goal.baseline_time, goal.goal_type, isZh)}
              </p>
            )}
          </div>
        )}

        {/* Duration（仅当有目标时长时显示，且没有渐进式目标时间） */}
        {goal.target_duration_minutes && !goal.current_target_time && (
          <div className="mb-3">
            <p className="text-sm text-gray-600">
              <i className="fa-solid fa-clock text-gray-400 mr-1.5"></i>
              {isZh ? `目标时长：${goal.target_duration_minutes} 分钟` : `Target: ${goal.target_duration_minutes} min`}
            </p>
          </div>
        )}

        {/* Streak Info */}
        <div className="flex items-center gap-3">
          {goal.consecutive_success > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <i className="fa-solid fa-fire text-green-500"></i>
              {isZh ? `连续 ${goal.consecutive_success} 天成功` : `${goal.consecutive_success} day streak`}
            </span>
          )}
          {goal.consecutive_failure > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
              <i className="fa-solid fa-arrow-trend-down text-red-500"></i>
              {isZh ? `连续 ${goal.consecutive_failure} 天未完成` : `${goal.consecutive_failure} days missed`}
            </span>
          )}
          {goal.consecutive_success === 0 && goal.consecutive_failure === 0 && (
            <span className="text-xs text-gray-400">
              {isZh ? '刚开始，加油！' : 'Just started, keep going!'}
            </span>
          )}
        </div>
      </div>

      {/* Routines Section（可展开） */}
      {routines.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs text-gray-500">
              <i className="fa-solid fa-list-check text-gray-400 mr-1.5"></i>
              {isZh ? `${routines.length} 个步骤` : `${routines.length} routines`}
            </span>
            <i className={`fa-solid fa-chevron-down text-gray-300 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}></i>
          </button>

          {expanded && (
            <div className="border-t border-gray-100">
              {routines.map((routine, index) => (
                <div
                  key={routine.id}
                  className={`px-4 py-2.5 flex items-center gap-3 ${index < routines.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs text-gray-400 flex-none">
                    {routine.order_index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${routine.is_cutoff ? 'text-orange-600 font-medium' : 'text-gray-700'} truncate`}>
                      {routine.name}
                      {routine.is_cutoff && (
                        <i className="fa-solid fa-hand ml-1.5 text-orange-400 text-xs"></i>
                      )}
                    </p>
                  </div>
                  {routine.duration_minutes && (
                    <span className="text-xs text-gray-400 flex-none">
                      {routine.duration_minutes}{isZh ? '分钟' : 'min'}
                      {routine.is_flexible && ' ~'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
