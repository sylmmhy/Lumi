/**
 * useReflectionChat Hook
 * 
 * Handles the reflection conversation flow with the AI.
 * Used by ReflectionLockScreen to manage the "Digital Point-and-Call" interaction.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Reflection trigger types matching backend */
export type ReflectionTriggerType =
    | 'alarm_dismissed'
    | 'alarm_snoozed'
    | 'task_skipped'
    | 'task_postponed'
    | 'manual_reflection';

/** Confirmation types from voice input */
export type ConfirmationType = 'confirm_skip' | 'confirm_action' | 'invalid';

/** Response from reflection-chat Edge Function */
export interface ReflectionChatResponse {
    success: boolean;
    message: string;
    aiResponse?: string;
    confirmationValidated?: boolean;
    confirmationType?: ConfirmationType;
    shouldUnlock?: boolean;
    suggestedAction?: 'unlock' | 'continue_reflection' | 'wait_for_confirmation';
}

/** Hook state */
interface ReflectionState {
    isLoading: boolean;
    aiResponse: string | null;
    confirmationType: ConfirmationType | null;
    shouldUnlock: boolean;
    error: string | null;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Hook options */
interface UseReflectionChatOptions {
    userId: string;
    triggerType: ReflectionTriggerType;
    taskName: string;
    userName?: string;
    preferredLanguage?: string;
}

/**
 * Hook for managing reflection chat conversation
 */
export function useReflectionChat(options: UseReflectionChatOptions) {
    const { userId, triggerType, taskName, userName, preferredLanguage } = options;

    const [state, setState] = useState<ReflectionState>({
        isLoading: false,
        aiResponse: null,
        confirmationType: null,
        shouldUnlock: false,
        error: null,
        conversationHistory: [],
    });

    /**
     * Start the reflection conversation (first turn)
     */
    const startReflection = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const { data, error } = await supabase.functions.invoke<ReflectionChatResponse>(
                'reflection-chat',
                {
                    body: {
                        userId,
                        triggerType,
                        taskName,
                        userName,
                        preferredLanguage,
                        localTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                    },
                }
            );

            if (error) {
                throw new Error(error.message);
            }

            if (!data?.success) {
                throw new Error(data?.message || 'Failed to start reflection');
            }

            const aiResponse = data.aiResponse || '';

            setState(prev => ({
                ...prev,
                isLoading: false,
                aiResponse,
                shouldUnlock: data.shouldUnlock || false,
                confirmationType: data.confirmationType || null,
                conversationHistory: [
                    ...prev.conversationHistory,
                    { role: 'assistant' as const, content: aiResponse },
                ],
            }));

            return data;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
            return null;
        }
    }, [userId, triggerType, taskName, userName, preferredLanguage]);

    /**
     * Send voice confirmation to the AI
     * @param voiceInput - Transcribed text from voice input
     */
    const sendVoiceConfirmation = useCallback(async (voiceInput: string) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const { data, error } = await supabase.functions.invoke<ReflectionChatResponse>(
                'reflection-chat',
                {
                    body: {
                        userId,
                        triggerType,
                        taskName,
                        userName,
                        preferredLanguage,
                        userVoiceInput: voiceInput,
                        conversationHistory: state.conversationHistory,
                        localTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                    },
                }
            );

            if (error) {
                throw new Error(error.message);
            }

            if (!data?.success) {
                throw new Error(data?.message || 'Failed to process voice input');
            }

            const aiResponse = data.aiResponse || '';

            setState(prev => ({
                ...prev,
                isLoading: false,
                aiResponse,
                shouldUnlock: data.shouldUnlock || false,
                confirmationType: data.confirmationType || null,
                conversationHistory: [
                    ...prev.conversationHistory,
                    { role: 'user' as const, content: voiceInput },
                    { role: 'assistant' as const, content: aiResponse },
                ],
            }));

            return data;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
            return null;
        }
    }, [userId, triggerType, taskName, userName, preferredLanguage, state.conversationHistory]);

    /**
     * Reset the conversation state
     */
    const resetConversation = useCallback(() => {
        setState({
            isLoading: false,
            aiResponse: null,
            confirmationType: null,
            shouldUnlock: false,
            error: null,
            conversationHistory: [],
        });
    }, []);

    return {
        ...state,
        startReflection,
        sendVoiceConfirmation,
        resetConversation,
    };
}
