/**
 * VoiceChatTest - 语音对话测试组件
 * 
 * 复用现有组件：
 * - TalkingFire: 火焰动画
 * - useGeminiLive: Gemini Live 连接
 * - useIntentDetection: 三层 AI 意图检测
 * 
 * 消息处理模式参考 useAICoachSession.ts：
 * - 在 onTranscriptUpdate 回调里处理
 * - 用户消息累积，AI 说话时一次性存储
 * - 防重复机制
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TalkingFire } from '../ai/TalkingFire';
import { useGeminiLive, fetchGeminiToken } from '../../hooks/gemini-live';
import { useIntentDetection } from '../../hooks/ai-tools';

interface VoiceChatTestProps {
  onBack: () => void;
}

type ChatType = 'intention_compile' | 'daily_chat';

/**
 * 清理文本中的噪音标记
 */
const cleanNoiseMarkers = (text: string): string => {
  return text
    .replace(/<noise>/g, '')
    .replace(/\[TOOL_RESULT\][\s\S]*?(?=\n\n|$)/gi, '') // 过滤 [TOOL_RESULT] 整个块
    .replace(/\[CONTEXT\][\s\S]*?(?=\n\n|$)/gi, '') // 过滤 [CONTEXT] 整个块
    .replace(/\[System\][^\u4e00-\u9fa5]*/gi, '') // 过滤 [System] 及其后的英文内容
    .replace(/\[内部结果.*?\]/g, '') // 过滤内部结果标记
    .trim();
};

export function VoiceChatTest({ onBack }: VoiceChatTestProps) {
  // 状态
  const [chatType, setChatType] = useState<ChatType | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // 对话内容（用于 UI 显示）
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Supabase 配置
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // ==========================================
  // 消息处理相关 Refs
  // ==========================================
  
  // 存储 intentDetection 的 ref（用于在回调里访问）
  const intentDetectionRef = useRef<ReturnType<typeof useIntentDetection> | null>(null);

  // 获取用户语言偏好（从浏览器或用户设置）
  const preferredLanguage = navigator.language?.startsWith('zh') ? 'zh' : 'en';

  // 意图检测 Hook（三层 AI 架构）
  const intentDetection = useIntentDetection({
    userId: '11111111-1111-1111-1111-111111111111',
    chatType: chatType || 'daily_chat',
    preferredLanguage,
    onToolResult: (result) => {
      console.log('🔧 工具结果:', result);
      
      if (result.responseHint && geminiLiveRef.current?.isConnected) {
        // 使用虚拟消息格式注入工具结果
        // 关键是 action: 指令告诉 AI 要怎么做
        const contextMessage = `[TOOL_RESULT] type=${result.tool}
result: ${result.responseHint}
action: 用你自己的话简短地告诉用户这个结果。不要直接照读，像朋友一样自然地说。`;
        geminiLiveRef.current.sendClientContent(contextMessage, true);
        console.log('💉 [工具结果] 已注入:', contextMessage.substring(0, 80) + '...');
      }
    },
  });

  // 更新 intentDetection ref
  useEffect(() => {
    intentDetectionRef.current = intentDetection;
  }, [intentDetection]);

  // 存储 geminiLive 的 ref（用于在回调里访问）
  const geminiLiveRef = useRef<ReturnType<typeof useGeminiLive> | null>(null);
  
  // 存储最新的 AI 完整消息（用于意图检测）
  const latestAIMessageRef = useRef<string>('');

  // Gemini Live Hook
  const geminiLive = useGeminiLive({
    enableMicrophone: true,
    enableCamera: false,
    onTranscriptUpdate: (newTranscript) => {
      // ==========================================
      // 核心消息处理逻辑
      // 直接根据 transcript 重建 messages，避免碎片化
      // ==========================================
      
      // 1. 合并连续的同角色消息
      const mergedMessages: Array<{ role: 'user' | 'ai'; text: string }> = [];
      
      for (const t of newTranscript) {
        const role = t.role === 'user' ? 'user' as const : 'ai' as const;
        const cleanedText = cleanNoiseMarkers(t.text);
        
        if (!cleanedText) continue;
        
        const lastMsg = mergedMessages[mergedMessages.length - 1];
        
        if (lastMsg && lastMsg.role === role) {
          // 同角色，合并文本
          lastMsg.text += cleanedText;
        } else {
          // 新角色，新建消息
          mergedMessages.push({ role, text: cleanedText });
        }
      }
      
      // 2. 更新 UI
      setMessages(mergedMessages);
      
      // 3. 存储最新的 AI 完整消息（用于意图检测）
      const lastAIMsg = mergedMessages.filter(m => m.role === 'ai').pop();
      if (lastAIMsg) {
        latestAIMessageRef.current = lastAIMsg.text;
      }
    },
  });

  // 更新 geminiLive ref
  useEffect(() => {
    geminiLiveRef.current = geminiLive;
  }, [geminiLive]);

  // ==========================================
  // 监听 AI 说完话，触发意图检测
  // ==========================================
  const wasSpeakingRef = useRef(false);
  
  useEffect(() => {
    // 检测 AI 是否刚停止说话
    const justStoppedSpeaking = wasSpeakingRef.current && !geminiLive.isSpeaking;
    wasSpeakingRef.current = geminiLive.isSpeaking;
    
    if (justStoppedSpeaking && latestAIMessageRef.current) {
      // 从 messages 里提取所有用户消息
      const userMsgs = messages
        .filter(m => m.role === 'user' && m.text.trim())
        .map(m => m.text);
      
      console.log('🤖 [AI消息] 说完了:', latestAIMessageRef.current.substring(0, 100));
      console.log('📝 [用户消息] 全部:', userMsgs);
      console.log('🔍 [意图检测] 触发...');
      
      // 先设置用户消息，再触发检测
      intentDetectionRef.current?.setUserMessages(userMsgs);
      intentDetectionRef.current?.processAIResponse(latestAIMessageRef.current);
    }
  }, [geminiLive.isSpeaking, messages]);

  // 连接成功后让 AI 先开口
  const hasGreetedRef = useRef(false);

  useEffect(() => {
    if (geminiLive.isConnected && chatType && !hasGreetedRef.current) {
      hasGreetedRef.current = true;

      setTimeout(() => {
        let greeting: string;

        if (chatType === 'intention_compile') {
          const intentionGreetings = [
            'Say hi and ask what habit the user wants to build.',
            'Greet the user warmly and ask about their goals.',
            'Start by asking what the user wants to improve in their life.',
            'Say hello and ask if there is anything they want to change.',
          ];
          greeting = intentionGreetings[Math.floor(Math.random() * intentionGreetings.length)];
        } else {
          // 日常对话：让 AI 使用系统提示词中定义的开场白
          // 系统提示词已经包含了 suggestedOpening，AI 会自动使用
          greeting = 'Say your opening line from the system prompt. Be natural and friendly.';
        }

        geminiLive.sendTextMessage(greeting);
        console.log('👋 AI 开场白指令:', greeting);
      }, 500);
    }
  }, [geminiLive.isConnected, chatType, geminiLive]);

  // 重置 greeting 状态
  useEffect(() => {
    if (!chatType) {
      hasGreetedRef.current = false;
    }
  }, [chatType]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 开始对话
  const handleStartChat = useCallback(async (type: ChatType) => {
    setChatType(type);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      console.log('🔑 获取 Gemini Token...');
      const token = await fetchGeminiToken();

      // 构建上下文 - 日常对话需要先获取智能开场白上下文
      let context: Record<string, unknown> = { phase: 'onboarding' };

      if (type === 'daily_chat') {
        console.log('🗣️ 获取日常对话上下文...');
        try {
          const dailyChatContextResponse = await fetch(`${supabaseUrl}/functions/v1/get-daily-chat-context`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              userId: '11111111-1111-1111-1111-111111111111',
            }),
          });

          if (dailyChatContextResponse.ok) {
            const dailyChatContext = await dailyChatContextResponse.json();
            console.log('🗣️ 日常对话上下文:', dailyChatContext);

            // 将 get-daily-chat-context 返回的数据传给 start-voice-chat
            context = {
              ...context,
              openingStrategy: dailyChatContext.openingStrategy,
              suggestedOpening: dailyChatContext.suggestedOpening,
              skippedTask: dailyChatContext.context?.skippedTask,
              relevantMemory: dailyChatContext.context?.relevantMemory,
              completedStreak: dailyChatContext.context?.completedStreak,
            };
          } else {
            console.warn('⚠️ 获取日常对话上下文失败，使用默认上下文');
          }
        } catch (err) {
          console.warn('⚠️ 获取日常对话上下文出错:', err);
        }
      }

      console.log('📝 获取系统提示词...');
      const configResponse = await fetch(`${supabaseUrl}/functions/v1/start-voice-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          userId: '11111111-1111-1111-1111-111111111111',
          chatType: type,
          context,
          aiTone: 'gentle',
        }),
      });

      if (!configResponse.ok) {
        throw new Error('获取配置失败');
      }

      const config = await configResponse.json();
      console.log('📞 配置:', config);

      console.log('🔌 连接 Gemini Live...');
      await geminiLive.connect(
        config.geminiConfig?.systemPrompt || '',
        [],
        token,
        config.geminiConfig?.voiceConfig?.voiceName || 'Aoede'
      );

      console.log('✅ 连接成功！');
    } catch (error) {
      console.error('❌ 连接失败:', error);
      setConnectionError((error as Error).message);
      setChatType(null);
    } finally {
      setIsConnecting(false);
    }
  }, [supabaseUrl, supabaseAnonKey, geminiLive]);

  // 断开连接（包含记忆保存）
  const handleDisconnect = useCallback(async () => {
    // 1. 如果是日常对话且有消息，先保存记忆
    if (chatType === 'daily_chat' && messages.length > 0) {
      console.log('💾 [记忆保存] 开始提取对话记忆...');

      try {
        // 将 messages 转换为 memory-extractor 需要的格式
        const mem0Messages = messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        }));

        const response = await fetch(`${supabaseUrl}/functions/v1/memory-extractor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            action: 'extract',
            userId: '11111111-1111-1111-1111-111111111111', // TODO: 使用真实用户 ID
            messages: mem0Messages,
            taskDescription: '日常对话',
            localDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            metadata: {
              source: 'daily_chat',
              timestamp: new Date().toISOString(),
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('💾 [记忆保存] 成功:', {
            extracted: result.extracted,
            saved: result.saved,
            merged: result.merged,
          });
          if (result.memories && result.memories.length > 0) {
            console.log('💾 [记忆保存] 提取的记忆:');
            result.memories.forEach((m: { tag: string; content: string }) => {
              console.log(`  - [${m.tag}] ${m.content}`);
            });
          }
        } else {
          console.warn('💾 [记忆保存] 失败:', await response.text());
        }
      } catch (err) {
        console.error('💾 [记忆保存] 错误:', err);
      }
    }

    // 2. 断开 Gemini Live 连接
    geminiLive.disconnect();
    setChatType(null);
    setMessages([]);
    intentDetection.clearHistory();
  }, [geminiLive, intentDetection, chatType, messages, supabaseUrl, supabaseAnonKey]);

  // 发送文字
  const handleSendText = useCallback(() => {
    if (textInput.trim() && geminiLive.isConnected) {
      geminiLive.sendTextMessage(textInput);
      setMessages(prev => [...prev, { role: 'user', text: textInput }]);
      setTextInput('');
    }
  }, [textInput, geminiLive]);

  // ============================================
  // 选择对话模式界面
  // ============================================
  if (!chatType) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-yellow-400">🎤 语音对话测试</h2>
        <p className="text-gray-400 text-center text-sm">
          三层 AI 架构测试<br/>
          Gemini Live + 意图检测 + 工具调用
        </p>

        <TalkingFire isSpeaking={false} size={150} />

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => handleStartChat('intention_compile')}
            disabled={isConnecting}
            className="py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
          >
            🎯 习惯制定
            <span className="block text-xs font-normal opacity-70 mt-1">
              设定新目标、养成习惯
            </span>
          </button>

          <button
            onClick={() => handleStartChat('daily_chat')}
            disabled={isConnecting}
            className="py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
          >
            💬 日常对话
            <span className="block text-xs font-normal opacity-70 mt-1">
              闲聊、查看进度
            </span>
          </button>
        </div>

        {isConnecting && (
          <p className="text-yellow-400 text-sm animate-pulse">连接中...</p>
        )}

        {connectionError && (
          <p className="text-red-400 text-sm">❌ {connectionError}</p>
        )}

        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm underline mt-4">
          ← 返回菜单
        </button>
      </div>
    );
  }

  // ============================================
  // 对话界面
  // ============================================
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col relative">
      {/* 顶部状态栏 */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <button
          onClick={handleDisconnect}
          className="px-3 py-1.5 bg-black/50 text-white text-sm rounded-lg hover:bg-black/70"
        >
          ← 退出
        </button>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 rounded-full">
          <span className={`w-2 h-2 rounded-full ${geminiLive.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-white text-sm font-medium">LIVE</span>
        </div>

        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="px-3 py-1.5 bg-black/50 text-white text-sm rounded-lg hover:bg-black/70"
        >
          {showTextInput ? '🎤' : '⌨️'}
        </button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-32">
        <TalkingFire isSpeaking={geminiLive.isSpeaking} size={200} />
        
        <p className="text-gray-400 text-sm mt-4">
          {geminiLive.isSpeaking ? '🔊 Lumi 正在说话...' : 
           geminiLive.isRecording ? '🎤 正在听你说...' : 
           geminiLive.isConnected ? '👂 等待中...' : '⏳ 连接中...'}
        </p>

        <p className="text-gray-500 text-xs mt-2">
          {chatType === 'intention_compile' ? '习惯制定模式' : '日常对话模式'}
        </p>
      </div>

      {/* 对话记录 */}
      {messages.length > 0 && (
        <div className="absolute bottom-40 left-0 right-0 max-h-40 overflow-y-auto px-4">
          <div className="space-y-2">
            {messages.slice(-5).map((msg, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-yellow-500/20 text-yellow-200 ml-auto max-w-[80%]'
                    : 'bg-white/10 text-white mr-auto max-w-[80%]'
                }`}
              >
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* 底部控制区 */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a] to-transparent">
        {showTextInput && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="输入文字..."
              className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <button
              onClick={handleSendText}
              disabled={!textInput.trim() || !geminiLive.isConnected}
              className="px-5 py-3 bg-yellow-500 text-black font-bold rounded-xl disabled:opacity-50"
            >
              发送
            </button>
          </div>
        )}

        {!showTextInput && (
          <div className="flex justify-center">
            <button
              onClick={() => geminiLive.toggleMicrophone()}
              className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all ${
                geminiLive.isRecording
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 animate-pulse'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              {geminiLive.isRecording ? '🔴' : '🎤'}
            </button>
          </div>
        )}

        <p className="text-center text-gray-500 text-xs mt-3">
          {showTextInput 
            ? '输入文字后按回车发送' 
            : geminiLive.isRecording 
              ? '点击停止录音' 
              : '点击开始说话'}
        </p>
      </div>

      {geminiLive.error && (
        <div className="absolute top-20 left-4 right-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{geminiLive.error}</p>
        </div>
      )}
    </div>
  );
}

export default VoiceChatTest;
