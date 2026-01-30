import { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';

export interface ComfortZoneState {
  /** 目标范围（最早/最晚） */
  targetRange: { earliest: string; latest: string };
  /** 当前目标时间 */
  currentTarget: string;
  /** 是否在舒适区内（需传入实际完成时间后判断） */
  isWithinZone: boolean;
  /** 距离最终目标的进度（0-1） */
  progressToUltimate: number;
}

/**
 * 时间字符串转分钟数
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 计算舒适区范围
 */
function getComfortZoneRange(targetTime: string, comfortZoneMinutes = 30): { earliest: string; latest: string } {
  const half = Math.round(comfortZoneMinutes / 2);
  const targetMinutes = timeToMinutes(targetTime);
  const earliest = targetMinutes - half;
  const latest = targetMinutes + half;
  const format = (minutes: number) => {
    let normalized = minutes;
    if (normalized < 0) normalized += 24 * 60;
    if (normalized >= 24 * 60) normalized -= 24 * 60;
    const hours = Math.floor(normalized / 60);
    const mins = normalized % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };
  return { earliest: format(earliest), latest: format(latest) };
}

/**
 * Comfort Zone Hook
 *
 * @description 提供目标时间范围与舒适区判断能力
 * @param goalId 目标 ID
 */
export function useComfortZone(goalId: string) {
  const [state, setState] = useState<ComfortZoneState | null>(null);

  useEffect(() => {
    if (!goalId) return;

    const fetchGoal = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('goals')
        .select('current_target_time, target_time_earliest, target_time_latest, ultimate_target_time, baseline_time, comfort_zone_minutes')
        .eq('id', goalId)
        .single();

      if (error || !data) return;

      const current = timeToMinutes(data.current_target_time);
      const ultimate = data.ultimate_target_time ? timeToMinutes(data.ultimate_target_time) : current;
      const baseline = data.baseline_time ? timeToMinutes(data.baseline_time) : current;
      const progressToUltimate = baseline === ultimate
        ? 1
        : (baseline - current) / (baseline - ultimate);

      const range = data.target_time_earliest && data.target_time_latest
        ? { earliest: data.target_time_earliest, latest: data.target_time_latest }
        : getComfortZoneRange(data.current_target_time, data.comfort_zone_minutes ?? 30);

      setState({
        targetRange: range,
        currentTarget: data.current_target_time,
        isWithinZone: false,
        progressToUltimate: Number(Math.min(1, Math.max(0, progressToUltimate)).toFixed(3)),
      });
    };

    void fetchGoal();
  }, [goalId]);

  /**
   * 判断实际时间是否落在舒适区
   * @param actualTime 实际完成时间（HH:mm）
   */
  const checkIfWithinZone = useCallback((actualTime: string) => {
    if (!state) return false;
    const actual = timeToMinutes(actualTime);
    const earliest = timeToMinutes(state.targetRange.earliest);
    const latest = timeToMinutes(state.targetRange.latest);
    return actual >= earliest && actual <= latest;
  }, [state]);

  return { state, checkIfWithinZone };
}
