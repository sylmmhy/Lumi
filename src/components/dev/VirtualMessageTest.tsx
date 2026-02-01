/**
 * VirtualMessageTest - 虚拟消息动态传入测试组件
 * 
 * 测试内容：
 * 1. 虚拟消息是否按时发送
 * 2. 消息内容是否动态生成
 * 3. 记忆是否被正确检索和注入
 * 4. 话题检测是否正常工作（向量匹配）
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TalkingFire } from '../ai/TalkingFire';
import { useGeminiLive, fetchGeminiToken } from '../../hooks/gemini-live';
import { useVirtualMessageOrchestrator } from '../../hooks/virtual-messages';

interface VirtualMessageTestProps {
  onBack: () => void;
}

// 测试用例：测试话题检测
const TEST_CASES = [
  { label: '感情', text: 'boyfriend might not come' },
  { label: '失恋', text: 'we broke up yesterday' },
  { label: '压力', text: 'so stressed about work' },
  { label: '旅行', text: '在收拾行李准备出发' },
  { label: '健身', text: 'going to the gym' },
  { label: '工作', text: 'deadline is tomorrow' },
];

export function VirtualMessageTest({ onBack }: VirtualMessageTestProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [taskStartTime, setTaskStartTime] = useState(Date.now()); // 默认启动
  const [logs, setLogs] = useState<string[]>([]);
  const [testInput, setTestInput] = useState('boyfriend might not come');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 添加日志
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), `[${time}] ${msg}`]);
  }, []);

  // Gemini Live Hook
  const geminiLive = useGeminiLive({
    enableMicrophone: true,
    enableCamera: false,
    onTranscriptUpdate: (transcript) => {
      if (transcript.length > 0) {
        const last = transcript[transcript.length - 1];
        addLog(`📝 ${last.role}: ${last.text.substring(0, 50)}...`);
      }
    },
  });

  // 虚拟消息编排器
  // 测试用户: q@q.com
  const orchestrator = useVirtualMessageOrchestrator({
    userId: '38396857-f948-4496-8ab2-80edbae72f16',
    taskDescription: '测试任务',
    initialDuration: 300,
    taskStartTime,
    injectContextSilently: (content, options) => {
      addLog(`💉 注入上下文: ${content.substring(0, 80)}...`);
      // 实际上这个方法有 bug，改用 sendTextMessage
      if (geminiLive.isConnected) {
        geminiLive.sendTextMessage(content);
        return true;
      }
      return false;
    },
    isSpeaking: geminiLive.isSpeaking,
    enabled: true, // 始终启用，方便测试话题检测
    preferredLanguage: 'zh',
  });

  // 监听编排器事件
  useEffect(() => {
    if (orchestrator.pendingMemory) {
      addLog(`🧠 待注入记忆: topic="${orchestrator.pendingMemory.topic}" count=${orchestrator.pendingMemory.count}`);
    }
  }, [orchestrator.pendingMemory, addLog]);

  // 监听话题检测状态
  useEffect(() => {
    if (orchestrator.isDetectingTopic) {
      addLog('🔍 正在检测话题...');
    }
  }, [orchestrator.isDetectingTopic, addLog]);

  // 滚动到底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 连接
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    addLog('🔌 开始连接...');

    try {
      const token = await fetchGeminiToken();
      addLog('🔑 Token 获取成功');

      const systemPrompt = `
# 角色
你是 Lumi，一个帮助用户完成任务的 AI 伙伴。

# 规则
- 用中文回复
- 简短回复，1-2句话
- 定期鼓励用户
- 收到 [CONTEXT] 消息时，自然地融入对话
`;

      await geminiLive.connect(systemPrompt, [], token, 'Aoede');
      setIsConnected(true);
      addLog('✅ 连接成功！');

      // 让 AI 先开口
      setTimeout(() => {
        geminiLive.sendTextMessage('Say hi and ask if the user is ready to start.');
        addLog('👋 触发开场白');
      }, 1000);

    } catch (error) {
      addLog(`❌ 连接失败: ${(error as Error).message}`);
    } finally {
      setIsConnecting(false);
    }
  }, [geminiLive, addLog]);

  // 断开
  const handleDisconnect = useCallback(() => {
    geminiLive.disconnect();
    setIsConnected(false);
    addLog('🔌 已断开连接');
  }, [geminiLive, addLog]);

  // 手动触发虚拟消息
  const handleTriggerVirtualMessage = useCallback(() => {
    if (geminiLive.isConnected) {
      const elapsed = Math.floor((Date.now() - taskStartTime) / 1000);
      const message = `[CHECK_IN] elapsed=${elapsed}s lang=zh - 请用中文简短地询问用户进展`;
      geminiLive.sendTextMessage(message);
      addLog(`📤 手动触发虚拟消息: ${message}`);
    }
  }, [geminiLive, taskStartTime, addLog]);

  // 模拟用户说话 - 测试话题检测（向量匹配）
  const handleSimulateUserSpeech = useCallback(() => {
    addLog(`🎤 模拟用户说话: "${testInput}"`);
    addLog('🔍 调用话题检测 API (向量匹配)...');
    orchestrator.onUserSpeech(testInput);
  }, [orchestrator, addLog, testInput]);

  // 模拟 AI 说完话
  const handleSimulateTurnComplete = useCallback(() => {
    orchestrator.onTurnComplete();
    addLog('✅ 模拟 turnComplete');
  }, [orchestrator, addLog]);

  // 清空日志
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* 顶部 */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">
          ← 返回
        </button>
        <h2 className="text-yellow-400 font-bold">虚拟消息测试</h2>
        <button onClick={handleClearLogs} className="text-gray-400 hover:text-white text-sm">
          清空
        </button>
      </div>

      {/* 火焰 + 状态 */}
      <div className="flex flex-col items-center py-4">
        <TalkingFire isSpeaking={geminiLive.isSpeaking} size={100} />
        <p className="text-gray-500 text-xs mt-2">
          {orchestrator.isDetectingTopic ? '🔍 检测话题中...' :
           geminiLive.isSpeaking ? '🔊 AI 说话中' : 
           geminiLive.isRecording ? '🎤 录音中' : 
           isConnected ? '👂 等待中' : '⏸️ 未连接'}
        </p>
        <p className="text-gray-600 text-xs">
          队列大小: {orchestrator.getQueueSize()}
        </p>
      </div>

      {/* 话题检测测试区 */}
      <div className="px-4 py-2 bg-black/20 mx-4 rounded-lg mb-2">
        <p className="text-gray-400 text-xs mb-2">🏷️ 话题检测测试（向量匹配）</p>
        <input
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          className="w-full px-3 py-2 bg-black/50 text-white rounded text-sm mb-2"
          placeholder="输入测试文本..."
        />
        <div className="flex flex-wrap gap-1">
          {TEST_CASES.map((tc) => (
            <button
              key={tc.label}
              onClick={() => setTestInput(tc.text)}
              className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
            >
              {tc.label}
            </button>
          ))}
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="px-4 py-2 flex flex-wrap gap-2 justify-center">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {isConnecting ? '连接中...' : '🔌 连接 Gemini'}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
          >
            断开
          </button>
        )}
        <button
          onClick={handleSimulateUserSpeech}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          🎤 测试话题检测
        </button>
        <button
          onClick={handleSimulateTurnComplete}
          className="px-4 py-2 bg-yellow-600 text-black rounded-lg text-sm"
        >
          ✅ turnComplete
        </button>
        {isConnected && (
          <>
            <button
              onClick={handleTriggerVirtualMessage}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm"
            >
              📤 CHECK_IN
            </button>
            <button
              onClick={() => geminiLive.toggleMicrophone()}
              className={`px-4 py-2 rounded-lg text-sm ${
                geminiLive.isRecording ? 'bg-red-500 text-white' : 'bg-gray-600 text-white'
              }`}
            >
              {geminiLive.isRecording ? '🔴 停止' : '🎤 录音'}
            </button>
          </>
        )}
      </div>

      {/* 日志区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 bg-black/30 mx-4 rounded-lg mb-4">
        <h3 className="text-gray-400 text-xs mb-2 sticky top-0 bg-black/50 py-1">📋 日志</h3>
        <div className="space-y-1 text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-gray-500">点击"测试话题检测"开始测试...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`${
                log.includes('❌') ? 'text-red-400' :
                log.includes('✅') ? 'text-green-400' :
                log.includes('💉') ? 'text-purple-400' :
                log.includes('🧠') ? 'text-cyan-400' :
                log.includes('📤') ? 'text-yellow-400' :
                log.includes('🏷️') ? 'text-orange-400' :
                log.includes('🔍') ? 'text-blue-400' :
                'text-gray-300'
              }`}>
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* 说明 */}
      <div className="p-4 bg-black/50 text-gray-400 text-xs">
        <p className="font-bold text-yellow-400 mb-1">测试说明:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><b>话题检测测试</b>: 不需要连接 Gemini，直接点击"测试话题检测"</li>
          <li>观察日志中的 🔍 检测话题 和 🧠 待注入记忆</li>
          <li>点击预设按钮快速切换测试用例（感情/失恋/压力等）</li>
          <li>连接 Gemini 后可以测试完整流程</li>
        </ul>
      </div>
    </div>
  );
}

export default VirtualMessageTest;
