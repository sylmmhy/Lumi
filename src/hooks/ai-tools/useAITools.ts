/**
 * useAITools - AI 工具集成 Hook
 * 
 * 封装工具定义和处理逻辑，方便在 useAICoachSession 中使用
 */

import { useCallback, useRef } from 'react';
import { aiTools, handleToolCall } from './index';
import type { ToolCallContext, ToolCallResult } from './toolDefinitions';
import type { FunctionDeclaration } from '@google/genai';

interface UseAIToolsOptions {
  /** 用户 ID */
  userId?: string | null;
  /** Supabase URL */
  supabaseUrl?: string;
  /** Supabase Anon Key */
  supabaseAnonKey?: string;
  /** 用户首选语言 */
  preferredLanguage?: string;
  /** 是否启用工具 */
  enabled?: boolean;
}

interface UseAIToolsReturn {
  /** 工具定义列表（传给 Gemini Live） */
  tools: FunctionDeclaration[];
  
  /** 处理工具调用 */
  handleToolCall: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<ToolCallResult>;
  
  /** 上一次推荐的习惯叠加方案（用于 create_habit_stack） */
  lastSuggestion: React.MutableRefObject<{
    anchor_task_id: string;
    anchor_title: string;
    position: 'before' | 'after';
    reminder_text: string;
  } | null>;
}

export function useAITools(options: UseAIToolsOptions = {}): UseAIToolsReturn {
  const {
    userId,
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
    preferredLanguage = 'en-US',
    enabled = true,
  } = options;

  // 保存上一次推荐结果，用于后续创建
  const lastSuggestionRef = useRef<{
    anchor_task_id: string;
    anchor_title: string;
    position: 'before' | 'after';
    reminder_text: string;
  } | null>(null);

  // 处理工具调用
  const handleCall = useCallback(async (
    functionName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> => {
    if (!enabled) {
      return {
        success: false,
        error: 'Tools are disabled',
        responseHint: 'I cannot perform that action right now.',
      };
    }

    if (!userId) {
      return {
        success: false,
        error: 'User not authenticated',
        responseHint: 'Please log in first.',
      };
    }

    const context: ToolCallContext = {
      userId,
      supabaseUrl,
      supabaseAnonKey,
      preferredLanguage,
    };

    // 特殊处理：create_habit_stack 需要从上一次推荐中获取参数
    if (functionName === 'create_habit_stack' && lastSuggestionRef.current) {
      const enrichedArgs = {
        ...args,
        anchor_task_id: args.anchor_task_id || lastSuggestionRef.current.anchor_task_id,
        position: args.position || lastSuggestionRef.current.position,
        reminder_message: args.reminder_message || lastSuggestionRef.current.reminder_text,
      };
      return handleToolCall(functionName, enrichedArgs, context);
    }

    const result = await handleToolCall(functionName, args, context);

    // 保存推荐结果供后续使用
    if (functionName === 'suggest_habit_stack' && result.success && result.data) {
      const data = result.data as { recommended?: typeof lastSuggestionRef.current };
      if (data.recommended) {
        lastSuggestionRef.current = data.recommended;
        if (import.meta.env.DEV) {
          console.log('💾 [useAITools] 保存推荐结果:', lastSuggestionRef.current);
        }
      }
    }

    return result;
  }, [enabled, userId, supabaseUrl, supabaseAnonKey, preferredLanguage]);

  return {
    tools: enabled ? aiTools : [],
    handleToolCall: handleCall,
    lastSuggestion: lastSuggestionRef,
  };
}
