/**
 * 后台推送召回 Hook
 *
 * 检测用户在 AI Coach Session 中切到后台（visibilitychange），
 * 触发服务端渐进式推送召回系统：
 *   0s   → 立即推送（常规通知）
 *   ~90s → 跟进推送（更紧迫）
 *   ~180s → 断开旧 session + VoIP 来电召回
 *
 * 关键设计：
 * - 5 秒防抖：避免 iOS 下拉通知栏/控制中心等短暂离开的误触发
 * - UUID 校验：只接受真实 taskId，temp-* 不触发
 * - 双模式取消：nudgeId 优先 + userId fallback（解决竞态）
 */

import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import { devLog, devWarn } from '../gemini-live/utils';

/** 防抖延迟（毫秒）：切后台多久后才真正触发 nudge */
const DEBOUNCE_MS = 5000;

/** UUID v4 格式校验 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseBackgroundNudgeOptions {
  /** 会话是否处于活跃状态 */
  isSessionActive: boolean;
  /** 当前任务 ID（必须是真实 UUID，temp-* 不行） */
  taskId: string | null;
  /** 当前任务描述 */
  taskDescription: string;
  /** 获取最近对话摘要的回调 */
  getTranscriptSummary: () => string;
  /** 会话类型 */
  sessionType?: 'coach' | 'campfire';
}

/**
 * 后台推送召回 Hook
 *
 * 监听 document.visibilitychange 事件：
 * - hidden → 5 秒防抖后调用 background-nudge start
 * - visible → 调用 background-nudge cancel
 * - unmount → 自动取消
 */
export function useBackgroundNudge(options: UseBackgroundNudgeOptions) {
  // 使用 ref 避免 effect 因 options 变化重建
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const nudgeIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { isSessionActive, taskId } = optionsRef.current;

    // 不启用条件：非活跃 session 或没有合法 taskId
    if (!isSessionActive || !taskId || !UUID_REGEX.test(taskId)) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // ---- 切到后台 ----
        devLog('[BackgroundNudge] App went to background, starting debounce...');

        // 清除之前的防抖 timer（如果有）
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // 5 秒防抖：避免 iOS 控制中心/通知栏的误触发
        debounceTimerRef.current = setTimeout(async () => {
          debounceTimerRef.current = null;

          // 5 秒内回来了就不触发
          if (!document.hidden) {
            devLog('[BackgroundNudge] User came back within debounce, skipping');
            return;
          }

          // 再次检查条件（可能在防抖期间 session 已结束）
          const currentOptions = optionsRef.current;
          if (!currentOptions.isSessionActive || !currentOptions.taskId) {
            return;
          }

          const supabase = getSupabaseClient();
          if (!supabase) return;

          try {
            devLog('[BackgroundNudge] Triggering start...');
            const { data, error } = await supabase.functions.invoke('background-nudge', {
              body: {
                action: 'start',
                taskId: currentOptions.taskId,
                taskDescription: currentOptions.taskDescription,
                transcriptSummary: currentOptions.getTranscriptSummary(),
                sessionType: currentOptions.sessionType || 'coach',
              },
            });

            if (error) {
              devWarn('[BackgroundNudge] Start failed:', error);
              return;
            }

            nudgeIdRef.current = (data as { nudgeId?: string })?.nudgeId ?? null;
            devLog('[BackgroundNudge] Started, nudgeId:', nudgeIdRef.current);
          } catch (e) {
            devWarn('[BackgroundNudge] Start error:', e);
          }
        }, DEBOUNCE_MS);

      } else {
        // ---- 回到前台 ----
        devLog('[BackgroundNudge] App came to foreground');

        // 清除防抖 timer（如果还在防抖期间就回来了）
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          devLog('[BackgroundNudge] Debounce cancelled (user returned quickly)');
          return; // 防抖期间回来的，不需要 cancel（因为 start 没发出去）
        }

        // 取消 nudge（双模式：nudgeId 优先，fallback 按 userId）
        const supabase = getSupabaseClient();
        if (!supabase) return;

        supabase.functions.invoke('background-nudge', {
          body: {
            action: 'cancel',
            nudgeId: nudgeIdRef.current, // 可能为 null（竞态），后端会 fallback 按 userId 取消
          },
        }).then(({ error }) => {
          if (error) {
            devWarn('[BackgroundNudge] Cancel failed:', error);
          } else {
            devLog('[BackgroundNudge] Cancelled');
          }
        }).catch((e) => {
          devWarn('[BackgroundNudge] Cancel error:', e);
        });

        nudgeIdRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // 清除防抖 timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // unmount 时也取消（fire and forget）
      if (nudgeIdRef.current) {
        const supabase = getSupabaseClient();
        if (supabase) {
          supabase.functions.invoke('background-nudge', {
            body: { action: 'cancel', nudgeId: nudgeIdRef.current },
          }).catch(() => {});
        }
        nudgeIdRef.current = null;
      }
    };
  }, [options.isSessionActive, options.taskId]);
}
