import { getSupabaseClient } from './supabase';
import { devLog } from '../utils/devLog';
import type { AICoachMessage } from '../hooks/useAICoachSession';

/**
 * 保存 AI 教练会话记忆到 Mem0
 *
 * 从 handleEndCall 和 handleEndAICoachSession 中提取的公共逻辑。
 * 调用 Supabase Edge Function `memory-extractor` 提取并保存记忆。
 *
 * @param params.messages - AI 会话消息快照
 * @param params.taskDescription - 当前任务描述
 * @param params.userId - 用户 ID
 * @param params.taskCompleted - 任务是否已完成
 * @param params.usedTime - 已用时间（秒），仅任务完成时需要
 * @param params.actualDurationMinutes - 实际时长（分钟），仅任务完成时需要
 */
export async function saveSessionMemory(params: {
    messages: AICoachMessage[];
    taskDescription: string;
    userId: string | null;
    taskCompleted: boolean;
    usedTime?: number;
    actualDurationMinutes?: number;
}): Promise<void> {
    const { messages, taskDescription, userId, taskCompleted, usedTime, actualDurationMinutes } = params;
    const label = taskCompleted ? '记忆保存-完成' : '记忆保存';

    try {
        devLog(`🧠 [${label}] 开始后台保存记忆...`);
        devLog(`🧠 [${label}] 消息快照数量:`, messages.length);
        devLog(`🧠 [${label}] 用户ID:`, userId);

        if (messages.length === 0 || !userId) {
            devLog(`⚠️ [${label}] 跳过：消息为空或用户ID为空`);
            return;
        }

        const supabaseClient = getSupabaseClient();
        devLog(`🧠 [${label}] Supabase 客户端:`, supabaseClient ? '已获取' : '为空');

        if (!supabaseClient) {
            devLog(`⚠️ [${label}] 跳过：Supabase 客户端为空`);
            return;
        }

        const realMessages = messages.filter(msg => !msg.isVirtual);
        devLog(`🧠 [${label}] 真实消息数量:`, realMessages.length, '/', messages.length);

        if (realMessages.length === 0) {
            devLog(`⚠️ [${label}] 跳过：没有真实消息${taskCompleted ? '' : '（所有消息都是虚拟消息）'}`);
            return;
        }

        const mem0Messages = realMessages.map(msg => ({
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content,
        }));

        if (taskDescription) {
            mem0Messages.unshift({
                role: 'system',
                content: `User was working on task: "${taskDescription}"`,
            });
        }

        devLog(`🧠 [${label}] 调用 memory-extractor...`);
        if (!taskCompleted) {
            devLog(`🧠 [${label}] 任务描述:`, taskDescription);
        }

        // 构建 metadata
        const metadata: Record<string, unknown> = {
            source: 'ai_coach_session',
            timestamp: new Date().toISOString(),
            task_completed: taskCompleted,
        };
        if (taskCompleted && usedTime !== undefined) {
            metadata.sessionDuration = usedTime;
        }
        if (taskCompleted && actualDurationMinutes !== undefined) {
            metadata.actual_duration_minutes = actualDurationMinutes;
        }

        const { data, error } = await supabaseClient.functions.invoke('memory-extractor', {
            body: {
                action: 'extract',
                userId,
                messages: mem0Messages,
                taskDescription,
                metadata,
            },
        });

        if (error) {
            console.error(`🧠 [${label}] memory-extractor 返回错误:`, error);
        } else {
            devLog(`✅ [${label}] 记忆提取成功:`, data);
            if (data?.memories && Array.isArray(data.memories)) {
                devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                devLog(`📝 [${label}] 保存的记忆内容:`);
                data.memories.forEach((mem: { content?: string; tag?: string }, idx: number) => {
                    devLog(`  ${idx + 1}. [${mem.tag || 'UNKNOWN'}] ${mem.content || '(无内容)'}`);
                });
                devLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }
        }
    } catch (error) {
        console.error('⚠️ 后台保存记忆失败（不影响用户体验）:', error);
    }
}
