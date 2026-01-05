import { useState, useCallback } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { useHabitOnboarding } from '../../hooks/useHabitOnboarding';
import { useAICoachSession } from '../../hooks/useAICoachSession';
import { TaskWorkingView } from '../../components/task/TaskWorkingView';

// Step components
import { WelcomeStep } from './habit-steps/WelcomeStep';
import { HabitSelectStep } from './habit-steps/HabitSelectStep';
import { TimeSelectStep } from './habit-steps/TimeSelectStep';
import { HowItWorksStep } from './habit-steps/HowItWorksStep';
import { PermissionsStep } from './habit-steps/PermissionsStep';
import { TryNowStep } from './habit-steps/TryNowStep';
import { DoneStep } from './habit-steps/DoneStep';

/**
 * Habit Onboarding 主页面
 * 7 步流程：Welcome -> Choose Habit -> Set Time -> How It Works -> Permissions -> Try Now -> Done
 *
 * 直接复用完整的 useAICoachSession + TaskWorkingView 组件
 * 包含完整的 Edge Function prompt、虚拟消息系统等
 */
export function HabitOnboardingPage() {
  const onboarding = useHabitOnboarding();
  const [isInCall, setIsInCall] = useState(false);

  // AI Coach Session - 复用现有的统一组件（包含虚拟消息、VAD 等完整功能）
  const aiCoach = useAICoachSession({
    initialTime: 300, // 5 分钟
    enableVirtualMessages: true, // 启用虚拟消息系统 ([GREETING], [CHECK_IN] 等)
    enableVAD: true, // 启用语音活动检测
    onCountdownComplete: () => {
      // 倒计时结束，自动结束通话
      handleEndCall();
    },
  });

  // 开始试用通话 - 直接调用 Edge Function 获取完整 prompt
  const handleStartCall = useCallback(async () => {
    try {
      setIsInCall(true);

      // 不传 customSystemInstruction，让 startSession 调用 Edge Function 获取完整 prompt
      // taskDescription 会被发送到 get-system-instruction Edge Function
      await aiCoach.startSession(onboarding.habitDisplayName);
    } catch (error) {
      console.error('Failed to start call:', error);
      setIsInCall(false);
    }
  }, [aiCoach, onboarding.habitDisplayName]);

  // 结束通话
  const handleEndCall = useCallback(() => {
    // 使用 useAICoachSession 的 endSession
    aiCoach.endSession();

    // 标记完成
    onboarding.completeTrialCall();

    // 退出通话界面
    setIsInCall(false);

    // 跳到下一步
    onboarding.goNext();
  }, [aiCoach, onboarding]);

  // 跳过试用
  const handleSkipTrial = useCallback(() => {
    onboarding.goNext();
  }, [onboarding]);

  // 完成 onboarding
  const handleFinish = useCallback(() => {
    onboarding.saveAndFinish();
  }, [onboarding]);

  // 如果在通话中，显示 TaskWorkingView（复用现有组件）
  // 注意：组件卸载时的清理由 useAICoachSession 内部处理
  if (isInCall) {
    return (
      <TaskWorkingView
        taskDescription={onboarding.habitDisplayName}
        time={aiCoach.state.timeRemaining}
        timeMode="countdown"
        camera={{
          enabled: aiCoach.cameraEnabled,
          videoRef: aiCoach.videoRef,
        }}
        onToggleCamera={aiCoach.toggleCamera}
        aiStatus={{
          isConnected: aiCoach.isConnected,
          error: aiCoach.error || aiCoach.connectionError,
          waveformHeights: aiCoach.waveformHeights,
          isSpeaking: aiCoach.isSpeaking,
          isObserving: aiCoach.isObserving,
        }}
        primaryButton={{
          label: "I'm Done",
          emoji: '✅',
          onClick: handleEndCall,
        }}
        backgroundColor="#1e1e1e"
      />
    );
  }

  // 渲染当前步骤
  const renderStep = () => {
    switch (onboarding.step) {
      case 1:
        return <WelcomeStep onNext={onboarding.goNext} />;

      case 2:
        return (
          <HabitSelectStep
            selectedHabitId={onboarding.selectedHabitId}
            customHabitName={onboarding.customHabitName}
            onSelectHabit={onboarding.selectHabit}
            onSetCustomName={onboarding.setCustomHabitName}
            onNext={onboarding.goNext}
            canProceed={onboarding.canProceed}
          />
        );

      case 3:
        return (
          <TimeSelectStep
            reminderTime={onboarding.reminderTime}
            onTimeChange={onboarding.setReminderTime}
            onNext={onboarding.goNext}
          />
        );

      case 4:
        return <HowItWorksStep onNext={onboarding.goNext} />;

      case 5:
        return <PermissionsStep onNext={onboarding.goNext} />;

      case 6:
        return (
          <TryNowStep
            onStartCall={handleStartCall}
            onSkip={handleSkipTrial}
          />
        );

      case 7:
        return (
          <DoneStep
            onFinish={handleFinish}
            isLoading={onboarding.isSaving}
          />
        );

      default:
        return null;
    }
  };

  return (
    <OnboardingLayout
      currentStep={onboarding.step}
      totalSteps={onboarding.totalSteps}
      onBack={onboarding.step > 1 ? onboarding.goBack : undefined}
      showBackButton={onboarding.step > 1}
    >
      {renderStep()}

      {/* 错误提示 */}
      {onboarding.error && (
        <div className="fixed bottom-20 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg">
          {onboarding.error}
        </div>
      )}
    </OnboardingLayout>
  );
}
