/**
 * 开发测试页面 - 用于测试拆分后的组件
 * 
 * 仅在开发环境下可用，访问 /dev 即可
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskWorkingView } from '../components/task/TaskWorkingView';
import { CelebrationView } from '../components/celebration/CelebrationView';
import type { CelebrationFlow } from '../components/celebration/CelebrationView';
import { ConfettiEffect, CoinCounter, LevelProgressBar, SimpleProgressBar } from '../components/effects';
import { useAICoachSession } from '../hooks/useAICoachSession';
import { useCelebrationAnimation } from '../hooks/useCelebrationAnimation';
import {
  SimpleTimerExample,
  CheckInCelebrationExample,
  FailureEncouragementExample,
  ConfirmationExample,
} from '../components/examples/TaskWorkingExample';
import { StartCelebrationView } from '../components/celebration/StartCelebrationView';
import { SimpleTaskExecutionView } from '../components/task/SimpleTaskExecutionView';
import { TaskFlowController } from '../components';
import { TalkingFire } from '../components/ai/TalkingFire';
import { FireFromFigma } from '../components/ai/FireFromFigma';
import { FeedbackCard } from '../components/feedback/FeedbackCard';
import { HabitStackingTest, DailyReportTest } from '../components/dev/BackendApiTest';
import { WeeklyReportTest } from '../components/dev/WeeklyReportTest';
import { VoiceChatTest } from '../components/dev/VoiceChatTest';
import { ConsequencePledgeConfirm } from '../components/ConsequencePledgeConfirm';
import { useCampfireSession } from '../hooks/campfire';
import { WeeklyCelebration } from '../components/celebration/WeeklyCelebration';
import { SessionResumptionSpike } from '../components/dev/SessionResumptionSpike';

type TestMode =
  | 'menu'
  | 'ai-coach'
  | 'simple-timer'
  | 'check-in'
  | 'failure'
  | 'confirm'
  | 'effects'
  | 'habit-stacking'
  | 'daily-report'
  | 'example-simple-timer'
  | 'example-checkin'
  | 'example-failure'
  | 'example-confirmation'
  | 'start-celebration'
  | 'simple-execution'
  | 'task-flow'
  | 'talking-fire'
  | 'fire-from-figma'
  | 'task-complete-animation'
  | 'feedback-card'
  | 'voice-chat-test'
  | 'campfire-companion'
  | 'pledge-confirm'
  | 'weekly-report'
  | 'weekly-celebration'
  | 'session-resumption-spike';

/**
 * 开发测试页面，集中挂载 /dev 下的所有组件示例，方便统一修改和回归。
 *
 * @returns {JSX.Element} /dev 测试页面内容
 */
export function DevTestPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<TestMode>('menu');

  // 返回菜单
  const backToMenu = () => setMode('menu');

  // 主菜单
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 p-6">
        <h1
          className="text-3xl font-bold text-yellow-400 mb-4"
          style={{ fontFamily: 'Sansita, sans-serif' }}
        >
          🧪 组件测试面板
        </h1>

        <p className="text-gray-400 text-center mb-6">
          点击下方按钮测试各个组件
        </p>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          {/* AI 教练任务流程 */}
          <button
            onClick={() => setMode('ai-coach')}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🤖 AI 教练任务流程
            <span className="block text-xs font-normal opacity-70 mt-1">
              完整的 Gemini Live + 摄像头 + 庆祝
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-purple-300">🧠 Logic</span>
                src/hooks/useAICoachSession.ts
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-blue-300">🎨 UI</span>
                src/components/task/TaskWorkingView.tsx
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-yellow-300">🎉 UI</span>
                src/components/celebration/CelebrationView.tsx
              </div>
            </div>
          </button>

          {/* 简单计时器 */}
          <button
            onClick={() => setMode('simple-timer')}
            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ⏱️ 简单任务计时器
            <span className="block text-xs font-normal opacity-70 mt-1">
              无 AI，只有倒计时和按钮
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/task/TaskWorkingView.tsx
            </div>
          </button>

          {/* 打卡庆祝 */}
          <button
            onClick={() => setMode('check-in')}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎉 打卡直接庆祝
            <span className="block text-xs font-normal opacity-70 mt-1">
              跳过任务执行，直接显示庆祝页面
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/celebration/CelebrationView.tsx
            </div>
          </button>

          {/* 失败鼓励 */}
          <button
            onClick={() => setMode('failure')}
            className="w-full py-4 px-6 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            💪 失败后的鼓励页面
            <span className="block text-xs font-normal opacity-70 mt-1">
              用户没完成任务时的页面
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/celebration/CelebrationView.tsx
            </div>
          </button>

          {/* 确认页面 */}
          <button
            onClick={() => setMode('confirm')}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ❓ 任务完成确认页面
            <span className="block text-xs font-normal opacity-70 mt-1">
              倒计时结束后询问用户是否完成
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/celebration/CelebrationView.tsx
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">动画效果组件</p>

          {/* 动画效果组件 */}
          <button
            onClick={() => setMode('effects')}
            className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ✨ 动画效果组件
            <span className="block text-xs font-normal opacity-70 mt-1">
              彩带、金币计数、进度条
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/effects/*
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">示例组件 (TaskWorkingExample)</p>

          {/* 简单计时器示例 */}
          <button
            onClick={() => setMode('example-simple-timer')}
            className="w-full py-4 px-6 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ⏲️ SimpleTimerExample
            <span className="block text-xs font-normal opacity-70 mt-1">
              简单计时器组件示例（无 AI）
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-green-300">📄 Entry</span>
                src/components/examples/TaskWorkingExample.tsx
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-blue-300">🎨 UI</span>
                src/components/task/TaskWorkingView.tsx
              </div>
            </div>
          </button>

          {/* 打卡庆祝示例 */}
          <button
            onClick={() => setMode('example-checkin')}
            className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            📅 CheckInCelebrationExample
            <span className="block text-xs font-normal opacity-70 mt-1">
              打卡直接庆祝示例
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-green-300">📄 Entry</span>
                src/components/examples/TaskWorkingExample.tsx
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-yellow-300">🎉 UI</span>
                src/components/celebration/CelebrationView.tsx
              </div>
            </div>
          </button>

          {/* 失败鼓励示例 */}
          <button
            onClick={() => setMode('example-failure')}
            className="w-full py-4 px-6 bg-gradient-to-r from-slate-600 to-gray-600 hover:from-slate-700 hover:to-gray-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            💔 FailureEncouragementExample
            <span className="block text-xs font-normal opacity-70 mt-1">
              失败鼓励页面示例
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-green-300">📄 Entry</span>
                src/components/examples/TaskWorkingExample.tsx
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-yellow-300">🎉 UI</span>
                src/components/celebration/CelebrationView.tsx
              </div>
            </div>
          </button>

          {/* 确认页面示例 */}
          <button
            onClick={() => setMode('example-confirmation')}
            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ✔️ ConfirmationExample
            <span className="block text-xs font-normal opacity-70 mt-1">
              任务完成确认页面示例
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-green-300">📄 Entry</span>
                src/components/examples/TaskWorkingExample.tsx
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-yellow-300">🎉 UI</span>
                src/components/celebration/CelebrationView.tsx
              </div>
            </div>
          </button>

          {/* 开始庆祝页面 */}
          <button
            onClick={() => setMode('start-celebration')}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🚀 开始庆祝页面 (Start Celebration)
            <span className="block text-xs font-normal opacity-70 mt-1">
              任务开始时的鼓励 + 倒计时
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/celebration/StartCelebrationView.tsx
            </div>
          </button>

          {/* 周庆祝动画 */}
          <button
            onClick={() => setMode('weekly-celebration')}
            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎊 周庆祝动画 (Weekly Celebration)
            <span className="block text-xs font-normal opacity-70 mt-1">
              周目标完成庆祝 + 金色光芒效果
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/celebration/WeeklyCelebration.tsx
            </div>
          </button>

          {/* 简单任务执行页面 */}
          <button
            onClick={() => setMode('simple-execution')}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-800 hover:to-red-950 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            ⏱️ 简单任务执行页面 (Simple Execution)
            <span className="block text-xs font-normal opacity-70 mt-1">
              正计时 + 任务名 + 休息/完成按钮
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/task/SimpleTaskExecutionView.tsx
            </div>
          </button>

          {/* 任务流程控制器 */}
          <button
            onClick={() => setMode('task-flow')}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔗 任务流程控制器
            <span className="block text-xs font-normal opacity-70 mt-1">
              Start → 工作 → 开始庆祝 → 继续/完成 → 结束庆祝
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/task-flow/TaskFlowController.tsx
            </div>
          </button>

          {/* Talking Fire Animation */}
          <button
            onClick={() => setMode('talking-fire')}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔥 Talking Fire Animation
            <span className="block text-xs font-normal opacity-70 mt-1">
              Test the talking fire sprite animation
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/ai/TalkingFire.tsx
            </div>
          </button>

          {/* Fire from Figma */}
          <button
            onClick={() => setMode('fire-from-figma')}
            className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎨 Fire from Figma
            <span className="block text-xs font-normal opacity-70 mt-1">
              Test the fire animation based on Figma design
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/ai/FireFromFigma.tsx
            </div>
          </button>

          {/* Campfire Companion Mode */}
          <button
            onClick={() => setMode('campfire-companion')}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔥 篝火专注模式
            <span className="block text-xs font-normal opacity-70 mt-1">
              Gemini Live + VAD 自动连接 + 计时器
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-purple-300">🧠 Logic</span>
                src/hooks/campfire/useCampfireSession.ts
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-blue-300">🎨 UI</span>
                DevTestPage (CampfireCompanionTest)
              </div>
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">反馈组件</p>

          {/* Feedback Card */}
          <button
            onClick={() => setMode('feedback-card')}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            💬 Feedback Card
            <span className="block text-xs font-normal opacity-70 mt-1">
              橙色反馈卡片（评分 + 文字输入）
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/feedback/FeedbackCard.tsx
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">🔧 后端 API 测试 (Gemini 3 Flash)</p>

          {/* 习惯叠加测试 */}
          <button
            onClick={() => setMode('habit-stacking')}
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔗 习惯叠加 (Habit Stacking)
            <span className="block text-xs font-normal opacity-70 mt-1">
              锚点识别 + AI 推荐挂载方案
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 functions/suggest-habit-stack
            </div>
          </button>

          {/* AI 每日报告测试 */}
          <button
            onClick={() => setMode('daily-report')}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            📊 AI 每日报告
            <span className="block text-xs font-normal opacity-70 mt-1">
              Gemini 3 Flash 生成目标完成报告
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 functions/generate-daily-report
            </div>
          </button>

          {/* 每周行为报告测试 */}
          <button
            onClick={() => setMode('weekly-report')}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            📊 每周行为报告 (Weekly Report)
            <span className="block text-xs font-normal opacity-70 mt-1">
              用户画像 + 跨数据关联 + 循证建议
            </span>
            <div className="mt-2 flex flex-col gap-1">
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-orange-300">🔧 Backend</span>
                functions/weekly-behavior-analyzer
              </div>
              <div className="px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all flex items-center gap-2">
                <span className="text-blue-300">🎨 UI</span>
                src/components/dev/WeeklyReportTest.tsx
              </div>
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">🎤 语音对话测试 (三层 AI 架构)</p>

          {/* 语音对话测试 */}
          <button
            onClick={() => setMode('voice-chat-test')}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎤 语音对话测试
            <span className="block text-xs font-normal opacity-70 mt-1">
              Gemini Live + 意图检测 + 工具调用
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 三层 AI 架构完整测试
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">🔬 Spike 测试</p>

          {/* Session Resumption Spike */}
          <button
            onClick={() => setMode('session-resumption-spike')}
            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔄 Session Resumption Spike
            <span className="block text-xs font-normal opacity-70 mt-1">
              验证 Gemini Live session resume + prompt 切换
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/dev/SessionResumptionSpike.tsx
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">🔒 Screen Time 解锁</p>

          {/* 承诺确认测试 */}
          <button
            onClick={() => setMode('pledge-confirm')}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🔐 承诺确认界面
            <span className="block text-xs font-normal opacity-70 mt-1">
              语音/打字输入承诺内容解锁应用
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 src/components/ConsequencePledgeConfirm.tsx
            </div>
          </button>

          {/* 分隔线 */}
          <div className="border-t border-gray-700 my-2" />
          <p className="text-gray-500 text-xs text-center">任务卡片动画</p>

          {/* 任务完成动画 */}
          <button
            onClick={() => setMode('task-complete-animation')}
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎊 任务完成动画
            <span className="block text-xs font-normal opacity-70 mt-1">
              勾选任务 → 横线 → 彩带 → 卡片消失
            </span>
            <div className="mt-2 px-2 py-1 bg-black/20 rounded text-[10px] font-mono text-left break-all">
              📄 任务完成时的彩带+淡出动画演示
            </div>
          </button>
        </div>

        {/* 返回主页 */}
        <button
          onClick={() => navigate('/onboarding')}
          className="mt-6 text-gray-500 hover:text-gray-300 text-sm underline"
        >
          ← 返回 Onboarding 页面
        </button>
      </div>
    );
  }

  // 各个测试组件
  return (
    <>
      {mode === 'ai-coach' && <AICoachTest onBack={backToMenu} />}
      {mode === 'simple-timer' && <SimpleTimerTest onBack={backToMenu} />}
      {mode === 'check-in' && <CheckInTest onBack={backToMenu} />}
      {mode === 'failure' && <FailureTest onBack={backToMenu} />}
      {mode === 'confirm' && <ConfirmTest onBack={backToMenu} />}
      {mode === 'effects' && <EffectsTest onBack={backToMenu} />}
      {mode === 'example-simple-timer' && <ExampleSimpleTimerWrapper onBack={backToMenu} />}
      {mode === 'example-checkin' && <ExampleCheckInWrapper onBack={backToMenu} />}
      {mode === 'example-failure' && <ExampleFailureWrapper onBack={backToMenu} />}
      {mode === 'example-confirmation' && <ExampleConfirmationWrapper onBack={backToMenu} />}

      {mode === 'start-celebration' && (
        <StartCelebrationView
          onClose={backToMenu}
          onContinue={() => {
            alert('Continue triggered! (Countdown finished or button clicked)');
            backToMenu();
          }}
          onFinish={() => {
            alert('Finish triggered!');
            backToMenu();
          }}
        />
      )}

      {mode === 'task-flow' && (
        <>
          <TaskFlowController taskName="Write a sprint update" initialCountdown={120} />
          <button
            onClick={backToMenu}
            className="fixed top-6 left-6 z-[70] px-4 py-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
          >
            ← 返回菜单
          </button>
        </>
      )}

      {mode === 'simple-execution' && (
        <SimpleTaskExecutionView
          taskName="Take a shower"
          onClose={backToMenu}
          onFinish={() => {
            alert('Finish triggered!');
            backToMenu();
          }}
          onRest={() => {
            alert('Rest triggered!');
          }}
        />
      )}

      {mode === 'talking-fire' && <TalkingFireTest onBack={backToMenu} />}
      {mode === 'fire-from-figma' && <FireFromFigmaTest onBack={backToMenu} />}
      {mode === 'campfire-companion' && <CampfireCompanionTest onBack={backToMenu} />}
      {mode === 'task-complete-animation' && <TaskCompleteAnimationTest onBack={backToMenu} />}
      {mode === 'feedback-card' && <FeedbackCardTest onBack={backToMenu} />}
      {mode === 'habit-stacking' && <HabitStackingTest onBack={backToMenu} />}
      {mode === 'daily-report' && <DailyReportTest onBack={backToMenu} />}
      {mode === 'voice-chat-test' && <VoiceChatTest onBack={backToMenu} />}
      {mode === 'pledge-confirm' && <PledgeConfirmTest onBack={backToMenu} />}
      {mode === 'weekly-report' && <WeeklyReportTest onBack={backToMenu} />}
      {mode === 'weekly-celebration' && <WeeklyCelebrationTest onBack={backToMenu} />}
      {mode === 'session-resumption-spike' && <SessionResumptionSpike onBack={backToMenu} />}
    </>
  );
}

// ============================================
// 测试 7: Talking Fire Animation
// ============================================
function TalkingFireTest({ onBack }: { onBack: () => void }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-8 p-6">
      <h2 className="text-2xl font-bold text-yellow-400">🔥 Talking Fire Test</h2>

      <div className="flex flex-col items-center gap-4 p-8 bg-black/30 rounded-2xl border border-white/10">
        <TalkingFire isSpeaking={isSpeaking} size={120} />
        <p className="text-gray-400 text-sm">
          Status: <span className={isSpeaking ? 'text-green-400' : 'text-gray-500'}>{isSpeaking ? 'Speaking' : 'Silent'}</span>
        </p>
      </div>

      <button
        onClick={() => setIsSpeaking(!isSpeaking)}
        className={`px-8 py-4 font-bold rounded-xl transition-all shadow-lg ${isSpeaking
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
      >
        {isSpeaking ? 'Stop Speaking' : 'Start Speaking'}
      </button>

      <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm underline">
        ← Back to Menu
      </button>
    </div>
  );
}

// ============================================
// 测试 8: Fire from Figma
// ============================================
function FireFromFigmaTest({ onBack }: { onBack: () => void }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-8 p-6">
      <h2 className="text-2xl font-bold text-yellow-400">🎨 Fire from Figma Test</h2>

      <div className="flex flex-col items-center gap-4 p-8 bg-black/30 rounded-2xl border border-white/10">
        <FireFromFigma isSpeaking={isSpeaking} size={120} />
        <p className="text-gray-400 text-sm">
          Status: <span className={isSpeaking ? 'text-green-400' : 'text-gray-500'}>{isSpeaking ? 'Speaking' : 'Silent'}</span>
        </p>
        <p className="text-gray-500 text-xs text-center max-w-xs">
          Based on Figma design. You can edit the animation in FireFromFigma.tsx
        </p>
      </div>

      <button
        onClick={() => setIsSpeaking(!isSpeaking)}
        className={`px-8 py-4 font-bold rounded-xl transition-all shadow-lg ${isSpeaking
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
      >
        {isSpeaking ? 'Stop Speaking' : 'Start Speaking'}
      </button>

      <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm underline">
        ← Back to Menu
      </button>
    </div>
  );
}

// ============================================
// 测试 9: 篝火陪伴模式
// ============================================

/** 篝火陪伴模式布局配置 */
const CAMPFIRE_CONFIG = {
  /** 背景图片宽度（从 companion-bg.png 元数据获取） */
  bgWidth: 1179,
  /** 背景图片高度（从 companion-bg.png 元数据获取） */
  bgHeight: 1926,
  /** 火焰底部在图片中的垂直位置，0-1（从设计稿测量：篝火柴堆顶部） */
  fireBottomY: 0.64,
  /** 火焰宽度占图片宽度的比例，0-1（视觉调优得出） */
  fireWidthRatio: 0.5,
  /** 背景填充色（与图片底部边缘颜色一致，用于填充超出区域） */
  bgColor: '#1D1B3D',
} as const;

function CampfireCompanionTest({ onBack }: { onBack: () => void }) {
  // 使用 useCampfireSession hook
  const session = useCampfireSession({
    userId: 'dev-test-user',
    aiTone: 'gentle',
    language: 'zh',
    idleTimeout: 30,
    vadThreshold: 25,
    onSessionEnd: (stats) => {
      console.log('Session ended:', stats);
      alert(`专注结束！\n时长: ${Math.floor(stats.durationSeconds / 60)}分${stats.durationSeconds % 60}秒\n对话次数: ${stats.chatCount}`);
      onBack();
    },
  });



  // 未开始状态 - 显示开始按钮
  if (session.status === 'idle') {
    return (
      <div
        className="fixed inset-0 w-full h-full overflow-hidden flex flex-col items-center justify-center"
        style={{ backgroundColor: CAMPFIRE_CONFIG.bgColor }}
      >
        {/* 背景图片 */}
        <div className="absolute inset-0 w-full">
          <img
            src="/companion-bg.png"
            alt=""
            className="w-full h-auto block"
          />
        </div>

        {/* 开始按钮 */}
        <div className="relative z-50 text-center">
          <h1 className="text-4xl font-bold text-yellow-400 mb-4" style={{ fontFamily: 'Sansita, sans-serif' }}>
            🔥 篝火专注模式
          </h1>
          <p className="text-white/80 text-lg mb-6">需要时随时可以和我说话</p>
          <button
            onClick={() => session.startSession('测试任务 - 专注工作')}
            className="px-8 py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg text-lg"
          >
            开始专注
          </button>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-black/40 backdrop-blur-sm text-white rounded-full hover:bg-black/60 transition-colors text-sm"
        >
          ← 返回
        </button>
      </div>
    );
  }

  // 进行中状态 - 原来的 UI
  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden"
      style={{ backgroundColor: CAMPFIRE_CONFIG.bgColor }}
    >
      {/* 图片容器 - 宽度 100%，高度按比例自动，顶部对齐 */}
      <div className="relative w-full">
        {/* 背景图片 - 宽度铺满，高度按比例 */}
        <img
          src="/companion-bg.png"
          alt=""
          className="w-full h-auto block"
        />

        {/* 火焰动画 - 相对于图片容器定位，使用百分比确保同步缩放 */}
        <div
          className="absolute left-1/2 z-20"
          style={{
            top: `${CAMPFIRE_CONFIG.fireBottomY * 100}%`,
            width: `${CAMPFIRE_CONFIG.fireWidthRatio * 100}%`,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
        >
          <TalkingFire isSpeaking={session.isSpeaking} size="100%" />
        </div>
      </div>

      {/* 顶部控制区域 */}
      <div className="absolute top-4 left-4 right-4 z-50 flex justify-between">
        {/* 返回按钮 */}
        <button
          onClick={() => session.endSession()}
          className="px-4 py-2 bg-black/40 backdrop-blur-sm text-white rounded-full hover:bg-black/60 transition-colors text-sm"
        >
          ← 结束
        </button>

        {/* 右侧按钮组 */}
        <div className="flex gap-2">
          {/* 白噪音播放按钮 */}
          <button
            onClick={session.toggleAmbient}
            className={`px-4 py-2 rounded-full transition-colors text-sm ${
              session.isAmbientPlaying
                ? 'bg-orange-500/80 text-white'
                : 'bg-black/40 backdrop-blur-sm text-white hover:bg-black/60'
            }`}
          >
            {session.isAmbientPlaying ? '🔥 Sound On' : '🔇 Sound Off'}
          </button>

          {/* 用户静音按钮 */}
          <button
            onClick={session.toggleMute}
            className={`px-4 py-2 rounded-full transition-colors text-sm ${
              session.isMuted
                ? 'bg-red-500/80 text-white'
                : 'bg-black/40 backdrop-blur-sm text-white hover:bg-black/60'
            }`}
          >
            {session.isMuted ? '🚫 Muted' : '🎤 Mic On'}
          </button>
        </div>
      </div>

      {/* 中间状态栏 - 计时器 */}
      <div className="absolute top-1/2 left-0 right-0 z-50 -translate-y-1/2 text-center">
        <div className="text-5xl font-bold text-yellow-400" style={{ fontFamily: 'monospace' }}>
          {session.formattedTime}
        </div>
        <div className="text-white/80 text-sm mt-2">
          🔥 专注中
        </div>
      </div>

      {/* 错误提示 */}
      {session.error && (
        <div className="absolute bottom-20 left-4 right-4 z-50 bg-red-900/90 text-red-100 px-4 py-3 rounded-lg text-sm">
          ❌ {session.error}
        </div>
      )}
    </div>
  );
}

// ============================================
// 测试 1: AI 教练任务流程
// ============================================
function AICoachTest({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'idle' | 'working' | 'celebration'>('idle');
  const [celebrationFlow, setCelebrationFlow] = useState<CelebrationFlow>('success');

  const aiCoach = useAICoachSession({
    initialTime: 60, // 测试用 1 分钟
    onCountdownComplete: () => {
      aiCoach.endSession();
      setCelebrationFlow('confirm');
      setStep('celebration');
    },
  });

  const celebrationAnimation = useCelebrationAnimation({
    enabled: step === 'celebration' && celebrationFlow === 'success',
    remainingTime: aiCoach.state.timeRemaining,
  });

  const handleStartTask = useCallback(async () => {
    try {
      const started = await aiCoach.startSession('Test Task - Get out of bed');
      if (!started) return;
      setStep('working');
    } catch (error) {
      alert('连接失败: ' + (error as Error).message);
    }
  }, [aiCoach]);

  const handleComplete = useCallback(() => {
    aiCoach.endSession();
    setCelebrationFlow('success');
    setStep('celebration');
  }, [aiCoach]);

  const handleRestart = useCallback(() => {
    aiCoach.resetSession();
    setStep('idle');
  }, [aiCoach]);

  if (step === 'idle') {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-yellow-400">🤖 AI 教练任务测试</h2>
        <p className="text-gray-400 text-center">
          点击开始后，会连接 Gemini Live，<br />启用摄像头和麦克风
        </p>
        <p className="text-orange-400 text-sm">⏱️ 测试用倒计时: 1 分钟</p>

        <button
          onClick={handleStartTask}
          disabled={aiCoach.isConnecting}
          className="px-8 py-4 bg-gradient-to-t from-[#ffd039] to-[#feb827] text-black font-bold rounded-xl disabled:opacity-50"
          style={{ boxShadow: '0 6px 0 0 #D34A22' }}
        >
          {aiCoach.isConnecting ? '连接中...' : '🚀 开始任务'}
        </button>

        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm underline">
          ← 返回菜单
        </button>
      </div>
    );
  }

  if (step === 'working') {
    const { canvasRef } = aiCoach;
    return (
      <>
        <canvas ref={canvasRef} className="hidden" />
        <TaskWorkingView
          taskDescription={aiCoach.state.taskDescription}
          time={aiCoach.state.timeRemaining}
          timeMode="countdown"
          camera={{
            enabled: aiCoach.cameraEnabled,
            videoRef: aiCoach.videoRef,
          }}
          aiStatus={{
            isConnected: aiCoach.isConnected,
            error: aiCoach.error,
            waveformHeights: aiCoach.waveformHeights,
          }}
          primaryButton={{
            label: "I'M DOING IT!",
            emoji: '✅',
            onClick: handleComplete,
          }}
          secondaryButton={{
            label: 'BACK',
            emoji: '←',
            onClick: () => {
              aiCoach.endSession();
              onBack();
            },
          }}
        />
      </>
    );
  }

  return (
    <CelebrationView
      flow={celebrationFlow}
      onFlowChange={setCelebrationFlow}
      success={{
        scene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        completionTime: 60 - aiCoach.state.timeRemaining,
        taskDescription: aiCoach.state.taskDescription || 'Test Task',
        ctaButton: {
          label: 'BACK TO MENU',
          onClick: () => {
            handleRestart();
            onBack();
          },
        },
      }}
      failure={{
        button: {
          label: 'TRY AGAIN',
          onClick: handleRestart,
        },
      }}
      confirm={{
        yesButton: {
          label: '✅ YES, I STARTED!!',
          onClick: () => setCelebrationFlow('success'),
        },
        noButton: {
          label: "✕ NO I DIDN'T",
          onClick: () => setCelebrationFlow('failure'),
        },
      }}
    />
  );
}

// ============================================
// 测试 2: 简单计时器（无 AI）
// ============================================
function SimpleTimerTest({ onBack }: { onBack: () => void }) {
  const [time, setTime] = useState(30); // 30 秒测试
  const [isRunning, setIsRunning] = useState(true);

  // 简单的倒计时
  useState(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setTime(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  });

  return (
    <TaskWorkingView
      taskDescription="完成今天的作业 📚"
      time={time}
      timeMode="countdown"
      primaryButton={{
        label: 'COMPLETED',
        emoji: '✅',
        onClick: () => {
          alert('🎉 任务完成！');
          onBack();
        },
      }}
      secondaryButton={{
        label: 'BACK',
        emoji: '←',
        onClick: onBack,
      }}
    />
  );
}

// ============================================
// 测试 3: 打卡直接庆祝
// ============================================
function CheckInTest({ onBack }: { onBack: () => void }) {
  const [showCelebration, setShowCelebration] = useState(false);

  const celebrationAnimation = useCelebrationAnimation({
    enabled: showCelebration,
    remainingTime: 0,
    customCoins: 100,
  });

  if (!showCelebration) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-yellow-400">📅 今日打卡</h2>
        <p className="text-gray-400">2024 年 1 月 15 日</p>
        <p className="text-gray-500 text-sm">连续打卡: 15 天 🔥</p>

        <button
          onClick={() => setShowCelebration(true)}
          className="px-8 py-4 bg-gradient-to-t from-[#ffd039] to-[#feb827] text-black font-bold rounded-xl"
          style={{ boxShadow: '0 6px 0 0 #D34A22' }}
        >
          ✅ 打卡
        </button>

        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm underline">
          ← 返回菜单
        </button>
      </div>
    );
  }

  return (
    <CelebrationView
      flow="success"
      success={{
        scene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        completionTime: 0,
        taskDescription: '今日打卡 ✓',
        levelText: 'DAY 15',
        ctaButton: {
          label: 'CONTINUE',
          onClick: onBack,
        },
      }}
    />
  );
}

// ============================================
// 测试 4: 失败后的鼓励页面
// ============================================
function FailureTest({ onBack }: { onBack: () => void }) {
  return (
    <CelebrationView
      flow="failure"
      failure={{
        title: 'You Can Make It',
        subtitle: 'Next Time!',
        button: {
          label: 'TRY AGAIN',
          onClick: onBack,
        },
      }}
    />
  );
}

// ============================================
// 测试 5: 任务完成确认页面
// ============================================
function ConfirmTest({ onBack }: { onBack: () => void }) {
  const [flow, setFlow] = useState<CelebrationFlow>('confirm');

  const celebrationAnimation = useCelebrationAnimation({
    enabled: flow === 'success',
    remainingTime: 120,
  });

  return (
    <CelebrationView
      flow={flow}
      onFlowChange={setFlow}
      confirm={{
        title: "Time's Up!",
        subtitle: 'Did you complete your task?',
        yesButton: {
          label: '✅ YES, I DID IT!',
          onClick: () => setFlow('success'),
        },
        noButton: {
          label: "✕ NO, I DIDN'T",
          onClick: () => setFlow('failure'),
        },
      }}
      success={{
        scene: celebrationAnimation.scene,
        coins: celebrationAnimation.coins,
        progressPercent: celebrationAnimation.progressPercent,
        showConfetti: celebrationAnimation.showConfetti,
        completionTime: 180,
        taskDescription: '完成测试任务',
        ctaButton: {
          label: 'BACK TO MENU',
          onClick: onBack,
        },
      }}
      failure={{
        button: {
          label: 'TRY AGAIN',
          onClick: () => setFlow('confirm'),
        },
      }}
    />
  );
}

// ============================================
// 测试 6: 动画效果组件
// ============================================
function EffectsTest({ onBack }: { onBack: () => void }) {
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [coinAnimate, setCoinAnimate] = useState(false);
  const [progressAnimate, setProgressAnimate] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center py-8 px-6 gap-8 overflow-y-auto">
      {/* 彩带效果 - 使用自动模式 */}
      <ConfettiEffect trigger={confettiTrigger} />

      <h2 className="text-2xl font-bold text-yellow-400" style={{ fontFamily: 'Sansita, sans-serif' }}>
        ✨ 动画效果组件测试
      </h2>

      <div className="w-full max-w-sm bg-[#2E2B28] rounded-2xl p-4 border border-white/5 space-y-2">
        <p className="text-white font-semibold text-sm flex items-center gap-2">📂 代码定位与打包</p>
        <p className="text-gray-300 text-xs leading-relaxed">
          母组件：src/pages/DevTestPage.tsx (EffectsTest)；在这里统一改样式/交互即可同步所有演示。
        </p>
        <div className="text-[11px] font-mono text-gray-300 space-y-1 break-all bg-black/20 rounded-lg p-3">
          <div>🎉 ConfettiEffect：src/components/effects/ConfettiEffect.tsx</div>
          <div>🪙 CoinCounter：src/components/effects/CoinCounter.tsx</div>
          <div>📊 LevelProgressBar / SimpleProgressBar：src/components/effects/LevelProgressBar.tsx</div>
          <div>🎨 样式：src/components/effects/effects.css</div>
          <div>📦 统一出口：src/components/effects/index.ts（已打包，可直接 import {'{ ... }'} from 'components/effects'）</div>
        </div>
      </div>

      {/* 彩带测试 */}
      <div className="w-full max-w-sm bg-[#2E2B28] rounded-2xl p-4">
        <h3 className="text-white font-bold mb-3">🎊 彩带效果 (ConfettiEffect)</h3>
        <p className="text-gray-400 text-sm mb-4">
          可用于庆祝、打卡成功等场景
        </p>
        <button
          onClick={() => setConfettiTrigger(prev => prev + 1)}
          className="w-full py-2 px-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-lg"
        >
          🎉 播放彩带 (0.5秒，和庆祝页一样)
        </button>
        <div className="mt-3 text-[11px] font-mono text-gray-300 space-y-1 break-all bg-black/20 rounded-lg p-3">
          <div>📄 组件：src/components/effects/ConfettiEffect.tsx</div>
          <div>📦 引用：import {'{ ConfettiEffect }'} from 'src/components/effects'</div>
        </div>
      </div>

      {/* 金币计数测试 */}
      <div className="w-full max-w-sm bg-[#2E2B28] rounded-2xl p-4">
        <h3 className="text-white font-bold mb-3">💰 金币计数 (CoinCounter)</h3>
        <p className="text-gray-400 text-sm mb-4">
          可用于奖励展示、任务完成等场景
        </p>

        <div className="flex justify-center mb-4 min-h-[60px]">
          <CoinCounter
            targetCoins={500}
            animate={coinAnimate}
            duration={2000}
            onAnimationComplete={() => console.log('金币动画完成')}
          />
        </div>

        <button
          onClick={() => {
            setCoinAnimate(false);
            setTimeout(() => setCoinAnimate(true), 100);
          }}
          className="w-full py-2 px-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg"
        >
          🪙 播放金币动画
        </button>
        <div className="mt-3 text-[11px] font-mono text-gray-300 space-y-1 break-all bg-black/20 rounded-lg p-3">
          <div>📄 组件：src/components/effects/CoinCounter.tsx</div>
          <div>📦 引用：import {'{ CoinCounter }'} from 'src/components/effects'</div>
        </div>
      </div>

      {/* 等级进度条测试 */}
      <div className="w-full max-w-sm bg-[#2E2B28] rounded-2xl p-4">
        <h3 className="text-white font-bold mb-3">📊 等级进度条 (LevelProgressBar)</h3>
        <p className="text-gray-400 text-sm mb-4">
          可用于等级展示、任务进度等场景
        </p>

        <div className="mb-4">
          <LevelProgressBar
            progress={progressAnimate ? 80 : progress}
            animate={progressAnimate}
            levelText="LEVEL:5"
            onAnimationComplete={() => {
              setProgressAnimate(false);
              setProgress(80);
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setProgress(0);
              setProgressAnimate(true);
            }}
            className="flex-1 py-2 px-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg text-sm"
          >
            ▶️ 播放动画
          </button>
          <button
            onClick={() => {
              setProgressAnimate(false);
              setProgress(prev => Math.min(100, prev + 20));
            }}
            className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-lg text-sm"
          >
            +20%
          </button>
        </div>
        <div className="mt-3 text-[11px] font-mono text-gray-300 space-y-1 break-all bg-black/20 rounded-lg p-3">
          <div>📄 组件：src/components/effects/LevelProgressBar.tsx</div>
          <div>📦 引用：import {'{ LevelProgressBar }'} from 'src/components/effects'</div>
        </div>
      </div>

      {/* 简单进度条测试 */}
      <div className="w-full max-w-sm bg-[#2E2B28] rounded-2xl p-4">
        <h3 className="text-white font-bold mb-3">📈 简单进度条 (SimpleProgressBar)</h3>
        <p className="text-gray-400 text-sm mb-4">
          轻量级进度条，适合简单场景
        </p>

        <div className="space-y-3 mb-4">
          <SimpleProgressBar progress={30} showPercentage />
          <SimpleProgressBar progress={60} showPercentage gradientStart="#9B59B6" gradientEnd="#8E44AD" />
          <SimpleProgressBar progress={90} showPercentage fillColor="#27AE60" />
        </div>
        <div className="mt-1 text-[11px] font-mono text-gray-300 space-y-1 break-all bg-black/20 rounded-lg p-3">
          <div>📄 组件：src/components/effects/LevelProgressBar.tsx（导出 SimpleProgressBar）</div>
          <div>📦 引用：import {'{ SimpleProgressBar }'} from 'src/components/effects'</div>
        </div>
      </div>

      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-300 text-sm underline mt-4"
      >
        ← 返回菜单
      </button>
    </div>
  );
}

// ============================================
// Example Component Wrappers
// ============================================

/**
 * SimpleTimerExample 的包装器，添加返回按钮
 */
function ExampleSimpleTimerWrapper({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen">
      <SimpleTimerExample />
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
      >
        ← 返回菜单
      </button>
    </div>
  );
}

/**
 * CheckInCelebrationExample 的包装器，添加返回按钮
 */
function ExampleCheckInWrapper({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen">
      <CheckInCelebrationExample />
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm z-50"
      >
        ← 返回菜单
      </button>
    </div>
  );
}

/**
 * FailureEncouragementExample 的包装器，添加返回按钮
 */
function ExampleFailureWrapper({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen">
      <FailureEncouragementExample />
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm z-50"
      >
        ← 返回菜单
      </button>
    </div>
  );
}

/**
 * ConfirmationExample 的包装器，添加返回按钮
 */
function ExampleConfirmationWrapper({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen">
      <ConfirmationExample />
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm z-50"
      >
        ← 返回菜单
      </button>
    </div>
  );
}

// ============================================
// 测试 10: 任务完成动画
// ============================================
interface AnimatedTask {
  id: string;
  text: string;
  displayTime: string;
  icon: string;
  completed: boolean;
  isAnimatingOut: boolean; // 正在播放消失动画
}

function TaskCompleteAnimationTest({ onBack }: { onBack: () => void }) {
  const [tasks, setTasks] = useState<AnimatedTask[]>([
    { id: '1', text: '二个人过', displayTime: '2:23 am', icon: '🌤️', completed: false, isAnimatingOut: false },
    { id: '2', text: '解决', displayTime: '9:00 am', icon: '🌤️', completed: false, isAnimatingOut: false },
    { id: '3', text: 'Take a shower', displayTime: '10:30 am', icon: '🌤️', completed: false, isAnimatingOut: false },
  ]);

  // 是否显示文档
  const [showDocs, setShowDocs] = useState(false);

  // 彩带触发器 - 存储触发的任务ID和位置
  const [confettiConfig, setConfettiConfig] = useState<{
    trigger: number;
    originY: number;
  }>({ trigger: 0, originY: 0.5 });

  const taskRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleToggle = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || task.completed) return;

    // 获取任务卡片位置
    const taskElement = taskRefs.current.get(id);
    let originY = 0.5;
    if (taskElement) {
      const rect = taskElement.getBoundingClientRect();
      originY = (rect.top + rect.height / 2) / window.innerHeight;
    }

    // 1. 先标记完成（显示横线）
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, completed: true } : t
    ));

    // 2. 同时触发彩带（从卡片位置喷出）
    // 2. 同时触发彩带（从卡片位置喷出）
    setConfettiConfig(prev => ({ trigger: prev.trigger + 1, originY }));

    // 3. 等待 500ms 后开始淡出动画
    setTimeout(() => {
      setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, isAnimatingOut: true } : t
      ));
    }, 500);

    // 4. 淡出动画 1 秒后移除卡片
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id));
    }, 1500);
  };

  const resetTasks = () => {
    setTasks([
      { id: '1', text: '二个人过', displayTime: '2:23 am', icon: '🌤️', completed: false, isAnimatingOut: false },
      { id: '2', text: '解决', displayTime: '9:00 am', icon: '🌤️', completed: false, isAnimatingOut: false },
      { id: '3', text: 'Take a shower', displayTime: '10:30 am', icon: '🌤️', completed: false, isAnimatingOut: false },
    ]);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 彩带效果 - 从卡片位置喷出 */}
      <ConfettiEffect
        trigger={confettiConfig.trigger}
        duration={500}
        numberOfPieces={200}
        gravity={0.3}
        recycle={false}
      />

      {/* 顶部标题区域 */}
      <div className="bg-brand-red pt-12 pb-16 px-6 rounded-b-[40px]">
        <h1
          className="text-3xl font-bold text-brand-cream text-center italic"
          style={{ fontFamily: 'Sansita, sans-serif' }}
        >
          Task Complete Animation
        </h1>
        <p className="text-brand-cream/80 text-center mt-2 text-sm">
          点击勾选框完成任务，观察动画效果
        </p>
        {/* 文档按钮 */}
        <button
          onClick={() => setShowDocs(!showDocs)}
          className="mx-auto mt-3 flex items-center gap-2 px-4 py-2 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded-lg text-yellow-400 text-sm font-medium transition-colors shadow-lg border border-yellow-400/30"
        >
          <span>{showDocs ? '📖' : '📚'}</span>
          <span>{showDocs ? '隐藏文档' : '查看组件文档'}</span>
        </button>
      </div>

      {/* 组件文档面板 */}
      {showDocs && (
        <div className="mx-4 -mt-6 mb-4 bg-[#1e1e1e] rounded-2xl p-5 shadow-xl border border-white/10 relative z-10">
          <h2 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
            <span>📍</span> 组件定位与引用说明
          </h2>

          {/* 核心组件文件 */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white mb-2">核心组件文件</h3>
            <div className="space-y-2 text-xs">
              <div className="bg-black/30 rounded-lg p-3">
                <div className="text-blue-400 font-mono mb-1">ConfettiEffect (彩带效果)</div>
                <div className="text-gray-400 font-mono break-all">src/components/effects/ConfettiEffect.tsx</div>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <div className="text-green-400 font-mono mb-1">TaskItem (任务卡片，集成动画)</div>
                <div className="text-gray-400 font-mono break-all">src/components/app-tabs/TaskItem.tsx</div>
              </div>
            </div>
          </div>

          {/* 动画流程 */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white mb-2">动画流程</h3>
            <div className="bg-black/30 rounded-lg p-3 text-xs text-gray-300">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-blue-500/30 px-2 py-1 rounded">勾选任务</span>
                <span className="text-gray-500">→</span>
                <span className="bg-yellow-500/30 px-2 py-1 rounded">横线划掉</span>
                <span className="text-gray-500">→</span>
                <span className="bg-pink-500/30 px-2 py-1 rounded">彩带喷出 (500ms)</span>
                <span className="text-gray-500">→</span>
                <span className="bg-purple-500/30 px-2 py-1 rounded">卡片淡出 (1000ms)</span>
              </div>
            </div>
          </div>

          {/* 使用方式 */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white mb-2">方式 1：使用 TaskItem（推荐）</h3>
            <div className="bg-black/50 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto">
              <pre className="whitespace-pre-wrap">{`import { TaskItem } from '@/components/app-tabs/TaskItem';

<TaskItem
  task={{
    id: '1',
    text: '任务名称',
    displayTime: '9:00 am',
    completed: false
  }}
  icon="🌤️"
  onToggle={(id) => { /* 处理勾选 */ }}
  onDelete={(id) => { /* 处理删除 */ }}
/>`}</pre>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white mb-2">方式 2：单独使用 ConfettiEffect</h3>
            <div className="bg-black/50 rounded-lg p-3 text-xs font-mono text-blue-300 overflow-x-auto">
              <pre className="whitespace-pre-wrap">{`import { ConfettiEffect } from '@/components/effects';

const [trigger, setTrigger] = useState(0);

<ConfettiEffect
  trigger={trigger}      // 值变化时触发
  duration={500}         // 发射持续时间 ms
  numberOfPieces={200}   // 彩带数量
  gravity={0.3}          // 下落速度
  recycle={false}        // 是否循环
/>

// 触发彩带
setTrigger(Date.now());`}</pre>
            </div>
          </div>

          {/* Props 说明 */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">ConfettiEffect Props</h3>
            <div className="bg-black/30 rounded-lg p-3 text-xs">
              <table className="w-full text-gray-300">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">属性</th>
                    <th className="pb-2">类型</th>
                    <th className="pb-2">默认值</th>
                    <th className="pb-2">说明</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr><td className="py-1 text-yellow-400">trigger</td><td>any</td><td>-</td><td className="text-gray-400">值变化时触发</td></tr>
                  <tr><td className="py-1 text-yellow-400">active</td><td>boolean</td><td>-</td><td className="text-gray-400">手动控制模式</td></tr>
                  <tr><td className="py-1 text-yellow-400">duration</td><td>number</td><td>500</td><td className="text-gray-400">发射持续时间(ms)</td></tr>
                  <tr><td className="py-1 text-yellow-400">numberOfPieces</td><td>number</td><td>5000</td><td className="text-gray-400">彩带数量</td></tr>
                  <tr><td className="py-1 text-yellow-400">gravity</td><td>number</td><td>0.25</td><td className="text-gray-400">下落速度</td></tr>
                  <tr><td className="py-1 text-yellow-400">recycle</td><td>boolean</td><td>true</td><td className="text-gray-400">是否循环</td></tr>
                  <tr><td className="py-1 text-yellow-400">colors</td><td>string[]</td><td>['#FF6B6B',...]</td><td className="text-gray-400">彩带颜色</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 任务列表区域 */}
      <div className="flex-1 px-6 py-6 -mt-8">
        <div className="bg-brand-cream inline-block px-4 py-2 rounded-lg mb-3">
          <h3 className="font-serif text-2xl text-[#3A3A3A] italic font-bold flex items-center gap-2">
            Morning <span className="not-italic text-lg opacity-80">🌤️</span>
          </h3>
        </div>

        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              ref={(el) => {
                if (el) taskRefs.current.set(task.id, el);
                else taskRefs.current.delete(task.id);
              }}
              className={`
                bg-gray-50 p-4 rounded-2xl flex items-center justify-between
                transition-all duration-1000 ease-out
                ${task.isAnimatingOut ? 'opacity-0 scale-95 -translate-y-2' : 'opacity-100 scale-100 translate-y-0'}
              `}
              style={{
                transformOrigin: 'center center',
              }}
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggle(task.id)}
                  disabled={task.completed}
                  className={`w-6 h-6 rounded border-[2px] flex items-center justify-center transition-all ${task.completed
                    ? 'bg-brand-goldBorder border-brand-goldBorder'
                    : 'border-brand-goldBorder bg-transparent hover:bg-brand-goldBorder/10'
                    }`}
                >
                  {task.completed && <i className="fa-solid fa-check text-white text-xs"></i>}
                </button>
                <span
                  className={`text-lg text-gray-700 font-medium transition-all duration-300 ${task.completed ? 'line-through decoration-brand-blue/50' : ''
                    }`}
                >
                  {task.text}
                </span>
              </div>
              <div className="bg-brand-cream px-3 py-1 rounded-md min-w-[80px] text-right">
                <span className="text-sm font-bold text-gray-800 italic font-serif flex items-center justify-end gap-1">
                  {task.displayTime}
                  <span className="text-brand-goldBorder">{task.icon}</span>
                </span>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-4">🎉</p>
              <p>所有任务已完成！</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="p-6 space-y-3">
        <button
          onClick={resetTasks}
          className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-xl"
        >
          🔄 重置任务
        </button>
        <button
          onClick={onBack}
          className="w-full py-3 px-6 bg-gray-200 text-gray-700 font-bold rounded-xl"
        >
          ← 返回菜单
        </button>
      </div>
    </div>
  );
}

// ============================================
// 测试 11: Feedback Card
// ============================================
function FeedbackCardTest({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-8 p-6">
      <h2 className="text-2xl font-bold text-gray-800">💬 Feedback Card Test</h2>
      <p className="text-gray-500 text-sm text-center max-w-sm">
        橙色反馈卡片，包含心形评分和文字反馈输入框
      </p>

      <div className="w-full max-w-md">
        <FeedbackCard
          onInterviewRequest={() => {
            alert('Interview modal would show here!');
          }}
        />
      </div>

      <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm underline">
        ← Back to Menu
      </button>
    </div>
  );
}

// ============================================
// 测试 12: 承诺确认界面 (Screen Time 解锁)
// ============================================
function PledgeConfirmTest({ onBack }: { onBack: () => void }) {
  const [showModal, setShowModal] = useState(false);

  // 示例数据 (英文示例，匹配 Figma 设计稿)
  const exampleData = {
    taskName: 'Packing your luggage',
    consequence: "I might miss my flight because I didn't finish packing on time.",
    pledge: "I accept the consequence that I might miss my flight because I didn't finish packing on time.",
    scheduledTime: '12:30 pm',
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-2xl font-bold text-yellow-400">🔐 承诺确认界面测试</h2>

      <div className="text-center space-y-4 max-w-md">
        <p className="text-gray-400">
          这是 Screen Time 解锁时显示的承诺确认界面。
        </p>
        <p className="text-gray-500 text-sm">
          用户需要通过<span className="text-blue-400">【语音】</span>或
          <span className="text-green-400">【打字】</span>输入承诺内容才能解锁应用。
        </p>
      </div>

      {/* 示例数据展示 */}
      <div className="w-full max-w-md bg-[#2a2a2a] rounded-xl p-4 space-y-3">
        <h3 className="text-white font-bold text-sm">📋 测试数据</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">任务名称：</span>
            <span className="text-white">{exampleData.taskName}</span>
          </div>
          <div>
            <span className="text-gray-500">后果提示：</span>
            <span className="text-orange-400">{exampleData.consequence}</span>
          </div>
          <div>
            <span className="text-gray-500">承诺内容：</span>
            <span className="text-blue-400">{exampleData.pledge}</span>
          </div>
        </div>
      </div>

      {/* 打开弹窗按钮 */}
      <button
        onClick={() => setShowModal(true)}
        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-lg"
      >
        🔓 打开承诺确认界面
      </button>

      {/* 提示 */}
      <div className="text-center space-y-2 max-w-md">
        <p className="text-gray-500 text-xs">
          💡 提示：语音识别需要后端 speech-to-text 函数运行
        </p>
        <p className="text-gray-500 text-xs">
          📝 打字输入会自动验证相似度（≥70% 通过）
        </p>
      </div>

      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-300 text-sm underline"
      >
        ← 返回菜单
      </button>

      {/* 承诺确认弹窗 */}
      {showModal && (
        <ConsequencePledgeConfirm
          taskName={exampleData.taskName}
          consequence={exampleData.consequence}
          pledge={exampleData.pledge}
          scheduledTime={exampleData.scheduledTime}
          onUnlocked={() => {
            alert('🎉 验证通过！应用已解锁');
            setShowModal(false);
          }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ============================================
// 测试 13: 周庆祝动画
// ============================================
function WeeklyCelebrationTest({ onBack }: { onBack: () => void }) {
  const [showCelebration, setShowCelebration] = useState(false);

  return (
    <>
      {!showCelebration ? (
        <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 p-6">
          <h2 className="text-2xl font-bold text-yellow-400">🎊 周庆祝动画测试</h2>

          <div className="text-center space-y-4 max-w-md">
            <p className="text-gray-400">
              这是周目标完成时显示的庆祝动画。
            </p>
            <p className="text-gray-500 text-sm">
              包含金色放射光芒、数字展示和激励文案。
            </p>
          </div>

          {/* 示例数据展示 */}
          <div className="w-full max-w-md bg-[#2a2a2a] rounded-xl p-4 space-y-3">
            <h3 className="text-white font-bold text-sm">📋 测试数据</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">标题：</span>
                <span className="text-white">Weekly Wins!</span>
              </div>
              <div>
                <span className="text-gray-500">副标题：</span>
                <span className="text-orange-400">Small Wins, Big Change</span>
              </div>
              <div>
                <span className="text-gray-500">完成次数：</span>
                <span className="text-blue-400">2 次</span>
              </div>
              <div>
                <span className="text-gray-500">激励文案：</span>
                <span className="text-green-400">You showed up! That&apos;s a win.</span>
              </div>
            </div>
          </div>

          {/* 触发按钮 */}
          <button
            onClick={() => setShowCelebration(true)}
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-lg"
          >
            🎉 触发周庆祝动画
          </button>

          {/* 提示 */}
          <div className="text-center space-y-2 max-w-md">
            <p className="text-gray-500 text-xs">
              💡 提示：动画会自动在 3 秒后关闭
            </p>
            <p className="text-gray-500 text-xs">
              👆 或点击屏幕任意位置手动关闭
            </p>
          </div>

          {/* 返回按钮 */}
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-300 text-sm underline"
          >
            ← 返回菜单
          </button>
        </div>
      ) : null}

      {/* 周庆祝动画 */}
      <WeeklyCelebration
        visible={showCelebration}
        count={2}
        icon="🌙"
        centerIcon="🎯"
        onClose={() => {
          setShowCelebration(false);
        }}
      />
    </>
  );
}

export default DevTestPage;
