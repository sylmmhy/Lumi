/**
 * ReflectionLockScreen Component
 * 
 * A full-screen modal that locks the UI and guides the user through
 * the "Digital Point-and-Call" reflection process.
 * 
 * Features:
 * - 30-second countdown timer
 * - AI reflection conversation
 * - Voice confirmation button
 * - Visual feedback for voice activity
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useReflectionChat, type ReflectionTriggerType } from '../../hooks/useReflectionChat';
import VoiceConfirmButton from './VoiceConfirmButton';

interface ReflectionLockScreenProps {
    /** Whether the lock screen is visible */
    isOpen: boolean;
    /** User's ID */
    userId: string;
    /** What triggered the reflection */
    triggerType: ReflectionTriggerType;
    /** Name of the task/habit */
    taskName: string;
    /** User's display name */
    userName?: string;
    /** Lock duration in seconds (default: 30) */
    lockDuration?: number;
    /** Called when the screen should be unlocked */
    onUnlock: (outcome: 'skip' | 'action' | 'timeout') => void;
    /** Called when user confirms to take action */
    onTakeAction?: () => void;
}

/**
 * Full-screen reflection lock component
 */
export const ReflectionLockScreen: React.FC<ReflectionLockScreenProps> = ({
    isOpen,
    userId,
    triggerType,
    taskName,
    userName,
    lockDuration = 30,
    onUnlock,
    onTakeAction,
}) => {
    const [remainingSeconds, setRemainingSeconds] = useState(lockDuration);
    const [transcribedText, setTranscribedText] = useState('');
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const hasStartedRef = useRef(false);

    const {
        isLoading,
        aiResponse,
        confirmationType,
        shouldUnlock,
        error,
        startReflection,
        sendVoiceConfirmation,
        resetConversation,
    } = useReflectionChat({
        userId,
        triggerType,
        taskName,
        userName,
    });

    // Start the reflection conversation when the screen opens
    useEffect(() => {
        if (isOpen && !hasStartedRef.current) {
            hasStartedRef.current = true;
            startReflection();
        }

        if (!isOpen) {
            hasStartedRef.current = false;
            resetConversation();
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRemainingSeconds(lockDuration);
            setTranscribedText('');
        }
    }, [isOpen, startReflection, resetConversation, lockDuration]);

    // Countdown timer
    useEffect(() => {
        if (!isOpen) return;

        timerRef.current = setInterval(() => {
            setRemainingSeconds(prev => {
                if (prev <= 1) {
                    // Time's up - auto unlock
                    clearInterval(timerRef.current!);
                    onUnlock('timeout');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isOpen, onUnlock]);

    // Handle unlock when confirmation is validated
    useEffect(() => {
        if (shouldUnlock && confirmationType) {
            const outcome = confirmationType === 'confirm_action' ? 'action' : 'skip';

            // Small delay for UX
            setTimeout(() => {
                onUnlock(outcome);
                if (outcome === 'action' && onTakeAction) {
                    onTakeAction();
                }
            }, 1500);
        }
    }, [shouldUnlock, confirmationType, onUnlock, onTakeAction]);

    // Handle voice transcription result
    const handleVoiceResult = useCallback((text: string) => {
        setTranscribedText(text);
        sendVoiceConfirmation(text);
    }, [sendVoiceConfirmation]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 px-6">
            {/* Timer ring */}
            <div className="absolute top-8 right-8">
                <div className="relative w-16 h-16">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="rgba(255,255,255,0.2)"
                            strokeWidth="4"
                        />
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke={remainingSeconds <= 10 ? '#EF4444' : '#FCD34D'}
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray={`${(remainingSeconds / lockDuration) * 176} 176`}
                            className="transition-all duration-1000 ease-linear"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-lg font-bold ${remainingSeconds <= 10 ? 'text-red-400' : 'text-yellow-400'}`}>
                            {remainingSeconds}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="w-full max-w-md space-y-8 text-center">
                {/* Task name with trigger context */}
                <div className="space-y-2">
                    <p className="text-gray-400 text-sm">
                        {triggerType === 'alarm_dismissed' && '你刚刚关闭了闹钟'}
                        {triggerType === 'alarm_snoozed' && '你刚刚按了贪睡'}
                        {triggerType === 'task_skipped' && '你选择跳过了'}
                        {triggerType === 'task_postponed' && '你推迟了'}
                        {triggerType === 'manual_reflection' && '反思时刻'}
                    </p>
                    <h1 className="text-3xl font-bold text-white">{taskName}</h1>
                </div>

                {/* AI Response bubble */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 min-h-[120px] flex items-center justify-center">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-gray-300">
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    ) : error ? (
                        <p className="text-red-400">{error}</p>
                    ) : (
                        <p className="text-white text-lg leading-relaxed">{aiResponse}</p>
                    )}
                </div>

                {/* Transcribed text preview */}
                {transcribedText && (
                    <div className="text-gray-400 text-sm italic">
                        "{transcribedText}"
                    </div>
                )}

                {/* Confirmation status */}
                {confirmationType && shouldUnlock && (
                    <div className={`flex items-center justify-center gap-2 ${confirmationType === 'confirm_action' ? 'text-green-400' : 'text-amber-400'
                        }`}>
                        <span className="text-xl">
                            {confirmationType === 'confirm_action' ? '✓' : '○'}
                        </span>
                        <span className="text-lg font-medium">
                            {confirmationType === 'confirm_action'
                                ? '好的，加油！'
                                : '明天是新的开始'}
                        </span>
                    </div>
                )}

                {/* Voice confirmation button */}
                {!shouldUnlock && (
                    <div className="pt-4">
                        <VoiceConfirmButton
                            onResult={handleVoiceResult}
                            disabled={isLoading}
                        />
                        <p className="text-gray-500 text-sm mt-4">
                            说出 "我确认放弃" 或 "我这就去"
                        </p>
                    </div>
                )}
            </div>

            {/* Footer hint */}
            <div className="absolute bottom-8 text-gray-500 text-sm">
                有意识地做出选择
            </div>
        </div>
    );
};

export default ReflectionLockScreen;
