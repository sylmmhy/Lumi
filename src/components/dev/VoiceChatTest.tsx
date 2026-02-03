/**
 * VoiceChatTest - 语音对话测试组件
 * 
 * 复用现有组件：
 * - TalkingFire: 火焰动画
 * - useGeminiLive: Gemini Live 连接
 * - useIntentDetection: 三层 AI 意图检测
 * 
 * UI 参考 AI Coach 页面，但不需要摄像头
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TalkingFire } from '../ai/TalkingFire';
import { useGeminiLive, fetchGeminiToken } from '../../hooks/gemini-live';
import { useIntentDetection } from '../../hooks/ai-tools';

interface VoiceChatTestProps {
  onBack: () => void;
}

type ChatType = 'intention_compile' | 'daily_chat';

export function VoiceChatTest({ onBack }: VoiceChatTestProps) {
  // 状态
  const [chatType, setChatType] = useState<ChatType | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // 对话内容
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Supabase 配置
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Gemini Live Hook
  const geminiLive = useGeminiLive({
    enableMicrophone: true,
    enableCamera: false, // 不需要摄像头
    onTranscriptUpdate: (transcript) => {
      // 合并连续的同角色消息
      const mergedMessages: Array<{ role: 'user' | 'ai'; text: string }> = [];
      
      for (const t of transcript) {
        const role = t.role === 'user' ? 'user' as const : 'ai' as const;
        const lastMsg = mergedMessages[mergedMessages.length - 1];
        
        if (lastMsg && lastMsg.role === role) {
          // 同角色，合并文本
          lastMsg.text += t.text;
        } else {
          // 新角色，新建消息
          mergedMessages.push({ role, text: t.text });
        }
      }
      
      setMessages(mergedMessages);
    },
  });

  // 意图检测 Hook（三层 AI 架构）
  const intentDetection = useIntentDetection({
    userId: '11111111-1111-1111-1111-111111111111',
    chatType: chatType || 'daily_chat',
    preferredLanguage: 'zh',
    onToolResult: (result) => {
      console.log('🔧 工具结果:', result);
      if (result.responseHint && geminiLive.isConnected) {
        // 注入工具结果给 AI
        geminiLive.sendTextMessage(`[System] ${result.responseHint}`);
      }
    },
  });

  // 连接成功后让 AI 先开口
  const hasGreetedRef = useRef(false);
  
  useEffect(() => {
    if (geminiLive.isConnected && chatType && !hasGreetedRef.current) {
      hasGreetedRef.current = true;
      
      // 等待一下确保连接稳定
      setTimeout(() => {
        const intentionGreetings = [
          'Say hi and ask what habit the user wants to build.',
          'Greet the user warmly and ask about their goals.',
          'Start by asking what the user wants to improve in their life.',
          'Say hello and ask if there is anything they want to change.',
        ];
        
        const dailyGreetings = [
          'Say hi and ask how their day is going.',
          'Greet the user and ask what is on their mind today.',
          'Start with a friendly hello and ask how they are doing.',
          'Say hi and check in on how their day has been.',
        ];
        
        const greetings = chatType === 'intention_compile' ? intentionGreetings : dailyGreetings;
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        
        geminiLive.sendTextMessage(randomGreeting);
        console.log('👋 AI 开场白:', randomGreeting);
      }, 500);
    }
  }, [geminiLive.isConnected, chatType]);

  // 重置 greeting 状态
  useEffect(() => {
    if (!chatType) {
      hasGreetedRef.current = false;
    }
  }, [chatType]);

  // 监听 AI 回复，触发意图检测
  // 只有当 AI 停止说话时才检测，避免流式输出时重复触发
  const lastProcessedIndexRef = useRef<number>(-1);
  const lastAIMessageRef = useRef<string>('');
  const wasSpekingRef = useRef(false);
  
  useEffect(() => {
    // 检测 AI 是否刚停止说话
    const justStoppedSpeaking = wasSpekingRef.current && !geminiLive.isSpeaking;
    wasSpekingRef.current = geminiLive.isSpeaking;
    
    if (messages.length > 0 && justStoppedSpeaking) {
      const lastMsg = messages[messages.length - 1];
      
      if (lastMsg.role === 'ai' && lastMsg.text) {
        // 先添加用户消息（从上次处理的位置开始）
        for (let i = lastProcessedIndexRef.current + 1; i < messages.length - 1; i++) {
          const msg = messages[i];
          if (msg.role === 'user' && msg.text) {
            const cleanedText = msg.text.replace(/<noise>/g, '').trim();
            if (cleanedText) {
              intentDetection.addUserMessage(cleanedText);
              console.log('📝 [用户消息] 添加:', cleanedText);
            }
          }
        }
        lastProcessedIndexRef.current = messages.length - 2;
        
        // 检测 AI 消息（只有和上次不同才处理）
        if (lastMsg.text !== lastAIMessageRef.current) {
          lastAIMessageRef.current = lastMsg.text;
          console.log('🤖 [AI消息] 说完了:', lastMsg.text.substring(0, 100));
          intentDetection.processAIResponse(lastMsg.text);
        }
      }
    }
  }, [messages, geminiLive.isSpeaking, intentDetection]);

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
      // 1. 获取 Gemini Token
      console.log('🔑 获取 Gemini Token...');
      const token = await fetchGeminiToken(); // 使用默认 ttl
      
      // 2. 获取系统提示词
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
          context: { phase: 'onboarding' },
          aiTone: 'gentle',
        }),
      });

      if (!configResponse.ok) {
        throw new Error('获取配置失败');
      }

      const config = await configResponse.json();
      console.log('📞 配置:', config);

      // 3. 连接 Gemini Live
      console.log('🔌 连接 Gemini Live...');
      await geminiLive.connect(
        config.geminiConfig?.systemPrompt || '',
        [], // 不传 tools，用三层架构
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

  // 断开连接
  const handleDisconnect = useCallback(() => {
    geminiLive.disconnect();
    setChatType(null);
    setMessages([]);
    intentDetection.clearHistory();
  }, [geminiLive, intentDetection]);

  // 发送文字
  const handleSendText = useCallback(() => {
    if (textInput.trim() && geminiLive.isConnected) {
      geminiLive.sendTextMessage(textInput);
      intentDetection.addUserMessage(textInput);
      setTextInput('');
    }
  }, [textInput, geminiLive, intentDetection]);

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
  // 对话界面（类似 AI Coach）
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
        
        {/* LIVE 标志 */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 rounded-full">
          <span className={`w-2 h-2 rounded-full ${geminiLive.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-white text-sm font-medium">LIVE</span>
        </div>

        {/* 文字/语音切换按钮 */}
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="px-3 py-1.5 bg-black/50 text-white text-sm rounded-lg hover:bg-black/70"
        >
          {showTextInput ? '🎤' : '⌨️'}
        </button>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-32">
        {/* 火焰动画 */}
        <TalkingFire isSpeaking={geminiLive.isSpeaking} size={200} />
        
        {/* 状态文字 */}
        <p className="text-gray-400 text-sm mt-4">
          {geminiLive.isSpeaking ? '🔊 Lumi 正在说话...' : 
           geminiLive.isRecording ? '🎤 正在听你说...' : 
           geminiLive.isConnected ? '👂 等待中...' : '⏳ 连接中...'}
        </p>

        {/* 当前对话类型 */}
        <p className="text-gray-500 text-xs mt-2">
          {chatType === 'intention_compile' ? '习惯制定模式' : '日常对话模式'}
        </p>
      </div>

      {/* 对话记录（可滚动） */}
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
        {/* 文字输入框 */}
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

        {/* 麦克风按钮 */}
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

      {/* 错误提示 */}
      {geminiLive.error && (
        <div className="absolute top-20 left-4 right-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{geminiLive.error}</p>
        </div>
      )}
    </div>
  );
}

export default VoiceChatTest;
