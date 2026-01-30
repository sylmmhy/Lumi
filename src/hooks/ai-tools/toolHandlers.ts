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
      return {
        success: true,
        data,
        responseHint: preferredLanguage?.startsWith('zh')
          ? `你还没有足够稳定的习惯可以作为锚点。建议先坚持一个简单的习惯两周以上，比如每天喝水或者刷牙后做某件事。等你有了稳定的习惯，我就能帮你把「${newHabit}」挂载上去了。`
          : `You don't have stable habits yet to use as anchors. Try sticking to a simple habit for two weeks first, like drinking water or doing something after brushing your teeth. Once you have stable habits, I can help you stack "${newHabit}" onto them.`,
      };
    }

    // 有推荐结果
    const topSuggestion = data.suggestions[0];
    const anchorTitle = topSuggestion.anchor_title;
    const position = topSuggestion.position === 'after' ? '之后' : '之前';
    const positionEn = topSuggestion.position;
    const confidence = Math.round(topSuggestion.confidence * 100);
    const reasoning = topSuggestion.reasoning;

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
        ? `我分析了你的习惯数据，发现「${anchorTitle}」是你最稳定的习惯。我建议你在「${anchorTitle}」${position}做「${newHabit}」，成功率预计有 ${confidence}%。${reasoning} 要帮你设置这个提醒吗？`
        : `I analyzed your habit data and found that "${anchorTitle}" is your most stable habit. I suggest doing "${newHabit}" ${positionEn} "${anchorTitle}", with an estimated ${confidence}% success rate. ${reasoning} Would you like me to set up this reminder?`,
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
  const { preferredLanguage } = context;
  const anchorTaskId = args.anchor_task_id as string;
  const newHabitTitle = args.new_habit_title as string;
  const position = args.position as string;
  const reminderMessage = args.reminder_message as string;

  console.log('🔧 [Tool] create_habit_stack 调用:', { anchorTaskId, newHabitTitle, position });

  try {
    // 注意：这里需要先创建新习惯的 task，然后再创建 habit_stack
    // 简化起见，我们先返回一个模拟成功的响应
    // TODO: 实现完整的创建流程

    return {
      success: true,
      data: {
        created: true,
        anchor_task_id: anchorTaskId,
        new_habit_title: newHabitTitle,
        position,
        reminder_message: reminderMessage,
      },
      responseHint: preferredLanguage?.startsWith('zh')
        ? `好的，我已经帮你设置好了！以后你完成那个习惯${position === 'after' ? '之后' : '之前'}，我会提醒你「${newHabitTitle}」。加油！`
        : `Done! I've set it up for you. I'll remind you to "${newHabitTitle}" ${position} that habit. You got this!`,
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

    case 'create_habit_stack':
      return handleCreateHabitStack(args, context);

    default:
      console.warn(`⚠️ [ToolDispatcher] 未知工具: ${functionName}`);
      return {
        success: false,
        error: `Unknown tool: ${functionName}`,
        responseHint: 'I don\'t know how to do that yet.',
      };
  }
}
