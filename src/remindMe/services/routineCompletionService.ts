import { supabase } from '../../lib/supabase';
import { getLocalDateString } from '../../utils/timeUtils';

/**
 * Routine 任务完成记录接口
 */
export interface RoutineCompletion {
  id: string;
  userId: string;
  taskId: string;
  completionDate: string; // YYYY-MM-DD
  createdAt: string;
}

/**
 * 数据库记录格式
 */
interface RoutineCompletionRecord {
  id: string;
  user_id: string;
  task_id: string;
  completion_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * 将数据库记录转换为前端格式
 */
function dbToCompletion(record: RoutineCompletionRecord): RoutineCompletion {
  return {
    id: record.id,
    userId: record.user_id,
    taskId: record.task_id,
    completionDate: record.completion_date,
    createdAt: record.created_at,
  };
}

/**
 * 标记 Routine 任务在指定日期完成
 * 
 * @param userId - 用户 ID
 * @param taskId - 任务 ID
 * @param date - 完成日期 (YYYY-MM-DD)，默认为今天
 * @returns 完成记录，如果失败则返回 null
 */
export async function markRoutineComplete(
  userId: string,
  taskId: string,
  date: string = getLocalDateString()
): Promise<RoutineCompletion | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  const { data, error } = await supabase
    .from('routine_completions')
    .insert([
      {
        user_id: userId,
        task_id: taskId,
        completion_date: date,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error marking routine complete:', error);
    return null;
  }

  return dbToCompletion(data as RoutineCompletionRecord);
}

/**
 * 取消 Routine 任务在指定日期的完成状态
 * 
 * @param userId - 用户 ID
 * @param taskId - 任务 ID
 * @param date - 完成日期 (YYYY-MM-DD)，默认为今天
 * @returns 是否成功
 */
export async function unmarkRoutineComplete(
  userId: string,
  taskId: string,
  date: string = getLocalDateString()
): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  const { error } = await supabase
    .from('routine_completions')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('completion_date', date);

  if (error) {
    console.error('Error unmarking routine complete:', error);
    return false;
  }

  return true;
}

/**
 * 切换 Routine 任务在指定日期的完成状态
 * 如果已完成则取消，如果未完成则标记为完成
 * 
 * @param userId - 用户 ID
 * @param taskId - 任务 ID
 * @param date - 完成日期 (YYYY-MM-DD)，默认为今天
 * @returns 新的完成状态：true = 已完成，false = 未完成
 */
export async function toggleRoutineCompletion(
  userId: string,
  taskId: string,
  date: string = getLocalDateString()
): Promise<boolean> {
  // 先检查是否已完成
  const isCompleted = await isRoutineCompletedOnDate(userId, taskId, date);

  if (isCompleted) {
    // 如果已完成，则取消
    await unmarkRoutineComplete(userId, taskId, date);
    return false;
  } else {
    // 如果未完成，则标记为完成
    await markRoutineComplete(userId, taskId, date);
    return true;
  }
}

/**
 * 检查 Routine 任务在指定日期是否已完成
 * 
 * @param userId - 用户 ID
 * @param taskId - 任务 ID
 * @param date - 完成日期 (YYYY-MM-DD)，默认为今天
 * @returns 是否已完成
 */
export async function isRoutineCompletedOnDate(
  userId: string,
  taskId: string,
  date: string = getLocalDateString()
): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  const { data, error } = await supabase
    .from('routine_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('completion_date', date)
    .maybeSingle();

  if (error) {
    console.error('Error checking routine completion:', error);
    return false;
  }

  return !!data;
}

/**
 * 获取指定 Routine 任务的所有完成记录
 * 
 * @param userId - 用户 ID
 * @param taskId - 任务 ID
 * @param startDate - 开始日期 (可选)
 * @param endDate - 结束日期 (可选)
 * @returns 完成记录数组
 */
export async function getRoutineCompletions(
  userId: string,
  taskId: string,
  startDate?: string,
  endDate?: string
): Promise<RoutineCompletion[]> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  let query = supabase
    .from('routine_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .order('completion_date', { ascending: true });

  if (startDate) {
    query = query.gte('completion_date', startDate);
  }

  if (endDate) {
    query = query.lte('completion_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching routine completions:', error);
    return [];
  }

  return (data as RoutineCompletionRecord[]).map(dbToCompletion);
}

/**
 * 获取用户所有 Routine 任务的完成记录
 * 用于生成整体的打卡日历
 * 
 * @param userId - 用户 ID
 * @param startDate - 开始日期 (可选)
 * @param endDate - 结束日期 (可选)
 * @returns 按任务分组的完成记录
 */
export async function getAllRoutineCompletions(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<Map<string, Set<string>>> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return new Map();
  }

  let query = supabase
    .from('routine_completions')
    .select('task_id, completion_date')
    .eq('user_id', userId)
    .order('completion_date', { ascending: true });

  if (startDate) {
    query = query.gte('completion_date', startDate);
  }

  if (endDate) {
    query = query.lte('completion_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching all routine completions:', error);
    return new Map();
  }

  // 将结果组织成 Map<taskId, Set<completionDate>>
  const completionsMap = new Map<string, Set<string>>();

  for (const record of data as { task_id: string; completion_date: string }[]) {
    if (!completionsMap.has(record.task_id)) {
      completionsMap.set(record.task_id, new Set());
    }
    completionsMap.get(record.task_id)!.add(record.completion_date);
  }

  return completionsMap;
}

