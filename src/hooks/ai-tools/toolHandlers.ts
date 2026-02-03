/**
 * AI Tools - 工具调用处理器
 * 
 * 处理 Gemini Live 2.5 的 Function Calling 请求，
 * 调用后端 Edge Functions 并返回结果
 */

import type { ToolCallResult, ToolCallContext } from './toolDefinitions';

// ============================================================================
// 工具处理器
// ============================================================================

/**
 * 处理 suggest_habit_stack 工具调用
 */
export async function handleSuggestHabitStack(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { userId, supabaseUrl, supabaseAnonKey, preferredLanguage } = context;
  const newHabit = args.new_habit as string;
  const durationMinutes = (args.duration_minutes as number) || 5;

  console.log('🔧 [Tool] suggest_habit_stack 调用:', { newHabit, durationMinutes });

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/suggest-habit-stack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        new_habit: newHabit,
        duration_minutes: durationMinutes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API 调用失败');
    }

    const data = await response.json();
    console.log('✅ [Tool] suggest_habit_stack 结果:', data);

    // 构建适合语音输出的响应
    if (!data.success) {
      return {
        success: false,
        error: data.error || '推荐失败',
        responseHint: data.message || '抱歉，我暂时无法分析你的习惯数据',
      };
    }

    if (data.suggestions?.length === 0) {
      // 检查是否是因为没有锚点习惯
      if (data.noAnchor) {
        return {
          success: true,
          data: {
            ...data,
            needsTimeInput: true, // 标记需要用户输入时间
            habitName: data.newHabitName || newHabit, // 传递习惯名称
          },
          responseHint: preferredLanguage?.startsWith('zh')
            ? `好的，我帮你设置「${newHabit}」的每日提醒。你想每天几点提醒你呢？`
            : `Sure, I'll set up a daily reminder for "${newHabit}". What time would you like me to remind you each day?`,
        };
      }
      
      // 有锚点但没有合适的挂载点
      return {
        success: true,
        data: {
          ...data,
          needsTimeInput: true,
          habitName: newHabit,
        },
        responseHint: preferredLanguage?.startsWith('zh')
          ? `暂时没找到特别合适的挂载点。要不我帮你设置一个每日提醒？你想几点提醒？`
          : `I couldn't find a perfect spot to stack this habit. Want me to set up a standalone daily reminder instead? What time works for you?`,
      };
    }

    // 有推荐结果
    const topSuggestion = data.suggestions[0];
    const anchorTitle = topSuggestion.anchor_title;
    const position = topSuggestion.position === 'after' ? '之后' : '之前';
    const positionEn = topSuggestion.position;
    
    // 获取锚点习惯的统计数据
    const anchor = data.anchors?.find((a: { task_id: string }) => a.task_id === topSuggestion.anchor_task_id);
    const completionRate = anchor?.completion_rate || 85;
    const avgTime = anchor?.avg_time || '';
    
    // 构建更专业的说明
    const timeInfo = avgTime ? `你通常在 ${avgTime} 左右完成它。` : '';
    const scienceReason = topSuggestion.position === 'after' 
      ? `刚完成一件事时大脑会释放多巴胺，这时开始新习惯更容易坚持。`
      : `在固定习惯前做新事，可以借助已有的仪式感帮助记忆。`;

    return {
      success: true,
      data: {
        ...data,
        // 提取关键信息供后续 create_habit_stack 使用
        recommended: {
          anchor_task_id: topSuggestion.anchor_task_id,
          anchor_title: anchorTitle,
          position: topSuggestion.position,
          reminder_text: topSuggestion.reminder_text,
        },
      },
      responseHint: preferredLanguage?.startsWith('zh')
        ? `我分析了你过去两周的数据，「${anchorTitle}」是你最稳定的习惯，完成率达到 ${completionRate}%。${timeInfo}我建议你在「${anchorTitle}」${position}做「${newHabit}」。${scienceReason}要帮你设置这个提醒吗？`
        : `I analyzed your data from the past two weeks. "${anchorTitle}" is your most stable habit with a ${completionRate}% completion rate. ${avgTime ? `You usually complete it around ${avgTime}. ` : ''}I suggest doing "${newHabit}" ${positionEn} "${anchorTitle}". When you finish a task, your brain releases dopamine, making it easier to start a new habit. Would you like me to set this up?`,
    };

  } catch (error) {
    console.error('❌ [Tool] suggest_habit_stack 错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      responseHint: preferredLanguage?.startsWith('zh')
        ? '抱歉，分析习惯数据时出了点问题，请稍后再试'
        : 'Sorry, there was an issue analyzing your habit data. Please try again later.',
    };
  }
}

/**
 * 处理 get_daily_report 工具调用
 */
export async function handleGetDailyReport(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { userId, supabaseUrl, supabaseAnonKey, preferredLanguage } = context;
  const date = (args.date as string) || new Date().toISOString().split('T')[0];

  console.log('🔧 [Tool] get_daily_report 调用:', { date });

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-daily-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        date,
        force: false, // 如果已有报告则返回缓存
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API 调用失败');
    }

    const data = await response.json();
    console.log('✅ [Tool] get_daily_report 结果:', data);

    if (!data.success) {
      return {
        success: false,
        error: data.error || '获取报告失败',
        responseHint: data.message || '抱歉，暂时无法获取你的报告',
      };
    }

    // 构建语音友好的响应
    const report = data.report;
    const score = report?.total_score || 0;
    const completed = report?.goals_completed || 0;
    const total = report?.goals_total || 0;
    const aiSummary = report?.ai_summary || '';

    return {
      success: true,
      data,
      responseHint: preferredLanguage?.startsWith('zh')
        ? `今天的报告来啦！你完成了 ${completed} 个目标，共 ${total} 个，总分 ${score} 分。${aiSummary}`
        : `Here's your daily report! You completed ${completed} out of ${total} goals, with a total score of ${score}. ${aiSummary}`,
    };

  } catch (error) {
    console.error('❌ [Tool] get_daily_report 错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      responseHint: preferredLanguage?.startsWith('zh')
        ? '抱歉，获取报告时出了点问题'
        : 'Sorry, there was an issue getting your report.',
    };
  }
}

/**
 * 处理 create_habit_stack 工具调用
 */
export async function handleCreateHabitStack(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { userId, supabaseUrl, supabaseAnonKey, preferredLanguage } = context;
  const anchorTaskId = args.anchor_task_id as string;
  const newHabitTitle = args.new_habit_title as string;
  const position = args.position as string;
  const reminderMessage = args.reminder_message as string;

  console.log('🔧 [Tool] create_habit_stack 调用:', { anchorTaskId, newHabitTitle, position });

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-habit-stack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        userId,
        anchor_task_id: anchorTaskId,
        new_habit_title: newHabitTitle,
        position,
        reminder_message: reminderMessage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API 调用失败');
    }

    const data = await response.json();
    console.log('✅ [Tool] create_habit_stack 结果:', data);

    return {
      success: true,
      data,
      responseHint: preferredLanguage?.startsWith('zh')
        ? `好的，我已经帮你设置好了！以后你完成「${data.anchorTitle}」${position === 'after' ? '之后' : '之前'}，我会提醒你「${newHabitTitle}」。加油！`
        : `Done! I'll remind you to "${newHabitTitle}" ${position} "${data.anchorTitle}". You got this!`,
    };

  } catch (error) {
    console.error('❌ [Tool] create_habit_stack 错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      responseHint: preferredLanguage?.startsWith('zh')
        ? '抱歉，创建提醒时出了点问题'
        : 'Sorry, there was an issue setting up the reminder.',
    };
  }
}

// ============================================================================
// 统一调度器
// ============================================================================

/**
 * 处理所有工具调用的统一入口
 */
export async function handleToolCall(
  functionName: string,
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  console.log(`🔧 [ToolDispatcher] 收到工具调用: ${functionName}`, args);

  switch (functionName) {
    case 'suggest_habit_stack':
      return handleSuggestHabitStack(args, context);

    case 'get_daily_report':
      return handleGetDailyReport(args, context);

    case 'save_goal_plan':
      return handleSaveGoalPlan(args, context);

    case 'create_habit_stack':
      return handleCreateHabitStack(args, context);

    case 'create_simple_routine':
      return handleCreateSimpleRoutine(args, context);

    default:
      console.warn(`⚠️ [ToolDispatcher] 未知工具: ${functionName}`);
      return {
        success: false,
        error: `Unknown tool: ${functionName}`,
        responseHint: 'I don\'t know how to do that yet.',
      };
  }
}

/**
 * 处理 save_goal_plan 工具调用
 */
export async function handleSaveGoalPlan(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { userId, supabaseUrl, supabaseAnonKey, preferredLanguage } = context;
  
  console.log('🔧 [Tool] save_goal_plan 调用:', args);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/save-goal-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        userId,
        ...args,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API 调用失败');
    }

    const data = await response.json();
    console.log('✅ [Tool] save_goal_plan 结果:', data);

    return {
      success: true,
      data,
      responseHint: preferredLanguage?.startsWith('zh')
        ? `好的，已经帮你保存了！我会按时提醒你～`
        : `Done! I've saved your plan. I'll remind you on time.`,
    };

  } catch (error) {
    console.error('❌ [Tool] save_goal_plan 错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      responseHint: '抱歉，保存计划时出了点问题',
    };
  }
}

/**
 * 处理 create_simple_routine 工具调用
 * 直接创建一个独立的每日提醒任务
 */
export async function handleCreateSimpleRoutine(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const { userId, supabaseUrl, supabaseAnonKey, preferredLanguage } = context;
  const habitName = args.habit_name as string;
  const reminderTime = args.reminder_time as string;
  const durationMinutes = (args.duration_minutes as number) || 5;

  console.log('🛠️ [Tool] create_simple_routine 调用:', { habitName, reminderTime });

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-simple-routine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        userId,
        habit_name: habitName,
        reminder_time: reminderTime,
        duration_minutes: durationMinutes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API 调用失败');
    }

    const data = await response.json();
    console.log('✅ [Tool] create_simple_routine 结果:', data);

    return {
      success: true,
      data,
      responseHint: preferredLanguage?.startsWith('zh')
        ? `好的，已经设置好了！我会每天 ${reminderTime} 提醒你「${habitName}」～`
        : `Done! I'll remind you to "${habitName}" every day at ${reminderTime}.`,
    };

  } catch (error) {
    console.error('❌ [Tool] create_simple_routine 错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      responseHint: preferredLanguage?.startsWith('zh')
        ? '抱歉，创建提醒时出了点问题'
        : 'Sorry, there was an issue creating the reminder.',
    };
  }
}
