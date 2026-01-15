/**
 * Gemini Live Message Handlers
 *
 * 纯函数，负责解析和分发服务器消息
 * 保持消息处理逻辑的可测试性和可复用性
 */

import type { LiveServerMessage } from '@google/genai';
import type { ToolCall, MessageHandlerContext } from '../types';
import { isThinkingContent } from '../utils';

/**
 * 处理 serverContent 消息
 */
export function handleServerContent(
  message: LiveServerMessage,
  context: MessageHandlerContext
): void {
  const { serverContent } = message;
  if (!serverContent) return;

  // Handle interruption - 用户打断 AI 说话
  if ('interrupted' in serverContent) {
    context.onInterrupt();
    return;
  }

  // Handle turn complete - AI 说完一轮
  if ('turnComplete' in serverContent) {
    context.onTurnComplete();
  }

  // Handle user input audio transcription (用户语音转文字)
  if ('inputTranscription' in serverContent && serverContent.inputTranscription) {
    const transcription = serverContent.inputTranscription as { text?: string };
    if (transcription.text) {
      context.onInputTranscription(transcription.text);
    }
  }

  // Handle AI output audio transcription (AI 语音转文字)
  if ('outputTranscription' in serverContent && serverContent.outputTranscription) {
    const transcription = serverContent.outputTranscription as { text?: string };
    if (transcription.text) {
      const text = transcription.text.trim();

      // 在生产环境过滤 thinking 内容
      if (import.meta.env.DEV || !isThinkingContent(text)) {
        context.onOutputTranscription(transcription.text);
      }
    }
  }

  // Handle tool call
  if ('toolCall' in serverContent && serverContent.toolCall) {
    const toolCall = serverContent.toolCall as unknown as ToolCall;
    console.log('🔧 Tool call received:', toolCall);

    if (toolCall?.functionCalls && toolCall.functionCalls.length > 0) {
      context.onToolCall(toolCall);
    }
  }

  // Handle model turn with audio and text
  if ('modelTurn' in serverContent && serverContent.modelTurn) {
    const parts = serverContent.modelTurn.parts || [];

    // Process audio parts
    const audioParts = parts.filter(
      (p) => p.inlineData && p.inlineData.mimeType?.startsWith('audio/pcm')
    );

    audioParts.forEach((part) => {
      if (part.inlineData?.data) {
        context.onAudioData(part.inlineData.data);
      }
    });

    // Process text parts
    const textParts = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join(' ');

    if (textParts) {
      context.onTextContent(textParts);
    }
  }
}

/**
 * 创建消息处理器
 * 返回一个可以直接传递给 onMessage 回调的函数
 */
export function createMessageHandler(context: MessageHandlerContext) {
  return (message: LiveServerMessage) => {
    if (message.serverContent) {
      handleServerContent(message, context);
    }
  };
}
