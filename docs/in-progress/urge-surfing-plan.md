# Urge Surfing 功能实现计划

> 创建日期: 2026-01-30
> 最后更新: 2026-01-30

## 功能概述

当用户试图打开被阻止的应用时，Lumi 拦截并帮助用户"冲浪冲动"——通过陪伴帮助用户度过冲动最强烈的时期。

### 核心理念

- **90 秒冲动曲线**：研究表明冲动在 90 秒后会自然消退
- **不是阻止，是觉察**：用户始终有选择权
- **自主设置的守护**：用户自己决定拦截哪些应用

---

## 两阶段实现

| 阶段 | 核心功能 | 时长 | 状态 |
|------|---------|------|------|
| **Phase 1** | 呼吸页面 + 选择按钮 + 反思表单 | 30 秒 | ✅ 已完成 |
| **Phase 2** | Gemini Live AI 电话 + 记忆唤醒 | 90 秒 | ⏳ 待开始 |

---

## Phase 1：呼吸练习（✅ 已完成）

### 功能范围

1. **呼吸页面** - 30 秒 4-4-4 呼吸动画
2. **选择按钮** - "返回 Lumi" / "继续使用应用"
3. **冷却期** - 突破后 15 分钟内不再拦截
4. **反思表单** - 次日询问使用体验（递增间隔：2→4→8→16 天）
5. **设置页面** - 启用/禁用、冷却时间、应用选择

### 已完成的文件

#### 数据库
- `Lumi-supabase/supabase/migrations/20260130100000_urge_surfing_tables.sql`
  - `app_block_events` 表：拦截事件记录
  - `reflection_forms` 表：反思表单队列
  - `urge_consequences` 表：失败后果记忆（Phase 2 使用）
  - `users.urge_block_settings` 字段
  - RPC 函数：`get_pending_reflections`, `check_app_cooldown`, `get_app_block_stats`

#### 后端 Edge Functions
| 函数 | 功能 |
|------|------|
| `record-urge-event` | 记录拦截/冲浪/突破事件 |
| `submit-reflection` | 提交反思表单 |
| `skip-reflection` | 跳过/删除反思表单 |
| `get-pending-reflections` | 获取待显示的反思表单 |

#### Web 前端
| 文件 | 功能 |
|------|------|
| `src/pages/urge/UrgeSurfingPage.tsx` | 冲动冲浪主页面 |
| `src/pages/urge/ReflectionFormPage.tsx` | 反思表单页面 |
| `src/components/urge/BreathingAnimation.tsx` | 4-4-4 呼吸动画 |
| `src/components/urge/ChoiceButtons.tsx` | 选择按钮 |
| `src/components/urge/StarRating.tsx` | 评分组件 |
| `src/components/profile/UrgeBlockSettings.tsx` | 设置组件 |
| `src/hooks/useUrgeBlockBridge.ts` | iOS 原生桥接 |
| `src/hooks/usePendingReflections.ts` | 反思表单管理 |

#### iOS 原生
| 文件 | 功能 |
|------|------|
| `MindBoat/WebView/Handlers/UrgeBlockMessageHandler.swift` | 消息处理器 |
| `MindBoat/UrgeBlock/CooldownManager.swift` | 冷却状态管理 |
| `MindBoat/UrgeBlock/ShortcutsHelper.swift` | Shortcuts 集成辅助 |

#### 国际化
- `src/locales/en.json` - 英文翻译已添加
- `src/locales/zh.json` - 中文翻译已添加

### 待完成的 iOS 集成工作

1. **将新文件添加到 Xcode 项目**
   - 在 Xcode 中将 3 个 Swift 文件添加到项目

2. **注册消息处理器**
   ```swift
   // WebViewController.swift - setupMessageHandlers()
   let urgeBlockHandler = UrgeBlockMessageHandler()
   messageRouter.register(urgeBlockHandler)
   ```

3. **添加 URL Scheme**
   - 在 `Info.plist` 添加 `lumi://` URL Scheme

4. **处理深层链接**
   - 在 `SceneDelegate.swift` 处理 `lumi://urge-surfing` URL

---

## Phase 2：AI 电话陪伴（⏳ 待开始）

### 功能范围

1. **替换呼吸为 AI 电话** - 90 秒 Gemini Live 对话
2. **专属系统提示词** - 温和、不评判的对话策略
3. **记忆唤醒** - 检测用户抗拒时，调用历史后果记忆

### 用户流程

```
用户打开被阻止应用
       ↓
Lumi 拦截，自动开始 AI 电话
       ↓
Lumi: "我看到你想打开 Instagram。
       发生了什么事吗？"
       ↓
用户可能说: "我就想刷一下..."
       ↓
Lumi: "我理解。上次你用了 3 小时后
       说感觉很空虚，记得吗？"  ← 记忆唤醒
       ↓
90 秒后显示选择按钮
```

### 技术实现

#### 新增 Edge Function
| 函数 | 功能 |
|------|------|
| `get-urge-system-instruction` | 生成冲动冲浪专用系统提示词 |
| `get-urge-consequences` | 获取用户的失败后果记忆 |

#### 新增 Hook
| Hook | 功能 |
|------|------|
| `useUrgeAISession` | 基于 `useAICoachSession` 的冲动场景变体 |

#### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `UrgeSurfingPage.tsx` | 支持 `breathing` / `ai_call` 两种模式切换 |
| `record-urge-event` | 扩展支持 `ai_call` surfing_phase |

### 记忆唤醒逻辑

```
AI 检测到用户抗拒
  ├── 关键词: "就想刷一下", "没事", "快点"
  └── 语气: 不耐烦、敷衍
       ↓
调用 get-urge-consequences
  ├── 优先返回该应用的历史后果
  └── 按 emotional_weight 排序
       ↓
AI 温和地引用后果
  └── "上次你提到..."
       ↓
每次对话最多唤醒一次
```

### 系统提示词要点

```
你是 Lumi，用户的 AI 教练。用户正试图打开 {{app_name}}。

你的目标：
- 帮助用户度过冲动的高峰期（约 90 秒）
- 不评判、不说教
- 如果用户坚持要用，尊重他们的选择

记忆唤醒触发条件：
- 用户表现出敷衍或不耐烦
- 触发后引用 {{consequence_memory}}

禁止：
- 说"你应该..."
- 说"这对你不好"
- 强迫用户改变主意
```

---

## 技术方案：iOS Shortcuts Automation

### 为什么选择 Shortcuts 而非 Screen Time API

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Shortcuts（已选）** | 无需特殊权限，可立即发布 | 需要用户手动设置 |
| Screen Time API | 系统级集成，更流畅 | 需要 3-5 周审批 Family Controls Entitlement |

### 用户设置流程

```
Lumi 设置页面 → "添加应用拦截"
  ↓
打开 iOS Shortcuts App
  ↓
引导用户创建自动化：
  - 触发器："当 App 打开时" → 选择目标应用
  - 动作："打开 URL" → lumi://urge-surfing?app=xxx
  - 设置："立即运行"（iOS 17+）
  ↓
返回 Lumi，记录已配置的应用
```

### 未来升级路径

如果获得 Family Controls Entitlement：
1. 使用 `FamilyActivityPicker` 让用户选择应用
2. 使用 `ManagedSettingsStore` 真正阻止应用
3. 使用 `ShieldActionDelegate` 自定义拦截界面
4. 保持数据库和 Web 前端代码不变，仅修改 iOS 原生层

---

## 已知限制

1. **Shortcuts 需要手动设置** - 每个应用需单独配置
2. **iOS 16 以下需要确认** - iOS 17+ 支持"立即运行"
3. **用户可轻松绕过** - 符合"自主选择"设计理念
4. **Web 端功能受限** - 浏览器无法自动拦截

---

## 风险与缓解

| 风险 | 严重性 | 缓解方案 |
|------|--------|---------|
| 用户不愿手动设置 Shortcuts | 中 | 提供详细引导 + 视频教程 |
| iOS 版本差异 | 中 | iOS 17+ 优先，低版本需确认 |
| 用户绕过 Shortcuts | 低 | 符合"自主选择"理念 |
| 用户感觉被监视 | 中 | 强调"自我设置的守护"叙事 |

---

## 相关文档

- [Phase 1 实现详情](../implementation-log/urge-surfing-phase1.md) - 包含测试指南
