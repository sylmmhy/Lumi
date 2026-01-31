# Lumi Web 架构文档

> 最后更新：2026-01-29

本目录包含 Lumi Web 应用的核心架构文档。这些文档必须保持最新。

## 文档索引

| 文档 | 说明 | 维护状态 |
|------|------|---------|
| [supabase-local-development.md](./supabase-local-development.md) | **Supabase 本地开发**：环境设置、版本管理、同步部署 | ✅ 活跃维护 |
| [memory-system.md](./memory-system.md) | 记忆系统架构：向量嵌入、去重合并、双轨系统 | ✅ 活跃维护 |
| [identity-resolution.md](./identity-resolution.md) | 身份关联系统：跨设备用户识别、分析平台集成 | ✅ 活跃维护 |
| [goal-system.md](./goal-system.md) | **Goal 系统架构**：目标管理、动态调整、每日报告 | ✅ 活跃维护 |

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     Lumi Web Application                     │
├─────────────────────────────────────────────────────────────┤
│  UI Layer                                                    │
│  ├── Pages (AppTabsPage, HabitOnboardingPage, etc.)         │
│  └── Components (TaskWorkingView, CelebrationView, etc.)    │
├─────────────────────────────────────────────────────────────┤
│  Hooks Layer                                                 │
│  ├── useAICoachSession (核心会话管理)                        │
│  ├── useGeminiLive (AI 连接)                                │
│  ├── useVirtualMessages (虚拟消息调度)                       │
│  └── useVoiceActivityDetection (VAD 防打断)                 │
├─────────────────────────────────────────────────────────────┤
│  Backend Layer (Supabase Edge Functions)                    │
│  ├── memory-extractor (记忆提取与向量搜索)                   │
│  ├── get-system-instruction (AI 系统指令生成)               │
│  ├── daily-goal-adjustment (目标动态调整)                   │
│  ├── generate-daily-report (每日报告生成)                   │
│  └── send-voip-push / send-fcm-push (推送通知)              │
├─────────────────────────────────────────────────────────────┤
│  External Services                                           │
│  ├── Gemini Live API (多模态 AI)                            │
│  ├── Azure OpenAI (记忆 LLM + Embeddings + Goal 评分)       │
│  └── Supabase (PostgreSQL + Auth + Storage)                 │
└─────────────────────────────────────────────────────────────┘
```

## 核心架构决策

详细决策记录请参见 [../KEY_DECISIONS.md](../KEY_DECISIONS.md)

**关键决策摘要**：
- **Web-First 架构**：iOS/Android 使用 WebView 包装
- **Hooks 组合模式**：禁止在组件中直接调用 API
- **双轨记忆系统**：内部实现 + Mem0 备份
- **VAD 防打断**：必须检测用户说话状态
- **Goal-Task 分离**：Goal 通过 goal_routines 关联到 tasks，不修改 tasks 表

## 更新指南

当以下情况发生时，必须更新相关架构文档：

1. **数据流变化** → 更新相关模块文档
2. **新增核心系统** → 创建新的架构文档
3. **API 接口变更** → 更新涉及的所有文档
4. **重大技术决策** → 更新 KEY_DECISIONS.md
