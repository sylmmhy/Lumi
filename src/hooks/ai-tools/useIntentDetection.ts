/**
 * useIntentDetection - 意图检测 Hook
 * 
 * 三层 AI 架构中的 "AI #2 检测层" 前端集成
 * 
 * 功能：
 * 1. 收集对话历史（用户说的话 + AI 说的话）
 * 2. 调用 detect-intent Edge Function 判断意图
 * 3. 如果检测到工具调用，执行对应的工具处理器
 * 4. 把结果注入回对话 AI
 * 
 * 使用方式：
 * ```tsx
 * const { processAIResponse } = useIntentDetection({
 *   userId: 'xxx',
 *   chatType: 'intention_compile',
 *   onToolResult: (result) => {
 *     // 把结果注入给对话 AI
 *     injectContextSilently(result.responseHint);
 *   },
 * });
 * 
 * // 在 AI 说完话后调用
 * onOutputTranscription: (text) => {
 *   processAIResponse(text);
 * }
 * ```
 */

import { useRef, useCallback } from 'react';
import { handleToolCall, type ToolCallContext, type ToolCallResult } from './toolHandlers';

// ============================================================================
// Types
// ============================================================================

interface UseIntentDetectionOptions {
  // 用户 ID
  userId: string;
  // 对话类型
  chatType: 'intention_compile' | 'daily_chat' | 'habit_checkin' | 'goal_review';
  // 用户首选语言
  preferredLanguage?: string;
  // 工具执行结果回调
  onToolResult?: (result: ToolCallResult & { tool: string }) => void;
  // 检测完成回调（无论是否有工具调用）
  onDetectionComplete?: (result: DetectIntentResult) => void;
  // 是否启用（可以临时禁用）
  enabled?: boolean;
  // 防抖时间（毫秒），避免频繁检测
  debounceMs?: number;
}

interface DetectIntentResult {
  success: boolean;
  tool: string | null;
  args: Record<string, unknown>;
  confidence: number;
  reasoning?: string;
  error?: string;
}

interface LastSuggestion {
  anchor_task_id: string;
  anchor_title: string;
  new_habit: string;
  position: 'before' | 'after';
  reminder_text: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useIntentDetection(options: UseIntentDetectionOptions) {
  const {
    userId,
    chatType,
    preferredLanguage = 'zh',
    onToolResult,
    onDetectionComplete,
    enabled = true,
    debounceMs = 500,
  } = options;

  // 对话历史
  const userMessagesRef = useRef<string[]>([]);
  const aiMessageHistoryRef = useRef<string[]>([]);
  const lastSuggestionRef = useRef<LastSuggestion | null>(null);
  
  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 正在处理中
  const isProcessingRef = useRef(false);
  
  // 待处理的最新 AI 回复（用于排队）
  const pendingAIResponseRef = useRef<string | null>(null);
  
  // 已触发的工具记录（防止同一会话重复触发 save_goal_plan）
  const triggeredToolsRef = useRef<Set<string>>(new Set());
  
  // 待创建的习惯名称（用于 create_simple_routine）
  const pendingHabitRef = useRef<string | null>(null);

  // Supabase 配置
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  /**
   * 添加用户消息到历史
   */
  const addUserMessage = useCallback((message: string) => {
    userMessagesRef.current.push(message);
    // 只保留最近 10 条
    if (userMessagesRef.current.length > 10) {
      userMessagesRef.current = userMessagesRef.current.slice(-10);
    }
  }, []);

  /**
   * 直接设置用户消息历史（替换整个数组）
   */
  const setUserMessages = useCallback((messages: string[]) => {
    userMessagesRef.current = messages.slice(-10);
    console.log('📝 [用户消息] 设置:', userMessagesRef.current);
  }, []);

  /**
   * 清空对话历史
   */
  const clearHistory = useCallback(() => {
    userMessagesRef.current = [];
    aiMessageHistoryRef.current = [];
    lastSuggestionRef.current = null;
    pendingHabitRef.current = null;
    triggeredToolsRef.current.clear();
  }, []);

  /**
   * 调用 detect-intent API
   */
  const detectIntent = useCallback(async (aiResponse: string): Promise<DetectIntentResult> => {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/detect-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          userMessages: userMessagesRef.current,
          aiResponse,
          chatType,
          lastSuggestion: lastSuggestionRef.current,
          pendingHabit: pendingHabitRef.current,
          previousAIMessages: aiMessageHistoryRef.current.slice(-3),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Detection failed');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ [IntentDetection] API 调用失败:', error);
      return {
        success: false,
        tool: null,
        args: {},
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [supabaseUrl, supabaseAnonKey, chatType]);

  /**
   * 执行工具调用
   */
  const executeToolCall = useCallback(async (
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> => {
    const context: ToolCallContext = {
      userId,
      supabaseUrl,
      supabaseAnonKey,
      preferredLanguage,
    };

    console.log(`🔧 [IntentDetection] 执行工具: ${tool}`, args);
    
    const result = await handleToolCall(tool, args, context);

    // 如果是 suggest_habit_stack 成功，保存推荐结果
    const resultData = result.data as Record<string, unknown> | undefined;
    if (tool === 'suggest_habit_stack' && result.success && resultData?.recommended) {
      const rec = resultData.recommended as Record<string, unknown>;
      lastSuggestionRef.current = {
        anchor_task_id: rec.anchor_task_id as string,
        anchor_title: rec.anchor_title as string,
        new_habit: args.new_habit as string,
        position: rec.position as 'before' | 'after',
        reminder_text: rec.reminder_text as string,
      };
      console.log('💾 [IntentDetection] 保存推荐结果:', lastSuggestionRef.current);
    }

    // 如果是 suggest_habit_stack 但需要用户输入时间（没有锚点）
    if (tool === 'suggest_habit_stack' && result.success && resultData?.needsTimeInput) {
      pendingHabitRef.current = resultData.habitName as string;
      console.log('💾 [IntentDetection] 保存待创建习惯:', pendingHabitRef.current);
    }

    // 如果是 create_habit_stack 成功，清空推荐
    if (tool === 'create_habit_stack' && result.success) {
      lastSuggestionRef.current = null;
      console.log('🗑️ [IntentDetection] 清空推荐结果');
    }
    
    // 如果是 create_simple_routine 成功，清空待创建习惯
    if (tool === 'create_simple_routine' && result.success) {
      pendingHabitRef.current = null;
      console.log('🗑️ [IntentDetection] 清空待创建习惯');
    }

    return result;
  }, [userId, supabaseUrl, supabaseAnonKey, preferredLanguage]);

  /**
   * 处理 AI 回复（主入口）
   * 
   * 在 AI 说完一段话后调用此函数
   * 会自动检测意图并执行工具（如果需要）
   */
  const processAIResponse = useCallback((aiResponse: string) => {
    if (!enabled) {
      console.log('⏸️ [IntentDetection] 已禁用');
      return;
    }

    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 存储 AI 消息历史（用于在确认阶段提供上下文）
    aiMessageHistoryRef.current.push(aiResponse);
    if (aiMessageHistoryRef.current.length > 5) {
      aiMessageHistoryRef.current = aiMessageHistoryRef.current.slice(-5);
    }

    // 防抖处理
    debounceTimerRef.current = setTimeout(async () => {
      // 如果正在处理，把这次请求存起来等待
      if (isProcessingRef.current) {
        console.log('⏳ [IntentDetection] 正在处理中，将新请求加入队列');
        pendingAIResponseRef.current = aiResponse;
        return;
      }

      isProcessingRef.current = true;
      let currentResponse: string | null = aiResponse;

      // 循环处理，直到没有待处理的请求
      while (currentResponse) {
        try {
          console.log('🔍 [IntentDetection] 开始检测意图...');
          
          // 1. 调用检测 API
          const detection = await detectIntent(currentResponse);
          
          console.log('🔍 [IntentDetection] 检测结果:', detection);

          // 通知检测完成
          onDetectionComplete?.(detection);

          // 2. 如果检测到工具，执行它
          // 注意：AI 可能返回字符串 "null" 而不是真正的 null
          const hasTool = detection.tool && detection.tool !== 'null';
          const toolName = detection.tool as string; // 已通过 hasTool 确保非 null
          if (detection.success && hasTool && detection.confidence >= 0.6) {
            // 检查工具是否已触发过（防重复）
            if (triggeredToolsRef.current.has(toolName)) {
              console.log(`⚠️ [IntentDetection] ${toolName} 已触发过，跳过`);
            } else {
              console.log(`🔧 [IntentDetection] 检测到工具调用: ${toolName} (置信度: ${detection.confidence})`);

              const toolResult = await executeToolCall(toolName, detection.args);

              // 标记已触发的工具（防止重复触发）
              if (toolResult.success && ['save_goal_plan', 'create_simple_routine', 'create_habit_stack'].includes(toolName)) {
                triggeredToolsRef.current.add(toolName);
                console.log(`✅ [IntentDetection] 已标记 ${toolName} 触发`);
              }
              
              // 通知工具结果
              onToolResult?.({
                ...toolResult,
                tool: toolName,
              });
            }
          } else if (detection.tool && detection.tool !== 'null') {
            console.log(`⚠️ [IntentDetection] 置信度不足，跳过: ${detection.tool} (${detection.confidence})`);
          }

        } catch (error) {
          console.error('❌ [IntentDetection] 处理失败:', error);
        }
        
        // 检查是否有待处理的请求
        currentResponse = pendingAIResponseRef.current;
        pendingAIResponseRef.current = null;
      }
      
      isProcessingRef.current = false;
    }, debounceMs);
  }, [enabled, debounceMs, detectIntent, executeToolCall, onToolResult, onDetectionComplete]);

  return {
    // 主入口：处理 AI 回复
    processAIResponse,
    // 添加用户消息
    addUserMessage,
    // 直接设置用户消息历史
    setUserMessages,
    // 清空历史
    clearHistory,
    // 获取当前推荐
    getLastSuggestion: () => lastSuggestionRef.current,
  };
}

export type { DetectIntentResult, LastSuggestion };
