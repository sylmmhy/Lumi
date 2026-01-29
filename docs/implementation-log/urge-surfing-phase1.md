# Urge Surfing Phase 1 - 实现文档

> 完成日期: 2026-01-30
> 状态: ✅ 已完成

## 功能概述

**Urge Surfing（冲动冲浪）** 是一个帮助用户在打开分心应用前"暂停一下"的功能。通过 30 秒的呼吸练习，让用户有机会重新审视自己的选择。

### 核心理念

- **不是阻止，是觉察**：用户始终有选择权，功能只是增加"摩擦"
- **90 秒冲动曲线**：研究表明冲动在 90 秒后会自然消退
- **自主设置的守护**：用户自己选择要拦截的应用

---

## 架构设计

### 技术方案：iOS Shortcuts Automation

选择 Shortcuts 方案而非 Screen Time API 的原因：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Shortcuts（已选）** | 无需特殊权限，可立即发布 | 需要用户手动设置 |
| Screen Time API | 系统级集成 | 需要 3-5 周审批 Family Controls Entitlement |

### 数据流

```
用户点击分心应用
       ↓
iOS Shortcuts 自动化触发
       ↓
打开 URL: lumi://urge-surfing?app=com.xxx.xxx
       ↓
Lumi App 激活，WebView 加载 /urge-surfing
       ↓
检查冷却状态
   ├── 在冷却期 → 直接打开目标应用
   └── 不在冷却期 → 显示呼吸页面
              ↓
         30 秒呼吸动画
              ↓
         显示选择按钮
         ├── "返回 Lumi" → 记录 surfed 事件 → 跳转首页
         └── "继续使用" → 记录 breakthrough 事件
                              ↓
                    设置冷却期（默认 15 分钟）
                    创建反思表单（次日显示）
                              ↓
                         打开目标应用
```

### 反思表单流程

```
用户打开 Lumi（次日起）
       ↓
检查 pending reflections (show_after <= now)
       ↓
有待显示的表单？
   ├── 否 → 正常进入首页
   └── 是 → 显示反思表单
           ├── 填写 → 提交 → 可选生成后果记忆
           ├── 跳过 → 间隔递增（2→4→8→16 天）
           └── 删除 → 永久忽略此事件
```

---

## 数据库设计

### 表结构

#### app_block_events
记录每次拦截事件的结果。

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_type` | enum | `intercepted`（被拦截）/ `surfed`（成功冲浪）/ `breakthrough`（突破） |
| `surfing_phase` | enum | `breathing`（Phase 1）/ `ai_call`（Phase 2） |
| `cooldown_expires_at` | timestamp | 冷却期结束时间（仅 breakthrough 时设置） |

#### reflection_forms
反思表单队列，支持递增间隔。

| 字段 | 类型 | 说明 |
|------|------|------|
| `show_after` | timestamp | 何时开始显示（突破当日 23:59:59） |
| `skip_count` | int | 跳过次数 |
| `next_show_interval_days` | int | 下次显示间隔（2→4→8→16） |
| `auto_expire_at` | timestamp | 首次跳过后 16 天自动过期 |

#### urge_consequences（Phase 2 使用）
存储用户描述的应用使用后果，供 AI 在冲动时唤醒。

### RPC 函数

| 函数 | 用途 |
|------|------|
| `get_pending_reflections(user_id)` | 获取最早的待显示表单 |
| `check_app_cooldown(user_id, app_id)` | 检查应用是否在冷却期 |
| `get_app_block_stats(user_id, app_id, days)` | 获取拦截统计数据 |

---

## 组件设计

### BreathingAnimation

4-4-4 呼吸节奏动画：
- **吸气 4 秒**：圆圈放大，蓝色渐变
- **屏住 4 秒**：圆圈保持，紫色渐变
- **呼气 4 秒**：圆圈缩小，青色渐变

外圈进度环显示总剩余时间。

### ChoiceButtons

两个选择按钮设计：
- **主按钮**：返回 Lumi（白色实心，醒目）
- **次按钮**：继续使用应用（半透明，带冷却时间提示）

### StarRating

支持半星的评分组件：
- 点击星星左半部分 = 0.5 星
- 点击星星右半部分 = 1.0 星
- 再次点击当前值 = 清零

---

## iOS 原生集成

### 消息处理器

| 消息名 | 功能 |
|--------|------|
| `urgeBlockOpenShortcuts` | 打开 iOS Shortcuts App |
| `urgeBlockOpenApp` | 通过 URL Scheme 打开指定应用 |
| `urgeBlockSetCooldown` | 设置应用冷却状态 |

### CooldownManager

使用 UserDefaults 存储冷却状态，支持：
- 按应用 ID 查询/设置冷却期
- 自动清理过期记录
- 线程安全访问

### URL Scheme

```
lumi://urge-surfing?app=com.instagram.instagram&name=Instagram
```

---

## 测试指南

### 1. 数据库测试

#### 应用迁移文件

```bash
cd ../Lumi-supabase
npx supabase db reset --local
```

验证表创建成功：
```bash
docker exec supabase_db_firego-local psql -U postgres -d postgres -c "\dt" | grep -E "(app_block|urge_con|reflection)"
```

预期输出：
```
app_block_events
urge_consequences
reflection_forms
```

#### 验证 RPC 函数

```bash
docker exec supabase_db_firego-local psql -U postgres -d postgres -c "
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%pending%' OR routine_name LIKE '%cooldown%' OR routine_name LIKE '%block%';"
```

### 2. Edge Functions 测试

启动本地函数服务：
```bash
cd ../Lumi-supabase
npx supabase functions serve --env-file supabase/.env.local
```

#### 测试 record-urge-event

```bash
curl -X POST http://localhost:54321/functions/v1/record-urge-event \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blockedAppId": "com.instagram.instagram",
    "blockedAppName": "Instagram",
    "eventType": "breakthrough",
    "surfingPhase": "breathing",
    "surfingDurationSeconds": 30,
    "cooldownMinutes": 15
  }'
```

预期响应：
```json
{
  "success": true,
  "eventId": "uuid",
  "cooldownExpiresAt": "2026-01-30T12:15:00.000Z",
  "reflectionFormId": "uuid"
}
```

#### 测试 get-pending-reflections

```bash
curl -X POST http://localhost:54321/functions/v1/get-pending-reflections \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3. 前端测试

#### 启动开发服务器

```bash
cd Lumi
npm run dev:local
```

#### 测试 Urge Surfing 页面

直接访问（模拟 Shortcuts 触发）：
```
http://localhost:5173/urge-surfing?app=com.instagram.instagram&name=Instagram
```

**测试检查点：**
- [ ] 呼吸动画正常显示，4-4-4 节奏
- [ ] 30 秒倒计时准确
- [ ] 倒计时结束后显示选择按钮
- [ ] "返回 Lumi" 跳转到首页
- [ ] "继续使用应用" 按钮显示冷却时间提示

#### 测试反思表单页面

直接访问：
```
http://localhost:5173/reflection
```

**测试检查点：**
- [ ] 无待填写表单时显示"全部完成"
- [ ] 有表单时显示应用信息和事件时间
- [ ] 星级评分组件支持半星
- [ ] 提交/跳过/删除三个按钮功能正常
- [ ] 删除时显示确认弹窗

#### 测试设置组件

访问 Profile 页面（需要登录）：
```
http://localhost:5173/app/profile
```

**测试检查点：**
- [ ] "冲动阻止" 设置卡片显示
- [ ] 点击展开显示详细设置
- [ ] 启用开关功能正常
- [ ] 冷却时间选择功能正常
- [ ] 应用选择弹窗显示常用应用列表
- [ ] "设置 iOS 快捷指令" 按钮显示引导弹窗

### 4. iOS 原生测试（需要 Xcode）

#### 编译 iOS 项目

```bash
cd ../mindboat-ios-web-warpper
open MindBoat.xcworkspace
```

**注意**：需要手动将新文件添加到 Xcode 项目：
1. 将 `UrgeBlockMessageHandler.swift` 添加到 `MindBoat/WebView/Handlers/`
2. 将 `CooldownManager.swift` 和 `ShortcutsHelper.swift` 添加到 `MindBoat/UrgeBlock/`
3. 在 `WebViewController.swift` 中注册 `UrgeBlockMessageHandler`

#### 测试 URL Scheme

在模拟器或真机上测试：
```bash
xcrun simctl openurl booted "lumi://urge-surfing?app=com.instagram.instagram&name=Instagram"
```

### 5. 端到端测试流程

1. **设置阶段**
   - 登录 Lumi
   - 进入 Profile → 冲动阻止 → 启用功能
   - 添加 Instagram 到被阻止列表
   - 点击"设置 iOS 快捷指令"，按照引导在 Shortcuts App 中创建自动化

2. **拦截阶段**
   - 打开 Instagram
   - Shortcuts 自动运行，跳转到 Lumi
   - 完成 30 秒呼吸练习
   - 选择"返回 Lumi"或"继续使用应用"

3. **冷却期测试**
   - 选择"继续使用应用"后
   - 15 分钟内再次打开 Instagram
   - 验证：应直接跳转到 Instagram，不显示呼吸页面

4. **反思表单测试**
   - 完成一次"突破"后
   - 等待到次日（或手动修改数据库 `show_after` 字段）
   - 打开 Lumi
   - 验证：显示反思表单
   - 测试填写/跳过/删除功能

---

## 已知限制

1. **Shortcuts 需要手动设置**：每个要拦截的应用都需要用户在 iOS Shortcuts 中创建自动化
2. **iOS 16 以下需要确认**：iOS 17+ 支持"立即运行"无需确认，低版本需要用户点击确认
3. **用户可轻松绕过**：关闭 Shortcuts 自动化即可绕过，但这符合"自主选择"的设计理念
4. **Web 端功能受限**：在浏览器中无法自动拦截应用，只能手动访问 urge-surfing 页面

---

## Phase 2 预留

Phase 1 已预留以下 Phase 2 所需的基础设施：

- `urge_consequences` 表：存储失败后果记忆
- `surfing_phase` 字段：支持 `ai_call` 阶段
- `emotional_weight` 字段：用于 AI 选择唤醒哪个后果

Phase 2 主要工作：
1. 替换呼吸页面为 Gemini Live AI 电话
2. 创建 `get-urge-system-instruction` Edge Function
3. 实现记忆唤醒功能（检测用户抗拒时调用）
