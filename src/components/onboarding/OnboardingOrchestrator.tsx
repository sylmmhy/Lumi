import { useState, useEffect, useRef, useCallback } from 'react';
import { ONBOARDING_COUNTDOWN_SECONDS } from '../../constants/onboarding';

// User state types
export type UserState = 'unknown' | 'focused' | 'distracted';

export interface OnboardingState {
  // Task info
  taskDescription: string;

  // Timer
  timeRemaining: number; // in seconds
  isTimerRunning: boolean;

  // User state
  userState: UserState;
  stateHistory: Array<{ state: UserState; timestamp: Date; reason?: string }>;

  // Messages
  messages: Array<{
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: Date;
    isVirtual?: boolean; // virtual messages are not displayed
  }>;

  // Track user conversation activity
  lastRealUserMessageTime: Date | null;

  // Track AI conversation activity (to avoid interrupting AI's response)
  lastAIMessageTime: Date | null;
}

export function useOnboardingOrchestrator() {
  const [state, setState] = useState<OnboardingState>({
    taskDescription: '',
    timeRemaining: ONBOARDING_COUNTDOWN_SECONDS,
    isTimerRunning: false,
    userState: 'unknown',
    stateHistory: [],
    messages: [],
    lastRealUserMessageTime: null,
    lastAIMessageTime: null,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start the timer
  const startTimer = useCallback(() => {
    setState(prev => ({ ...prev, isTimerRunning: true }));
  }, []);

  // Stop the timer
  const stopTimer = useCallback(() => {
    setState(prev => ({ ...prev, isTimerRunning: false }));
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Timer countdown effect
  useEffect(() => {
    if (state.isTimerRunning && state.timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          const newTime = prev.timeRemaining - 1;

          // Timer finished
          if (newTime <= 0) {
            return {
              ...prev,
              timeRemaining: 0,
              isTimerRunning: false,
            };
          }

          return {
            ...prev,
            timeRemaining: newTime,
          };
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [state.isTimerRunning, state.timeRemaining]);

  // Initialize task
  const initializeTask = useCallback((taskDescription: string) => {
    setState(prev => ({
      ...prev,
      taskDescription,
      timeRemaining: ONBOARDING_COUNTDOWN_SECONDS,
      isTimerRunning: false,
      userState: 'unknown',
      stateHistory: [],
      messages: [],
      lastRealUserMessageTime: null,
    }));
  }, []);

  // Add message
  const addMessage = useCallback((role: 'user' | 'ai', content: string, isVirtual = false) => {
    const now = new Date();
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: Date.now().toString(),
          role,
          content,
          timestamp: now,
          isVirtual,
        },
      ],
      // Update lastRealUserMessageTime only for real user messages (not virtual)
      lastRealUserMessageTime: (role === 'user' && !isVirtual) ? now : prev.lastRealUserMessageTime,
      // Update lastAIMessageTime for all AI messages (to avoid interrupting AI)
      lastAIMessageTime: (role === 'ai') ? now : prev.lastAIMessageTime,
    }));
  }, []);

  // Update user state
  const updateUserState = useCallback((newState: UserState, reason?: string) => {
    setState(prev => ({
      ...prev,
      userState: newState,
      stateHistory: [
        ...prev.stateHistory,
        {
          state: newState,
          timestamp: new Date(),
          reason,
        },
      ],
    }));
  }, []);

  // Reset everything
  const reset = useCallback(() => {
    stopTimer();
    setState({
      taskDescription: '',
      timeRemaining: ONBOARDING_COUNTDOWN_SECONDS,
      isTimerRunning: false,
      userState: 'unknown',
      stateHistory: [],
      messages: [],
      lastRealUserMessageTime: null,
      lastAIMessageTime: null,
    });
  }, [stopTimer]);

  return {
    state,
    actions: {
      initializeTask,
      startTimer,
      stopTimer,
      addMessage,
      updateUserState,
      reset,
    },
  };
}
