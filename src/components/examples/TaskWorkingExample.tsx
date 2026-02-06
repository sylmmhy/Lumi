/**
 * TaskWorkingView 和 CelebrationView 使用示例
 * 
 * 这个文件展示了如何在不同场景中使用这些可复用组件
 */

import { useState, useCallback } from 'react';
import { TaskWorkingView } from '../task/TaskWorkingView';
import { CelebrationView } from '../celebration/CelebrationView';
import type { CelebrationFlow } from '../celebration/CelebrationView';
import { useAICoachSession } from '../../hooks/useAICoachSession';
import { useCelebrationAnimation } from '../../hooks/useCelebrationAnimation';

// ============================================
// 示例 1: 完整的 AI 教练任务流程
// ============================================

/**
 * 完整的 AI 教练任务执行示例
 * 包含：连接 AI → 执行任务 → 庆祝
 */
export function AICoachTaskExample() {
  const [step, setStep] = useState<'idle' | 'working' | 'celebration'>('idle');
  const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('success');

  // 使用 AI 教练会话 hook
  const aiCoach = useAICoachSession({
    initialTime: 300, // 5 分钟
    onCountdownComplete: () => {
      // 倒计时结束，进入庆祝页面
      // 立即停止音频播放，让 AI 马上静音
      aiCoach.stopAudioImmediately();
      aiCoach.endSession();
      setStep('celebration');
    },
  });

  // 庆祝动画
  const celebrationAnimation = useCelebrationAnimation({
    enabled: step === 'celebration' && celebrationFlow === 'success',
    remainingTime: aiCoach.state.timeRemaining,
  });

  // 开始任务
  const handleStartTask = useCallback(async () => {
    try {
      const started = await aiCoach.startSession('Get out of bed');
      if (!started) return;
      setStep('working');
    } catch {
      alert('连接失败，请重试');
    }
  }, [aiCoach]);

  // 完成任务
  const handleComplete = useCallback(() => {
    // 立即停止音频播放，让 AI 马上静音
    aiCoach.stopAudioImmediately();
    aiCoach.endSession();
    setCelebrationFlow('success');
    setStep('celebration');
  }, [aiCoach]);

  // 重新开始
  const handleRestart = useCallback(() => {
    aiCoach.resetSession();
    setStep('idle');
  }, [aiCoach]);

  // 渲染
  if (step === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">AI 教练任务示例</h1>
        <button
          onClick={handleStartTask}
          className="px-6 py-3 bg-yellow-500 text-black font-bold rounded-lg"
        >
          开始任务
        </button>
      </div>
    );
  }

  if (step === 'working') {
    return (
      <TaskWorkingView
        taskDescription={aiCoach.state.taskDescription}
        time={aiCoach.state.timeRemaining}
        timeMode="countdown"
        camera={{
          enabled: aiCoach.cameraEnabled,
          videoRef: aiCoach.videoRef,
        }}
        aiStatus={{
          isConnected: aiCoach.isConnected,
          error: aiCoach.error,
          waveformHeights: aiCoach.waveformHeights,
        }}
        onToggleCamera={aiCoach.toggleCamera}
        primaryButton={{
          label: "I'M DOING IT!",
          emoji: '✅',
          onClick: handleComplete,
        }}
        secondaryButton={{
          label: 'RESTART',
          emoji: '❌',
          onClick: handleRestart,
        }}
      />
    );
  }

  // 庆祝页面
  return (
    <CelebrationView
      flow={celebrationFlow}
      onFlowChange={setCelebrationFlow}
      success={{
        scene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        completionTime: 300 - aiCoach.state.timeRemaining,
        taskDescription: aiCoach.state.taskDescription,
        ctaButton: {
          label: 'TAKE MORE CHALLENGE',
          onClick: handleRestart,
        },
      }}
      failure={{
        button: {
          label: 'TRY AGAIN',
          onClick: handleRestart,
        },
      }}
      confirm={{
        yesButton: {
          label: '✅ YES, I STARTED!!',
          onClick: () => setCelebrationFlow('success'),
        },
        noButton: {
          label: "✕ NO I DIDN'T",
          onClick: () => setCelebrationFlow('failure'),
        },
      }}
    />
  );
}

// ============================================
// 示例 2: 简单的任务计时器（无 AI）
// ============================================

/**
 * 简单的任务计时器示例
 * 不使用 AI，只有计时功能
 */
export function SimpleTimerExample() {
  const [time] = useState(300);
  const [, setIsRunning] = useState(false);

  // 这里可以使用 useTaskTimer hook
  // 为了简化示例，使用简单的状态管理

  return (
    <TaskWorkingView
      taskDescription="完成今天的作业"
      time={time}
      timeMode="countdown"
      // 不传 camera 参数 = 不显示摄像头
      // 不传 aiStatus 参数 = 不显示 AI 相关 UI
      primaryButton={{
        label: 'COMPLETED',
        emoji: '✅',
        onClick: () => {
          setIsRunning(false);
          alert('任务完成！');
        },
      }}
      secondaryButton={{
        label: 'GIVE UP',
        onClick: () => {
          setIsRunning(false);
          alert('下次加油！');
        },
      }}
    />
  );
}

// ============================================
// 示例 3: 打卡日期直接庆祝（无任务执行）
// ============================================

/**
 * 打卡日期庆祝示例
 * 用户点击打卡后直接显示庆祝页面
 */
export function CheckInCelebrationExample() {
  const [showCelebration, setShowCelebration] = useState(false);

  // 使用固定金币数量的庆祝动画
  const celebrationAnimation = useCelebrationAnimation({
    enabled: showCelebration,
    remainingTime: 0,
    customCoins: 100, // 打卡固定获得 100 金币
  });

  if (!showCelebration) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-gray-900">
        <h1 className="text-2xl font-bold text-white">今日打卡</h1>
        <p className="text-gray-400">2024 年 1 月 15 日</p>
        <button
          onClick={() => setShowCelebration(true)}
          className="px-6 py-3 bg-yellow-500 text-black font-bold rounded-lg"
        >
          打卡
        </button>
      </div>
    );
  }

  return (
    <CelebrationView
      flow="success"
      success={{
        scene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        completionTime: 0, // 打卡不需要显示时间
        taskDescription: '今日打卡',
        levelText: 'DAY 15', // 自定义等级文字
        ctaButton: {
          label: 'CONTINUE',
          onClick: () => setShowCelebration(false),
        },
      }}
    />
  );
}

// ============================================
// 示例 4: 自定义样式的庆祝页面
// ============================================

/**
 * 失败后的鼓励页面示例
 */
export function FailureEncouragementExample() {
  return (
    <CelebrationView
      flow="failure"
      failure={{
        title: 'Almost There!',
        subtitle: 'Keep Going!',
        button: {
          label: 'TRY AGAIN',
          onClick: () => {
            // 重新开始逻辑
          },
        },
      }}
    />
  );
}

// ============================================
// 示例 5: 确认页面示例
// ============================================

/**
 * 任务完成确认页面示例
 */
export function ConfirmationExample() {
  const [flow, setFlow] = useState<CelebrationFlow>('confirm');

  return (
    <CelebrationView
      flow={flow}
      onFlowChange={setFlow}
      confirm={{
        title: '时间到！',
        subtitle: '你完成任务了吗？',
        yesButton: {
          label: '✅ 是的，我完成了！',
          onClick: () => setFlow('success'),
        },
        noButton: {
          label: '✕ 还没有',
          onClick: () => setFlow('failure'),
        },
      }}
      success={{
        scene: 4,
        coins: 200,
        progressPercent: 80,
        showConfetti: false,
        completionTime: 300,
        taskDescription: '完成作业',
        ctaButton: {
          label: '继续',
          onClick: () => { },
        },
      }}
      failure={{
        button: {
          label: '再试一次',
          onClick: () => setFlow('confirm'),
        },
      }}
    />
  );
}
