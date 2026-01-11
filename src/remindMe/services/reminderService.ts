import { type User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { Task, RecurrencePattern } from '../types';
import { notifyNativeTaskCreated, notifyNativeTaskDeleted, type TaskReminderData } from '../../utils/nativeTaskEvents';

/**
 * Database representation of a task (merged with reminder functionality)
 * 数据库中的 task 记录结构（已合并提醒功能）
 *
 * 注意：现在「是否完成」只通过 status 字段表示：
 * - 'pending'    = 未完成
 * - 'completed'  = 已完成
 * 之前的 completed_reminder 列已经从数据库中移除，避免重复状态源。
 */
interface TaskRecord {
  id: string;
  user_id: string;
  title: string; // 任务标题（对应 Task.text）
  description: string | null;
  time: string | null; // 提醒时间 (HH:mm)
  display_time: string | null; // 显示时间 (h:mm am/pm)
  reminder_date: string | null; // 提醒日期
  timezone: string | null; // 创建任务时的时区标识
  status: 'pending' | 'in_progress' | 'completed' | 'archived'; // 任务状态（task_status 枚举）
  task_type: 'todo' | 'routine' | 'routine_instance' | null; // 任务类型
  time_category: 'morning' | 'noon' | 'afternoon' | 'evening' | 'latenight' | null; // 时间分类
  called: boolean; // AI 是否已打电话
  is_recurring: boolean; // 是否重复
  recurrence_pattern: RecurrencePattern | null; // 重复模式
  recurrence_days: number[] | null; // 重复日期
  recurrence_end_date: string | null; // 重复结束日期
  parent_routine_id: string | null; // 父 routine 模板 ID（仅用于 routine_instance）
  created_at: string;
  updated_at: string;
  // Success metadata fields - 成功元数据字段
  completion_mood: 'proud' | 'relieved' | 'satisfied' | 'neutral' | null;
  difficulty_perception: 'easier_than_usual' | 'normal' | 'harder_than_usual' | null;
  overcame_resistance: boolean | null;
  actual_duration_minutes: number | null;
  personal_best_at_completion: number | null;
}

/**
 * 当浏览器无法识别时区或运行在非浏览器环境时使用的默认时区。
 */
const DEFAULT_TIMEZONE = 'UTC';

/**
 * 安全获取浏览器时区，失败时返回 null 让原生端或后端自行回退。
 *
 * @returns {string | null} IANA 时区字符串或 null
 */
const getBrowserTimezone = (): string | null => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone) {
        return timezone;
      }
    }
  } catch (error) {
    console.warn('⚠️ Timezone detection failed, fallback to null', error);
  }
  return null;
};

/**
 * 确保 public.users 表存在当前会话用户行，避免 tasks.user_id 外键约束报错。
 *
 * @param {User} user - Supabase Auth 返回的用户对象
 * @returns {Promise<boolean>} 成功确保存在返回 true，失败返回 false
 */
const ensureUserProfileExists = async (user: User): Promise<boolean> => {
  if (!supabase) return false;

  const { data: existingUser, error: queryError } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (queryError) {
    console.warn('⚠️ 检查 users 表时出错，尝试继续创建', queryError);
  }

  if (existingUser?.id) {
    return true;
  }

  const { error: upsertError } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      email: user.email ?? null,
      name: (user.user_metadata?.full_name as string) ?? null,
      picture_url: (user.user_metadata?.avatar_url as string) ?? null,
    }, { onConflict: 'id' });

  if (upsertError) {
    console.error('❌ 创建/同步 users 表记录失败', upsertError);
    return false;
  }

  return true;
};

/**
 * Convert database record to Task object
 * 将数据库记录转换为 Task 对象
 */
function dbToTask(record: TaskRecord): Task {
  return {
    id: record.id,
    text: record.title, // 数据库中的 title 对应 Task.text
    time: record.time || '',
    displayTime: record.display_time || (record.time ? parseTimeToString(record.time) : ''),
    date: record.reminder_date || undefined,
    // 前端的 completed 与数据库的 status 建立一一映射
    completed: record.status === 'completed',
    type: record.task_type || 'todo',
    category: record.time_category || undefined,
    called: record.called,
    isRecurring: record.is_recurring,
    timezone: record.timezone || undefined,
    recurrencePattern: record.recurrence_pattern || undefined,
    recurrenceDays: record.recurrence_days || undefined,
    recurrenceEndDate: record.recurrence_end_date || undefined,
    parentRoutineId: record.parent_routine_id || undefined,
    // Success metadata fields
    completionMood: record.completion_mood || undefined,
    difficultyPerception: record.difficulty_perception || undefined,
    overcameResistance: record.overcame_resistance ?? undefined,
    actualDurationMinutes: record.actual_duration_minutes ?? undefined,
    personalBestAtCompletion: record.personal_best_at_completion ?? undefined,
  };
}

/**
 * Convert Task object to database record
 * 将 Task 对象转换为数据库记录格式
 */
function taskToDb(task: Partial<Task>, userId: string): Partial<TaskRecord> {
  const timezone = task.timezone ?? getBrowserTimezone() ?? DEFAULT_TIMEZONE;

  return {
    user_id: userId,
    title: task.text, // Task.text 存储到数据库的 title 字段
    time: task.time || null,
    display_time: task.displayTime || null,
    reminder_date: task.date || null,
    timezone,
    // 如果传入了 completed，则根据布尔值设置 status；否则交给数据库默认值（pending）
    ...(task.completed !== undefined
      ? { status: task.completed ? 'completed' : 'pending' }
      : {}),
    task_type: task.type || null,
    time_category: task.category || null,
    called: task.called ?? false,
    is_recurring: task.isRecurring ?? false,
    recurrence_pattern: task.recurrencePattern || null,
    recurrence_days: task.recurrenceDays || null,
    recurrence_end_date: task.recurrenceEndDate || null,
    parent_routine_id: task.parentRoutineId || null,
  };
}

/**
 * Parse time string (HH:mm) to display format (h:mm am/pm)
 */
function parseTimeToString(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Convert Task object to native reminder data format
 * 将 Task 对象转换为原生提醒数据格式（用于 Android/iOS 桥接）
 */
export function taskToNativeReminder(task: Task, userId: string): TaskReminderData {
  return {
    id: task.id,
    user_id: userId,
    title: task.text,
    reminder_date: task.date || '',
    time: task.time || '',
    timezone: task.timezone || undefined,
    status: task.completed ? 'completed' : 'pending',
    called: task.called,
  };
}

/**
 * 获取用户本地日期（YYYY-MM-DD 格式）
 * 使用本地时间而非 UTC，避免跨时区时日期不匹配的问题
 */
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 判断指定日期和时间是否在未来
 * 用于检查 routine 实例是否应该被创建（只有时间未过的才应该创建）
 *
 * @param time - 时间字符串 (HH:mm 格式)
 * @param dateStr - 日期字符串 (YYYY-MM-DD 格式)
 * @returns 是否在未来
 */
function isTimeInFuture(time: string | null | undefined, dateStr: string): boolean {
  if (!time) return false;

  const [hours, minutes] = time.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);
  const reminderTime = new Date(year, month - 1, day, hours, minutes);

  return reminderTime.getTime() > Date.now();
}

/**
 * 判断任务是否应该触发原生提醒
 * 只有当任务有日期+时间，且时间在未来时才触发
 *
 * @param task - 任务对象
 * @returns 是否应该触发原生提醒
 */
function shouldTriggerNativeReminder(task: Task): boolean {
  if (!task.date || !task.time) return false;

  const [hours, minutes] = task.time.split(':').map(Number);
  const [year, month, day] = task.date.split('-').map(Number);
  const reminderTime = new Date(year, month - 1, day, hours, minutes);

  return reminderTime.getTime() > Date.now();
}

/**
 * Fetch all reminders for a user on a specific date
 * 获取用户在指定日期的所有提醒任务
 */
export async function fetchReminders(userId: string, date: string = getLocalDateString()): Promise<Task[]> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabase
    .from('tasks') // 使用 tasks 表而不是 reminders 表
    .select('*')
    .eq('user_id', userId)
    .eq('reminder_date', date) // 使用 reminder_date 字段
    .order('time', { ascending: true });

  if (error) {
    console.error('Error fetching reminders:', error);
    return [];
  }

  return (data as TaskRecord[]).map(dbToTask);
}

/**
 * Fetch all recurring reminders for a user
 * 获取用户的所有重复提醒任务
 */
export async function fetchRecurringReminders(userId: string): Promise<Task[]> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabase
    .from('tasks') // 使用 tasks 表
    .select('*')
    .eq('user_id', userId)
    .eq('is_recurring', true)
    .order('time', { ascending: true });

  if (error) {
    console.error('Error fetching recurring reminders:', error);
    return [];
  }

  return (data as TaskRecord[]).map(dbToTask);
}

/**
 * 根据任务 ID 获取单条任务
 * 用于在 URL 仅携带 taskId 时，确保能复用已有任务，避免创建临时任务
 *
 * @param {string} taskId - 任务 ID（UUID）
 * @param {string} userId - 当前登录用户 ID，用于额外的安全过滤
 * @returns {Promise<Task | null>} 找到返回任务，否则返回 null
 */
export async function fetchReminderById(taskId: string, userId: string): Promise<Task | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching reminder by id:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return dbToTask(data as TaskRecord);
}

/**
 * Create a new reminder
 * 创建新的提醒任务
 *
 * @param {Omit<Task, 'id' | 'displayTime'>} task - 待创建的任务数据，会自动补全时区信息。
 * @param {string} userId - 当前登录用户的 Supabase ID；若与会话中的 userId 不一致，将优先使用会话 userId 以满足外键。
 * @returns {Promise<Task | null>} 创建成功返回任务对象，失败返回 null。
 */
export async function createReminder(task: Omit<Task, 'id' | 'displayTime'>, userId: string): Promise<Task | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  // 由于 tasks.user_id 存在外键，必须使用 Supabase 会话中的真实用户 ID；若本地传入的 userId 与会话不一致，则以会话为准。
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const sessionUser = userData?.user;
  if (userError) {
    console.warn('⚠️ Failed to read Supabase user', userError);
  }
  if (!sessionUser) {
    console.error('❌ Supabase 会话缺失，无法创建任务（需要有效的 auth user 以满足外键约束）');
    return null;
  }
  if (userId && sessionUser.id !== userId) {
    console.warn('⚠️ Supabase 会话 userId 与传入的 userId 不一致，将使用会话 userId 以满足 FK 约束');
  }

  // 确保 public.users 表有对应记录，避免 tasks.user_id 外键冲突
  const ensured = await ensureUserProfileExists(sessionUser);
  if (!ensured) {
    console.error('❌ 无法同步用户到 users 表，任务创建已中止');
    return null;
  }

  const effectiveUserId = sessionUser.id;

  const dbRecord = taskToDb(task, effectiveUserId);

  const { data, error } = await supabase
    .from('tasks') // 使用 tasks 表
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase types not generated
    .insert([dbRecord] as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating reminder:', error);
    return null;
  }

  const createdTask = dbToTask(data as TaskRecord);

  // 🆕 自动触发原生提醒事件（仅当提醒时间在未来时）
  if (createdTask && shouldTriggerNativeReminder(createdTask)) {
    notifyNativeTaskCreated(taskToNativeReminder(createdTask, effectiveUserId));
  }

  return createdTask;
}

/**
 * Update an existing reminder
 * 更新现有的提醒任务
 *
 * 安全性：只允许当前登录用户更新自己的任务，防止越权操作
 */
export async function updateReminder(id: string, updates: Partial<Task>): Promise<Task | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  // 安全验证：获取当前登录用户
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const sessionUser = userData?.user;
  if (userError || !sessionUser) {
    console.error('❌ 更新任务失败：用户未登录或会话已过期');
    return null;
  }

  // Convert Task updates to database format, excluding user_id
  // 将 Task 更新转换为数据库格式（不包括 user_id）
  const dbUpdates: Partial<TaskRecord> = {};

  if (updates.text !== undefined) dbUpdates.title = updates.text;
  if (updates.time !== undefined) dbUpdates.time = updates.time;
  if (updates.displayTime !== undefined) dbUpdates.display_time = updates.displayTime;
  if (updates.date !== undefined) dbUpdates.reminder_date = updates.date;
  if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone || null;
  // 将前端的 completed 映射到 status 字段
  if (updates.completed !== undefined) {
    dbUpdates.status = updates.completed ? 'completed' : 'pending';
  }
  if (updates.type !== undefined) dbUpdates.task_type = updates.type;
  if (updates.category !== undefined) dbUpdates.time_category = updates.category || null;
  if (updates.called !== undefined) dbUpdates.called = updates.called;
  if (updates.isRecurring !== undefined) dbUpdates.is_recurring = updates.isRecurring;
  if (updates.recurrencePattern !== undefined) dbUpdates.recurrence_pattern = updates.recurrencePattern || null;
  if (updates.recurrenceDays !== undefined) dbUpdates.recurrence_days = updates.recurrenceDays || null;
  if (updates.recurrenceEndDate !== undefined) dbUpdates.recurrence_end_date = updates.recurrenceEndDate || null;

  // Success metadata fields - 成功元数据字段
  if (updates.completionMood !== undefined) dbUpdates.completion_mood = updates.completionMood || null;
  if (updates.difficultyPerception !== undefined) dbUpdates.difficulty_perception = updates.difficultyPerception || null;
  if (updates.overcameResistance !== undefined) dbUpdates.overcame_resistance = updates.overcameResistance ?? null;
  if (updates.actualDurationMinutes !== undefined) dbUpdates.actual_duration_minutes = updates.actualDurationMinutes ?? null;
  if (updates.personalBestAtCompletion !== undefined) dbUpdates.personal_best_at_completion = updates.personalBestAtCompletion ?? null;

  // 安全性：添加 user_id 条件，确保只能更新属于当前用户的任务
  const { data, error } = await supabase
    .from('tasks')
    .update(dbUpdates)
    .eq('id', id)
    .eq('user_id', sessionUser.id) // 关键：验证任务归属
    .select()
    .single();

  if (error) {
    // 如果找不到记录，可能是任务不存在或不属于当前用户
    if (error.code === 'PGRST116') {
      console.error('❌ 更新任务失败：任务不存在或无权限操作');
    } else {
      console.error('Error updating reminder:', error);
    }
    return null;
  }

  const updatedTask = dbToTask(data as TaskRecord);

  // 🆕 如果修改了时间，重新设置原生提醒（仅当提醒时间在未来时）
  // 同时重置 called 状态，让系统将其视为新的提醒请求
  if (updatedTask && (updates.date !== undefined || updates.time !== undefined)) {
    // 🔧 关键修复：当用户修改了提醒时间时，重置 called 为 false
    // 这样即使任务之前已触发过电话提醒并被挂断，系统也会根据新时间再次触发
    if (shouldTriggerNativeReminder(updatedTask) && updates.called === undefined) {
      // 只有在未来时间且用户没有显式设置 called 时才重置
      const { error: resetCalledError } = await supabase
        .from('tasks')
        .update({ called: false })
        .eq('id', id)
        .eq('user_id', sessionUser.id);

      if (resetCalledError) {
        console.warn('⚠️ Failed to reset called status:', resetCalledError);
      } else {
        console.log('✅ Reset called=false for task after time change:', id);
        // 更新本地对象以反映数据库变化
        updatedTask.called = false;
      }

      // 从数据库记录中获取 user_id
      const userId = (data as TaskRecord).user_id;
      notifyNativeTaskCreated(taskToNativeReminder(updatedTask, userId));
    }
  }

  return updatedTask;
}

/**
 * Delete a reminder
 * 删除提醒任务
 *
 * 安全性：只允许当前登录用户删除自己的任务，防止越权操作
 */
export async function deleteReminder(id: string): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  // 安全验证：获取当前登录用户
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const sessionUser = userData?.user;
  if (userError || !sessionUser) {
    console.error('❌ 删除任务失败：用户未登录或会话已过期');
    return false;
  }

  // 安全性：添加 user_id 条件，确保只能删除属于当前用户的任务
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', sessionUser.id) // 关键：验证任务归属
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting reminder:', error);
    return false;
  }

  // 如果没有删除任何记录，说明任务不存在或不属于当前用户
  if (!data) {
    console.error('❌ 删除任务失败：任务不存在或无权限操作');
    return false;
  }

  // 删除成功后取消原生提醒
  notifyNativeTaskDeleted(id);

  return true;
}

/**
 * Toggle reminder completion status
 * 切换提醒任务的完成状态
 *
 * - 完成任务时：取消原生闹钟提醒
 * - 取消完成时：恢复原生闹钟提醒
 */
export async function toggleReminderCompletion(id: string, completed: boolean): Promise<Task | null> {
  const result = await updateReminder(id, { completed });

  if (result) {
    if (completed) {
      // 任务完成，取消原生提醒
      notifyNativeTaskDeleted(id);
    } else {
      // 取消完成，恢复原生提醒（仅当提醒时间在未来时）
      if (shouldTriggerNativeReminder(result)) {
        // 获取 userId 用于恢复提醒
        const { data: userData } = await supabase?.auth.getUser() ?? { data: null };
        const userId = userData?.user?.id;
        if (userId) {
          notifyNativeTaskCreated(taskToNativeReminder(result, userId));
        }
      }
    }
  }

  return result;
}

/**
 * Mark reminder as called
 * 标记提醒任务为"已打电话"
 */
export async function markReminderAsCalled(id: string): Promise<Task | null> {
  return updateReminder(id, { called: true });
}

/**
 * Fetch completed 'todo' tasks for a user
 * 获取用户已完成的普通任务（非 Routine），用于 Done 列表展示
 */
export async function fetchCompletedTodoTasks(userId: string): Promise<Task[]> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('task_type', 'todo')
    .order('reminder_date', { ascending: false })
    .order('time', { ascending: false });

  if (error) {
    console.error('Error fetching completed todo tasks:', error);
    return [];
  }

  return (data as TaskRecord[]).map(dbToTask);
}

/**
 * Generate today's instances for all routine templates
 * 为所有 routine 模板生成今天的实例
 *
 * 这个函数是幂等的，重复调用不会创建重复的实例
 *
 * @param userId - 用户 ID
 * @returns 新创建的 routine 实例数组
 */
export async function generateTodayRoutineInstances(userId: string): Promise<Task[]> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  const today = getLocalDateString();

  try {
    // 1. 获取所有 routine 模板
    const { data: routineTemplates, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('task_type', 'routine')
      .eq('is_recurring', true);

    if (fetchError) {
      console.error('Failed to fetch routine templates:', fetchError);
      return [];
    }

    if (!routineTemplates || routineTemplates.length === 0) {
      return [];
    }

    // 2. 检查今天是否已经生成过实例
    const { data: existingInstances } = await supabase
      .from('tasks')
      .select('parent_routine_id')
      .eq('user_id', userId)
      .eq('reminder_date', today)
      .eq('task_type', 'routine_instance');

    const existingParentIds = new Set(
      existingInstances?.map(i => i.parent_routine_id).filter(Boolean) || []
    );

    // 3. 为还没有今日实例的 routine 生成实例
    // 🔧 修复：跳过今天时间已过的任务，避免 pg_cron 立即触发推送
    const instancesToCreate = routineTemplates
      .filter(template => {
        // 跳过已有今日实例的
        if (existingParentIds.has(template.id)) return false;
        // 🆕 跳过今天时间已过的任务（避免立即触发电话）
        if (!isTimeInFuture(template.time, today)) {
          console.log(`⏭️ Skipping routine "${template.title}" - time ${template.time} has passed for today`);
          return false;
        }
        return true;
      })
      .map(template => ({
        user_id: userId,
        title: template.title,
        time: template.time,
        display_time: template.display_time,
        reminder_date: today,
        timezone: template.timezone,
        status: 'pending' as const,
        task_type: 'routine_instance' as const,
        time_category: template.time_category,
        called: false,
        is_recurring: false,
        parent_routine_id: template.id,
      }));

    if (instancesToCreate.length === 0) {
      return [];
    }

    // 4. 批量插入
    const { data: newInstances, error: insertError } = await supabase
      .from('tasks')
      .insert(instancesToCreate)
      .select();

    if (insertError) {
      console.error('Failed to create routine instances:', insertError);
      return [];
    }

    const createdTasks = (newInstances as TaskRecord[]).map(dbToTask);

    // 5. 🆕 为新创建的实例设置原生通知（仅当提醒时间在未来时）
    createdTasks.forEach(task => {
      if (shouldTriggerNativeReminder(task)) {
        notifyNativeTaskCreated(taskToNativeReminder(task, userId));
      }
    });

    console.log(`✅ Generated ${createdTasks.length} routine instances for ${today}`);
    return createdTasks;
  } catch (error) {
    console.error('Error generating routine instances:', error);
    return [];
  }
}
