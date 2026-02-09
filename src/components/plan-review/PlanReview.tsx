/**
 * PlanReview - 习惯计划预览组件
 *
 * @description 展示 generate-goal-plan 生成的结构化计划
 * 用户可以确认保存或选择重新聊聊
 */

interface PlanRoutine {
  name: string;
  durationMinutes: number;
  scheduledTime: string;
}

interface GeneratedGoalPlan {
  goalType: string;
  goalName: string;
  baselineTime: string;
  ultimateTargetTime: string;
  currentTargetTime: string;
  advanceDirection: 'increase' | 'decrease';
  adjustmentStep: number;
  routines: PlanRoutine[];
  summary: {
    currentLevel: string;
    firstMilestone: string;
    ultimateGoal: string;
    adjustmentExplain: string;
  };
}

interface PlanReviewProps {
  plan: GeneratedGoalPlan;
  onConfirm: () => void;
  onRetry: () => void;
  isSubmitting?: boolean;
}

/**
 * 根据目标类型返回 emoji
 */
function getGoalEmoji(goalType: string): string {
  const map: Record<string, string> = {
    sleep: '😴',
    wake: '⏰',
    exercise: '💪',
    study: '📚',
    cooking: '🍳',
    meditation: '🧘',
    reading: '📖',
    custom: '🎯',
  };
  return map[goalType] || '🎯';
}

export function PlanReview({ plan, onConfirm, onRetry, isSubmitting }: PlanReviewProps) {
  const emoji = getGoalEmoji(plan.goalType);

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white p-6 flex flex-col">
      {/* 标题 */}
      <div className="text-center mb-8 pt-4">
        <div className="text-4xl mb-2">{emoji}</div>
        <h1 className="text-2xl font-bold text-[#FFC92A]">
          {plan.goalName}
        </h1>
      </div>

      {/* 目标信息卡片 */}
      <div className="bg-[#2a2a2a] rounded-2xl p-5 mb-4">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-white/60">现在</span>
            <span className="font-medium">{plan.summary.currentLevel}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/60">第一步</span>
            <span className="font-medium text-[#FFC92A]">{plan.summary.firstMilestone}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/60">最终目标</span>
            <span className="font-medium">{plan.summary.ultimateGoal}</span>
          </div>
          <div className="border-t border-white/10 pt-3 mt-3">
            <span className="text-white/50 text-xs">{plan.summary.adjustmentExplain}</span>
          </div>
        </div>
      </div>

      {/* 时间表（如果有 routines） */}
      {plan.routines.length > 0 && (
        <div className="bg-[#2a2a2a] rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-bold text-white/80 mb-4">准备步骤</h2>
          <div className="space-y-3">
            {plan.routines.map((routine, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[#FFC92A] font-mono text-sm w-12 shrink-0">
                  {routine.scheduledTime}
                </span>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm">{routine.name}</span>
                  <span className="text-white/40 text-xs">{routine.durationMinutes}min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 弹性空间 */}
      <div className="flex-1" />

      {/* 按钮区域 */}
      <div className="space-y-3 pb-6">
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          className="w-full bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-xl py-4 font-bold text-black shadow-[0_5px_0_0_#D34A22] active:translate-y-[2px] active:shadow-[0_3px_0_0_#D34A22] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? '保存中...' : '确认计划'}
        </button>

        <button
          onClick={onRetry}
          disabled={isSubmitting}
          className="w-full border-2 border-white/20 rounded-xl py-3 text-sm text-white/70 disabled:opacity-50 transition-all"
        >
          重新聊聊
        </button>
      </div>
    </div>
  );
}

/**
 * PlanGenerating - 计划生成中的加载状态
 */
export function PlanGenerating() {
  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white flex flex-col items-center justify-center p-6">
      <div className="animate-pulse text-4xl mb-6">📋</div>
      <h2 className="text-lg font-bold text-[#FFC92A] mb-2">
        正在生成你的习惯计划...
      </h2>
      <p className="text-sm text-white/50">
        根据我们的对话，为你设计最合理的渐进式方案
      </p>
    </div>
  );
}

/**
 * PlanError - 计划生成失败状态
 */
export function PlanError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-[#1e1e1e] text-white flex flex-col items-center justify-center p-6">
      <div className="text-4xl mb-6">😅</div>
      <h2 className="text-lg font-bold mb-2">生成计划时出了点问题</h2>
      <p className="text-sm text-white/50 mb-8 text-center">{error}</p>
      <button
        onClick={onRetry}
        className="bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-xl px-8 py-3 font-bold text-black shadow-[0_5px_0_0_#D34A22] active:translate-y-[2px] active:shadow-[0_3px_0_0_#D34A22]"
      >
        重新聊聊
      </button>
    </div>
  );
}
