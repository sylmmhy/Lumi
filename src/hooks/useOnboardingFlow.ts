import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { useAnalytics } from './useAnalytics';
import { useVoiceInput } from './useVoiceInput';
import { useTaskTimer } from './useTaskTimer';
import { useWaveformAnimation } from './useWaveformAnimation';
import { useCelebrationAnimation } from './useCelebrationAnimation';
import { useVirtualMessages } from './useVirtualMessages';
import { useGeminiLive } from './useGeminiLive';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { useOnboardingOrchestrator } from '../components/onboarding/OnboardingOrchestrator';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { ONBOARDING_COUNTDOWN_SECONDS } from '../constants/onboarding';
import { getSupabaseClient } from '../lib/supabase';

type OnboardingStep = 'welcome' | 'running' | 'working' | 'completed';
type CompletionFlow = 'confirm' | 'success' | 'failure';
type CompletionTrigger = 'manual' | 'timer';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1500;

const isValidUserSpeech = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[^\w\u4e00-\u9fa5]+$/.test(trimmed)) return false;
  return true;
};

export function useOnboardingFlow() {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [taskInput, setTaskInput] = useState('');
  const [completionFlow, setCompletionFlow] = useState<CompletionFlow>('confirm');
  const [completionTrigger, setCompletionTrigger] = useState<CompletionTrigger>('timer');
  const [completionRemainingTime, setCompletionRemainingTime] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const processedTranscriptRef = useRef<Set<string>>(new Set());
  const systemInstructionRef = useRef<string | undefined>(undefined);

  const auth = useAuth({
    requireLoginAfterOnboarding: true,
    redirectPath: DEFAULT_APP_PATH,
  });

  const analytics = useAnalytics({
    trackPageOpen: true,
    pageName: 'onboarding',
  });

  const voiceInput = useVoiceInput({
    onTranscript: (text) => setTaskInput(text),
    onError: (error) => console.error('语音输入错误:', error),
  });

  const taskTimer = useTaskTimer({
    initialTime: ONBOARDING_COUNTDOWN_SECONDS,
    onCountdownComplete: () => {
      if (step === 'running') {
        setCompletionTrigger('timer');
        setCompletionRemainingTime(0);
        setStep('completed');
        geminiLive.disconnect();
      }
    },
  });
  const { startWorkingTimer, stopWorkingTimer } = taskTimer;

  const { state: orchestratorState, actions: orchestratorActions } = useOnboardingOrchestrator();

  const geminiLive = useGeminiLive({
    onTranscriptUpdate: (newTranscript) => {
      const lastMessage = newTranscript[newTranscript.length - 1];
      if (!lastMessage) return;

      const messageId = `${lastMessage.role}-${lastMessage.text.substring(0, 50)}`;
      if (processedTranscriptRef.current.has(messageId)) {
        return;
      }
      processedTranscriptRef.current.add(messageId);

      if (lastMessage.role === 'assistant') {
        orchestratorActions.addMessage('ai', lastMessage.text);
      }

      if (lastMessage.role === 'user') {
        if (isValidUserSpeech(lastMessage.text)) {
          orchestratorActions.addMessage('user', lastMessage.text, false);
        }
      }
    },
  });

  useEffect(() => {
    if (geminiLive.error) {
      setUiError(geminiLive.error);
    }
  }, [geminiLive.error]);

  useEffect(() => {
    if (geminiLive.isConnected) {
      setUiError(null);
      setReconnectAttempt(0);
    }
  }, [geminiLive.isConnected]);

  const vad = useVoiceActivityDetection(geminiLive.audioStream, {
    enabled: step === 'running' && geminiLive.isRecording,
    threshold: 30,
    smoothingTimeConstant: 0.8,
    fftSize: 2048,
  });

  const waveformAnimation = useWaveformAnimation({
    enabled: step === 'running',
    isSpeaking: geminiLive.isSpeaking,
  });

  const virtualMessages = useVirtualMessages({
    enabled: step === 'running' && geminiLive.isConnected,
    taskStartTime: taskTimer.taskStartTime,
    isAISpeaking: geminiLive.isSpeaking,
    isUserSpeaking: vad.isSpeaking,
    lastUserSpeechTime: vad.lastSpeakingTime,
    onSendMessage: (message) => geminiLive.sendTextMessage(message),
    onAddMessage: orchestratorActions.addMessage,
  });

  useEffect(() => {
    geminiLive.setOnTurnComplete(() => virtualMessages.recordTurnComplete(false));
    return () => geminiLive.setOnTurnComplete(null);
  }, [geminiLive.setOnTurnComplete, virtualMessages.recordTurnComplete]);

  useEffect(() => {
    localStorage.setItem('has_visited_firego', 'true');
  }, []);

  useEffect(() => {
    auth.checkOnboardingLoginRequirement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const taskParam = urlParams.get('task');
    if (taskParam) {
      setTaskInput(taskParam);
    }
  }, []);

  const handleStartTask = useCallback(async () => {
    const finalTaskInput = taskInput.trim();

    if (!finalTaskInput) {
      setUiError('请输入你想完成的任务');
      return;
    }

    processedTranscriptRef.current.clear();
    setIsConnecting(true);
    setUiError(null);

    try {
      orchestratorActions.initializeTask(finalTaskInput);

      if (!geminiLive.isRecording) {
        await geminiLive.toggleMicrophone();
        if (geminiLive.error) {
          throw new Error(geminiLive.error);
        }
      }

      let systemInstruction = systemInstructionRef.current;
      if (!systemInstruction) {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
          throw new Error('Supabase 未配置');
        }

        const { data, error } = await supabaseClient.functions.invoke('get-system-instruction', {
          body: { taskInput: finalTaskInput }
        });

        if (error) {
          throw new Error(`获取系统指令失败: ${error.message}`);
        }

        systemInstruction = data.systemInstruction;
        systemInstructionRef.current = systemInstruction;
      }

      await geminiLive.connect(systemInstruction, undefined);

      setIsConnecting(false);

      taskTimer.startCountdown();
      orchestratorActions.startTimer();
      setStep('running');
      analytics.trackTaskStarted(finalTaskInput);
    } catch (error) {
      console.error('handleStartTask 错误:', error);
      setIsConnecting(false);
      setUiError(error instanceof Error ? error.message : '连接失败，请重试。');
    }
  }, [taskInput, orchestratorActions, geminiLive, taskTimer, analytics]);

  const handleEndTask = useCallback(() => {
    taskTimer.stopCountdown();
    orchestratorActions.stopTimer();
    geminiLive.disconnect();

    analytics.trackTaskCompleted(orchestratorState.taskDescription);

    setCompletionTrigger('manual');
    setCompletionRemainingTime(taskTimer.timeRemaining);
    setStep('completed');
  }, [taskTimer, orchestratorActions, geminiLive, analytics, orchestratorState.taskDescription]);

  const handleRestart = useCallback(() => {
    setStep('welcome');
    setTaskInput('');
    taskTimer.reset();
    orchestratorActions.reset();
    geminiLive.disconnect();
    processedTranscriptRef.current.clear();
    systemInstructionRef.current = undefined;
  }, [taskTimer, orchestratorActions, geminiLive]);

  useEffect(() => {
    if (step === 'working') {
      startWorkingTimer();
    } else {
      stopWorkingTimer();
    }
  }, [step, startWorkingTimer, stopWorkingTimer]);

  useEffect(() => {
    if (step === 'completed') {
      if (completionTrigger === 'manual') {
        setCompletionFlow('success');
      } else {
        setCompletionFlow('confirm');
      }
    }
  }, [step, completionTrigger]);

  const handleComplete = useCallback((result: 'success' | 'failure') => {
    auth.markOnboardingCompleted(
      orchestratorState.taskDescription || taskInput,
      ONBOARDING_COUNTDOWN_SECONDS - taskTimer.timeRemaining,
      result
    );

    if (auth.isLoggedIn) {
      window.location.reload();
    } else {
      auth.navigateToLogin(DEFAULT_APP_PATH);
    }
  }, [auth, orchestratorState.taskDescription, taskInput, taskTimer.timeRemaining]);

  const celebrationAnimation = useCelebrationAnimation({
    enabled: step === 'completed' && completionFlow === 'success',
    remainingTime: completionRemainingTime,
  });

  useEffect(() => {
    return () => {
      geminiLive.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const autostartParam = urlParams.get('autostart');

    if (autostartParam === 'true' && taskInput && !hasAutoStarted && step === 'welcome') {
      setHasAutoStarted(true);
      handleStartTask();
    }
  }, [taskInput, hasAutoStarted, step, handleStartTask]);

  useEffect(() => {
    const shouldRetry =
      !!geminiLive.error &&
      step === 'running' &&
      systemInstructionRef.current &&
      reconnectAttempt < MAX_RECONNECT_ATTEMPTS &&
      !isReconnecting;

    if (!shouldRetry) return;

    const delay = RECONNECT_DELAY_MS * (reconnectAttempt + 1);
    setIsReconnecting(true);

    const timer = setTimeout(async () => {
      try {
        await geminiLive.connect(systemInstructionRef.current as string, undefined);
        setReconnectAttempt(0);
        setUiError(null);
      } catch (error) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        setUiError(`Gemini 连接失败，正在重试 (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})`);
      } finally {
        setIsReconnecting(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [geminiLive.error, geminiLive.connect, step, reconnectAttempt, isReconnecting]);

  return {
    step,
    uiError,
    isConnecting,
    showBottomNav: auth.isLoggedIn,
    canvasRef: geminiLive.canvasRef,
    dismissError: () => setUiError(null),
    retryStart: handleStartTask,
    views: {
      welcome: {
        taskInput,
        setTaskInput,
        isVoiceMode: voiceInput.isVoiceMode,
        startVoiceRecording: voiceInput.startRecording,
        stopVoiceRecording: voiceInput.stopRecording,
        voiceWaveformHeights: voiceInput.waveformHeights,
        onStartTask: handleStartTask,
      },
      running: {
        taskDescription: orchestratorState.taskDescription,
        timeRemaining: orchestratorState.timeRemaining,
        cameraEnabled: geminiLive.cameraEnabled,
        videoRef: geminiLive.videoRef,
        aiConnected: geminiLive.isConnected,
        aiError: geminiLive.error,
        isSpeaking: geminiLive.isSpeaking,
        waveformHeights: waveformAnimation.heights,
        onToggleCamera: geminiLive.toggleCamera,
        onComplete: handleEndTask,
        onRestart: handleRestart,
        hasBottomNav: auth.isLoggedIn,
      },
      working: {
        taskDescription: orchestratorState.taskDescription,
        workingSeconds: taskTimer.workingSeconds,
        onComplete: () => {
          taskTimer.stopWorkingTimer();
          analytics.trackTaskCompleted(orchestratorState.taskDescription);
          setCompletionRemainingTime(taskTimer.timeRemaining);
          setCompletionTrigger('manual');
          setCompletionFlow('success');
          setStep('completed');
        },
        onGiveUp: () => {
          taskTimer.stopWorkingTimer();
          analytics.trackTaskAbandoned(
            orchestratorState.taskDescription,
            taskTimer.workingSeconds,
            'working'
          );
          setCompletionRemainingTime(taskTimer.timeRemaining);
          setCompletionTrigger('manual');
          setCompletionFlow('failure');
          setStep('completed');
        },
      },
      completed: {
        flow: completionFlow,
        onFlowChange: setCompletionFlow,
        completionTime: completionRemainingTime,
        taskDescription: orchestratorState.taskDescription || taskInput,
        celebrationScene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        onConfirmYes: () => setCompletionFlow('success'),
        onConfirmNo: () => setCompletionFlow('failure'),
        onSaveAndChallenge: () => handleComplete('success'),
        onTakeMoreChallenge: () => handleComplete('failure'),
      },
    },
  };
}
