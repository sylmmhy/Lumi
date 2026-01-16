import { useState, useCallback, useEffect, useRef } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { useHabitOnboarding } from '../../hooks/useHabitOnboarding';
import { useAICoachSession } from '../../hooks/useAICoachSession';
import { useAuth } from '../../hooks/useAuth';
import { TaskWorkingView } from '../../components/task/TaskWorkingView';
import { getPreferredLanguages } from '../../lib/language';

// Step components
import { WelcomeStep } from './habit-steps/WelcomeStep';
import { HabitSelectStep } from './habit-steps/HabitSelectStep';
import { TimeSelectStep } from './habit-steps/TimeSelectStep';
import { HowItWorksStep } from './habit-steps/HowItWorksStep';
import { PermissionsStep } from './habit-steps/PermissionsStep';
import { PermissionsStepReview } from './habit-steps/PermissionsStepReview';
import { NameInputStep } from './habit-steps/NameInputStep';
import { LanguageSelectStep } from './habit-steps/LanguageSelectStep';
import { TryNowStep } from './habit-steps/TryNowStep';
import { DoneStep } from './habit-steps/DoneStep';

// Apple Review Mode - set to true when submitting for App Store review
import { APPLE_REVIEW_MODE } from '../../constants/reviewMode';

/**
 * Habit Onboarding 主页面
 * 9 步流程：Welcome -> Choose Habit -> Set Time -> How It Works -> Permissions -> Name Input -> Language Select -> Try Now -> Done
 *
 * 直接复用完整的 useAICoachSession + TaskWorkingView 组件
 * 包含完整的 Edge Function prompt、虚拟消息系统等
 */
export function HabitOnboardingPage() {
  const { isLoggedIn, isSessionValidated, navigateToLogin } = useAuth();
  const onboarding = useHabitOnboarding();
  const [isInCall, setIsInCall] = useState(false);

  // 使用 ref 来存储 handleEndCall，解决循环依赖问题
  const handleEndCallRef = useRef<() => void>(() => {});

  // AI Coach Session - 必须在所有条件返回之前调用，遵循 React Hooks 规则
  const aiCoach = useAICoachSession({
    initialTime: 300, // 5 分钟
    enableVirtualMessages: true, // 启用虚拟消息系统 ([GREETING], [CHECK_IN] 等)
    enableVAD: true, // 启用语音活动检测
    onCountdownComplete: () => {
      // 倒计时结束，自动结束通话
      handleEndCallRef.current();
    },
  });

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

  // 更新 ref
  useEffect(() => {
    handleEndCallRef.current = handleEndCall;
  }, [handleEndCall]);

  // 登录检查：未登录时重定向到登录页
  useEffect(() => {
    if (isSessionValidated && !isLoggedIn) {
      navigateToLogin('/habit-onboarding');
    }
  }, [isSessionValidated, isLoggedIn, navigateToLogin]);

  // 【已移除】已完成 onboarding 检查
  // 网页端不再判断 hasCompletedHabitOnboarding，由端侧决定加载哪个 URL
  // 用户可自由访问 /habit-onboarding 页面

  /**
   * 开始试用通话
   * 1) 读取用户在引导中选择的语言偏好
   * 2) 作为 preferredLanguages 传给 AI 会话，确保 Lumi 使用正确语言互动
   */
  const handleStartCall = useCallback(async () => {
    try {
      setIsInCall(true);

      // 不传 customSystemInstruction，让 startSession 调用 Edge Function 获取完整 prompt
      // taskDescription 会被发送到 get-system-instruction Edge Function
      const preferredLanguages = getPreferredLanguages();
      await aiCoach.startSession(onboarding.habitDisplayName, {
        preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      setIsInCall(false);
    }
  }, [aiCoach, onboarding.habitDisplayName]);

  // 跳过试用
  const handleSkipTrial = useCallback(() => {
    onboarding.goNext();
  }, [onboarding]);

  // 完成 onboarding
  const handleFinish = useCallback(() => {
    onboarding.saveAndFinish();
  }, [onboarding]);

  // ============ 条件返回（放在所有 hooks 之后）============

  // 等待会话验证完成
  if (!isSessionValidated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // 未登录时不渲染内容（等待重定向）
  if (!isLoggedIn) {
    return null;
  }

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
        // Use review version for Apple App Store submission (complies with Guideline 5.1.1)
        return APPLE_REVIEW_MODE
          ? <PermissionsStepReview onNext={onboarding.goNext} />
          : <PermissionsStep onNext={onboarding.goNext} />;

      case 6:
        return <NameInputStep onNext={onboarding.goNext} />;

      case 7:
        return <LanguageSelectStep onNext={onboarding.goNext} />;

      case 8:
        return (
          <TryNowStep
            onStartCall={handleStartCall}
            onSkip={handleSkipTrial}
          />
        );

      case 9:
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
