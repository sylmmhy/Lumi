# FireGo 产品架构

## 项目概览
FireGo 是一个 AI 陪伴专注应用，帮助用户克服拖延、完成任务。

## 技术栈
- **前端**: React 19 + TypeScript + Vite
- **样式**: Tailwind CSS
- **后端**: Supabase (Auth + Database + Edge Functions)
- **AI**: Google Gemini Live API

## 多端架构
```
┌─────────────────────────────────────────────┐
│              Web App (React)                │  ← 核心代码在这里
│         /firego--original-web               │
└─────────────────────────────────────────────┘
           ↑                    ↑
    ┌──────┴──────┐      ┌─────┴──────┐
    │  iOS 壳子    │      │ Android 壳子│
    │  (WebView)  │      │  (WebView)  │
    └─────────────┘      └────────────┘
```

## 目录结构
```
src/
├── pages/           # 页面组件
│   ├── AppTabsPage.tsx      # 主界面（首页、统计、个人中心）
│   ├── LoginPage.tsx        # 登录页
│   └── onboarding/          # 新手引导流程
│
├── components/      # UI 组件
│   ├── app-tabs/    # 主界面各 Tab 的视图
│   ├── task/        # 任务执行界面
│   ├── celebration/ # 完成庆祝界面
│   ├── ai/          # AI 火焰动画
│   ├── effects/     # 动画特效（纸屑、金币）
│   └── modals/      # 各种弹窗
│
├── hooks/           # 自定义 Hooks
│   ├── useAICoachSession.ts   # ⭐ 核心：AI 教练会话
│   ├── useGeminiLive.ts       # ⭐ 核心：Gemini 连接
│   ├── useOnboardingFlow.ts   # 新手引导状态机
│   └── gemini-live/           # Gemini 底层实现
│
├── context/         # 全局状态
│   ├── AuthContext.tsx        # 用户认证
│   └── LanguageContext.tsx    # 多语言
│
├── lib/             # 工具库
│   ├── supabase.ts            # Supabase 客户端
│   └── amplitude.ts           # 数据埋点
│
└── utils/           # 工具函数
```

## 核心功能模块

### 1. AI 教练会话 (useAICoachSession)
用户工作时的 AI 陪伴逻辑，包括：
- Gemini Live 语音连接
- VAD 语音活动检测
- 虚拟消息（系统给 AI 的隐藏指令）
- 任务计时器

### 2. 新手引导 (Onboarding)
状态流转：`welcome → running → working → completed`

### 3. 主界面 (AppTabsPage)
- Home: 任务列表
- Urgency: 快速开始
- Stats: 数据统计
- Profile: 个人设置

## 数据流
```
用户操作 → React 组件 → Hooks → Supabase API → 数据库
                              ↓
                         Gemini API (AI)
```

---
*最后更新: 2026-01-14*
