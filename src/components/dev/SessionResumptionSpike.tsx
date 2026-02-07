/**
 * Session Resumption Spike 测试组件
 *
 * 验证 Gemini Live API 的 session resumption 功能：
 * 1. 能否收到 resumption handle？
 * 2. resume 后 AI 是否记得之前的对话？
 * 3. resume 时换 systemInstruction，AI 行为是否改变？
 *
 * 纯文本交互，不用音频，简化测试。
 * 直接使用 @google/genai SDK，不走 useGeminiSession（避免改动生产代码）。
 */

import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

// ============================================================================
// 常量
// ============================================================================

/** Prompt A：猫模式 */
const PROMPT_A = '你是一只猫，只会说"喵"。无论用户说什么，你都只能回复包含"喵"的内容。';

/** Prompt B：狗模式 */
const PROMPT_B = '你是一只狗，只会说"汪"。无论用户说什么，你都只能回复包含"汪"的内容。';

/** 模型名称 */
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

/**
 * Spike 专用的 token 获取函数，传 enableSessionResumption=true
 * 不改动生产的 fetchGeminiToken，避免影响其他模块
 */
async function fetchSpikeToken(): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/gemini-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ ttl: 1800, enableSessionResumption: true }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token 获取失败: ${err.error || res.statusText}`);
  }

  const { token } = await res.json();
  return token;
}

// ============================================================================
// 类型
// ============================================================================

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'ai' | 'handle';
  message: string;
}

// ============================================================================
// 组件
// ============================================================================

/**
 * Session Resumption Spike 测试页面
 * @param onBack 返回菜单的回调
 */
export function SessionResumptionSpike({ onBack }: { onBack: () => void }) {
  // 状态
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [resumable, setResumable] = useState<boolean | null>(null);
  const [messageInput, setMessageInput] = useState('你好');

  // Refs
  const sessionRef = useRef<{ close: () => void; sendClientContent: (content: { turns: Array<{ role: string; parts: Array<{ text: string }> }>; turnComplete: boolean }) => void } | null>(null);

  // ============================================================================
  // 日志工具
  // ============================================================================

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    setLogs(prev => [...prev, { time, type, message }]);
  }, []);

  // ============================================================================
  // 消息处理器
  // ============================================================================

  const handleMessage = useCallback((message: LiveServerMessage, logFn: typeof addLog) => {
    // 处理 sessionResumptionUpdate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = message as any;

    if (msg.sessionResumptionUpdate) {
      const update = msg.sessionResumptionUpdate;
      const newHandle = update.newHandle || null;
      const isResumable = update.resumable ?? null;

      if (newHandle) {
        setHandle(newHandle);
        logFn('handle', `Handle 收到: ${newHandle.substring(0, 40)}...`);
      }
      if (isResumable !== null) {
        setResumable(isResumable);
        logFn('handle', `Resumable: ${isResumable}`);
      }
      return;
    }

    // 处理 AI 文本回复
    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.text) {
          logFn('ai', `AI: ${part.text}`);
        }
      }
    }

    // 处理 turn complete
    if (msg.serverContent?.turnComplete) {
      logFn('info', '--- AI 回复完毕 ---');
    }

    // 处理 setupComplete
    if (msg.setupComplete) {
      logFn('success', 'Setup 完成，可以发送消息了');
    }
  }, []);

  // ============================================================================
  // 连接（Prompt A）
  // ============================================================================

  const connectWithPromptA = useCallback(async () => {
    try {
      setIsConnecting(true);
      addLog('info', '正在获取 ephemeral token...');

      const token = await fetchSpikeToken();
      addLog('success', 'Token 获取成功');

      addLog('info', `连接中... systemInstruction = "${PROMPT_A.substring(0, 30)}..."`);

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction: {
            parts: [{ text: PROMPT_A }],
          },
          sessionResumption: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            addLog('success', '已连接（猫模式 Prompt A）');
          },
          onmessage: (msg: LiveServerMessage) => {
            handleMessage(msg, addLog);
          },
          onerror: (e: ErrorEvent) => {
            addLog('error', `连接错误: ${e.message || '未知错误'}`);
            setIsConnected(false);
            setIsConnecting(false);
          },
          onclose: () => {
            addLog('info', '连接已关闭');
            setIsConnected(false);
            setIsConnecting(false);
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessionRef.current = session as any;
    } catch (err) {
      addLog('error', `连接失败: ${(err as Error).message}`);
      setIsConnecting(false);
    }
  }, [addLog, handleMessage]);

  // ============================================================================
  // 发送消息
  // ============================================================================

  const sendMessage = useCallback(() => {
    if (!sessionRef.current) {
      addLog('error', '未连接，无法发送');
      return;
    }

    const text = messageInput.trim();
    if (!text) return;

    addLog('info', `发送: "${text}"`);

    try {
      sessionRef.current.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      });
    } catch (err) {
      addLog('error', `发送失败: ${(err as Error).message}`);
    }
  }, [addLog, messageInput]);

  // ============================================================================
  // 断开
  // ============================================================================

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // ignore
      }
      sessionRef.current = null;
    }
    setIsConnected(false);
    addLog('info', '手动断开连接');

    if (handle) {
      addLog('success', `保留 handle 用于 resume: ${handle.substring(0, 40)}...`);
    } else {
      addLog('error', '没有收到 handle，resume 将无法工作');
    }
  }, [addLog, handle]);

  // ============================================================================
  // Resume（Prompt B）
  // ============================================================================

  const resumeWithPromptB = useCallback(async () => {
    if (!handle) {
      addLog('error', '没有 handle，无法 resume');
      return;
    }

    try {
      setIsConnecting(true);
      addLog('info', '正在获取新的 ephemeral token...');

      const token = await fetchSpikeToken();
      addLog('success', 'Token 获取成功');

      addLog('info', `Resume 中... handle = "${handle.substring(0, 30)}..."`);
      addLog('info', `新 systemInstruction = "${PROMPT_B.substring(0, 30)}..."`);

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      const session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction: {
            parts: [{ text: PROMPT_B }],
          },
          sessionResumption: {
            handle,
          },
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            addLog('success', '已 Resume（狗模式 Prompt B）');
          },
          onmessage: (msg: LiveServerMessage) => {
            handleMessage(msg, addLog);
          },
          onerror: (e: ErrorEvent) => {
            addLog('error', `Resume 错误: ${e.message || '未知错误'}`);
            setIsConnected(false);
            setIsConnecting(false);
          },
          onclose: () => {
            addLog('info', 'Resume 连接已关闭');
            setIsConnected(false);
            setIsConnecting(false);
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessionRef.current = session as any;

      // 自动发送测试消息
      setTimeout(() => {
        addLog('info', '自动发送: "我刚才说了什么？"');
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (session as any).sendClientContent({
            turns: [{ role: 'user', parts: [{ text: '我刚才说了什么？' }] }],
            turnComplete: true,
          });
        } catch (err) {
          addLog('error', `自动发送失败: ${(err as Error).message}`);
        }
      }, 1500);
    } catch (err) {
      addLog('error', `Resume 失败: ${(err as Error).message}`);
      setIsConnecting(false);
    }
  }, [addLog, handle, handleMessage]);

  // ============================================================================
  // 清空日志
  // ============================================================================

  const clearLogs = useCallback(() => {
    setLogs([]);
    setHandle(null);
    setResumable(null);
  }, []);

  // ============================================================================
  // 渲染
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col p-4">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← 返回
        </button>
        <h1 className="text-lg font-bold text-yellow-400">
          Session Resumption Spike
        </h1>
        <div className="w-12" />
      </div>

      {/* 状态栏 */}
      <div className="bg-[#2a2a2a] rounded-lg p-3 mb-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-gray-300">{isConnected ? '已连接' : '未连接'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">
            Handle: {handle ? `${handle.substring(0, 20)}...` : '无'}
          </span>
          <span className="text-gray-500">
            Resumable: {resumable === null ? '未知' : resumable ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* 连接 (Prompt A) */}
        <button
          onClick={connectWithPromptA}
          disabled={isConnected || isConnecting}
          className="py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all"
        >
          {isConnecting ? '连接中...' : '1. 连接（猫 Prompt A）'}
        </button>

        {/* 断开 */}
        <button
          onClick={disconnect}
          disabled={!isConnected}
          className="py-3 px-4 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all"
        >
          3. 断开
        </button>

        {/* 发送消息 */}
        <div className="col-span-1 flex gap-1">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-[#2a2a2a] text-white text-sm rounded-l-xl px-3 border border-gray-600 focus:border-blue-500 outline-none"
            placeholder="输入消息..."
          />
          <button
            onClick={sendMessage}
            disabled={!isConnected}
            className="py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-40 text-white font-bold rounded-r-xl text-sm transition-all whitespace-nowrap"
          >
            2. 发送
          </button>
        </div>

        {/* Resume (Prompt B) */}
        <button
          onClick={resumeWithPromptB}
          disabled={isConnected || isConnecting || !handle}
          className="py-3 px-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all"
        >
          {isConnecting ? 'Resuming...' : '4. Resume（狗 Prompt B）'}
        </button>
      </div>

      {/* 验证清单 */}
      <div className="bg-[#2a2a2a] rounded-lg p-3 mb-4 text-xs space-y-1">
        <p className="text-yellow-400 font-bold mb-2">验证清单：</p>
        <p className="text-gray-400">
          <span className={handle ? 'text-green-400' : 'text-gray-600'}>
            {handle ? '✅' : '⬜'}
          </span>
          {' '}Q1: 能否收到 resumption handle？
        </p>
        <p className="text-gray-400">
          <span className="text-gray-600">⬜</span>
          {' '}Q2: resume 后 AI 是否记得之前的对话？（看 AI 回复）
        </p>
        <p className="text-gray-400">
          <span className="text-gray-600">⬜</span>
          {' '}Q3: resume 时换 systemInstruction，AI 行为是否改变？（猫→狗）
        </p>
      </div>

      {/* 日志区域 */}
      <div className="flex-1 bg-black rounded-lg p-3 overflow-y-auto font-mono text-xs min-h-[300px]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-500">日志</span>
          <button onClick={clearLogs} className="text-gray-500 hover:text-gray-300 text-xs">
            清空
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-gray-600">点击"连接"开始测试...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1">
              <span className="text-gray-600">[{log.time}]</span>{' '}
              <span className={{
                info: 'text-gray-400',
                success: 'text-green-400',
                error: 'text-red-400',
                ai: 'text-cyan-400',
                handle: 'text-yellow-400',
              }[log.type]}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 说明 */}
      <div className="mt-4 bg-[#2a2a2a] rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p><strong>操作流程：</strong></p>
        <p>1. 点击"连接" → 建立连接，Prompt A = "你是猫，只说喵"</p>
        <p>2. 发送"你好" → AI 应回复带"喵"的内容；观察日志中是否出现 handle</p>
        <p>3. 点击"断开" → 关闭连接，保留 handle</p>
        <p>4. 点击"Resume" → 用 handle 重连，Prompt B = "你是狗，只说汪"，自动发送"我刚才说了什么？"</p>
        <p className="text-yellow-500/70 mt-2">
          观察：AI 是否记得上下文？AI 是否从猫变成狗？
        </p>
      </div>
    </div>
  );
}
