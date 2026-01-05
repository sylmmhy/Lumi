import { useState, useCallback, useEffect } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { useHabitOnboarding } from '../../hooks/useHabitOnboarding';
import { useGeminiLive, fetchGeminiToken } from '../../hooks/gemini-live';
import { useTaskTimer } from '../../hooks/useTaskTimer';
import { useWaveformAnimation } from '../../hooks/useWaveformAnimation';

// Step components
import { WelcomeStep } from './habit-steps/WelcomeStep';
import { HabitSelectStep } from './habit-steps/HabitSelectStep';
import { TimeSelectStep } from './habit-steps/TimeSelectStep';
import { HowItWorksStep } from './habit-steps/HowItWorksStep';
import { TryNowStep } from './habit-steps/TryNowStep';
import { DoneStep } from './habit-steps/DoneStep';
import { TrialCallView } from './habit-steps/TrialCallView';

/**
 * Habit Onboarding 主页面
 * 6 步流程：Welcome -> Choose Habit -> Set Time -> How It Works -> Try Now -> Done
 */
export function HabitOnboardingPage() {
  const onboarding = useHabitOnboarding();
  const [isInCall, setIsInCall] = useState(false);
  const [systemInstruction, setSystemInstruction] = useState<string>('');

  // Gemini Live
  const geminiLive = useGeminiLive({
    systemInstruction,
    enableCamera: true,
    enableMicrophone: true,
  });

  // 倒计时 (5分钟)
  const timer = useTaskTimer({
    initialTime: 300,
    onCountdownComplete: () => {
      // 倒计时结束，自动结束通话
      handleEndCall();
    },
  });

  // 波形动画
  const waveform = useWaveformAnimation({
    enabled: isInCall,
    isSpeaking: geminiLive.isSpeaking,
    barCount: 6,
    baseHeight: 8,
    maxHeight: 40,
  });

  // 获取系统指令
  useEffect(() => {
    const instruction = `You are Lumi, a friendly AI habit coach. The user is setting up their first habit: "${onboarding.habitDisplayName}" at ${onboarding.formatTo12Hour(onboarding.reminderTime)}.

Your role is to:
1. Welcome them warmly and congratulate them on starting this habit
2. Ask about their motivation for this habit
3. Give them 1-2 simple tips to succeed
4. Encourage them and express confidence in their success

Keep the conversation natural, warm, and brief (around 3-5 minutes). Use a supportive and encouraging tone.`;

    setSystemInstruction(instruction);
  }, [onboarding.habitDisplayName, onboarding.reminderTime, onboarding.formatTo12Hour]);

  // 开始试用通话
  const handleStartCall = useCallback(async () => {
    try {
      setIsInCall(true);

      // 预获取 token
      const token = await fetchGeminiToken();

      // 连接 Gemini Live
      await geminiLive.connect(token);

      // 开始倒计时
      timer.startCountdown();
    } catch (error) {
      console.error('Failed to start call:', error);
      setIsInCall(false);
    }
  }, [geminiLive, timer]);

  // 结束通话
  const handleEndCall = useCallback(() => {
    // 停止倒计时
    timer.stopCountdown();

    // 断开 Gemini
    geminiLive.disconnect();

    // 标记完成
    onboarding.completeTrialCall();

    // 退出通话界面
    setIsInCall(false);

    // 跳到下一步
    onboarding.goNext();
  }, [geminiLive, timer, onboarding]);

  // 跳过试用
  const handleSkipTrial = useCallback(() => {
    onboarding.goNext();
  }, [onboarding]);

  // 完成 onboarding
  const handleFinish = useCallback(() => {
    onboarding.saveAndFinish();
  }, [onboarding]);

  // 如果在通话中，显示通话界面
  if (isInCall) {
    return (
      <TrialCallView
        cameraEnabled={geminiLive.cameraEnabled}
        videoRef={geminiLive.videoRef}
        isConnected={geminiLive.isConnected}
        error={geminiLive.error}
        timeRemaining={timer.timeRemaining}
        waveformHeights={waveform.heights}
        habitName={onboarding.habitDisplayName}
        onEndCall={handleEndCall}
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
        return (
          <TryNowStep
            onStartCall={handleStartCall}
            onSkip={handleSkipTrial}
          />
        );

      case 6:
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
