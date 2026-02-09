import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * 周行为报告数据结构
 */
export interface WeeklyBehaviorReport {
  id: string;
  period_start: string;
  period_end: string;
  summary: {
    tasks_completed?: number;
    tasks_total?: number;
    completion_rate?: number;
    focus_duration_minutes?: number;
    habit_streak_days?: number;
  };
  user_profile?: {
    persona_type?: string;
    key_traits?: string[];
    strengths?: string[];
    challenges?: string[];
  };
  insights?: Array<{
    observation: string;
    implication: string;
  }>;
  recommendations?: Array<{
    action: string;
    reason: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
  alerts?: Array<{
    need_attention: boolean;
    reason: string;
    suggested_intervention?: string;
  }> | {
    need_attention: boolean;
    reason: string;
    suggested_intervention?: string;
  };
  push_title?: string;
  push_body?: string;
  analyzed_at?: string;
  pushed_at?: string;
  opened_at?: string;
}

/**
 * Hook：获取用户最新的周行为报告
 */
export const useWeeklyBehaviorReport = (userId: string | null) => {
  const [report, setReport] = useState<WeeklyBehaviorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[WeeklyBehaviorReport] 开始查询，userId:', userId);

        // 获取最新的周报
        const { data, error: queryError } = await supabase
          .from('user_behavior_insights')
          .select('*')
          .eq('user_id', userId)
          .eq('period_type', 'weekly')
          .order('period_start', { ascending: false })
          .limit(1)
          .single();

        if (cancelled) return;

        console.log('[WeeklyBehaviorReport] 查询结果:', { data, error: queryError });

        if (queryError) {
          if (queryError.code === 'PGRST116') {
            // 没有数据
            console.log('[WeeklyBehaviorReport] 没有数据 (PGRST116)');
            setReport(null);
            setError(null);
          } else {
            setError(queryError.message);
            console.error('[WeeklyBehaviorReport] 查询失败:', queryError);
          }
        } else if (data) {
          console.log('[WeeklyBehaviorReport] 查询成功，报告:', data);
          setReport(data as WeeklyBehaviorReport);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching weekly behavior report:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchReport();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { report, loading, error };
};
