# 身份关联系统说明文档

## 📋 概述

本项目实现了一套**跨设备、跨账号的身份关联系统**，能够识别同一个人在不同设备、不同账号下的所有行为。

## 🎯 设计目标

### 用户场景
```
用户小明：
1. 在电脑上登录账号 A → 使用一段时间 → 退出
2. 在电脑上登录账号 B → 使用一段时间 → 退出
3. 在手机上登录账号 A → 使用一段时间 → 退出

期望结果：
系统能够识别出：
- 电脑和手机属于同一个人（通过账号 A 关联）
- 账号 A 和账号 B 属于同一个人（通过电脑设备关联）
- 所有数据都应该归属到"小明"这一个人
```

## 🏗️ 架构设计

### 三层身份标识

| 层级 | 标识符 | 作用 | 持久性 |
|------|--------|------|--------|
| **永久设备用户 ID** | `firego_permanent_user_id` | 识别"这个设备上的人" | ✅ 永久（localStorage） |
| **设备 ID** | Device ID | 设备的技术标识 | ✅ 永久 |
| **账号 ID** | User ID | 当前登录的账号 | 🔄 可切换 |

### 关键实现

#### 1. 永久设备用户 ID 生成
```typescript
// 存储在 localStorage 中，永不改变
const permanentUserId = `puid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
localStorage.setItem('firego_permanent_user_id', permanentUserId)
```

**特点：**
- ✅ 跨会话持久化
- ✅ 即使退出登录也不清除
- ✅ 即使切换账号也不改变
- ✅ 唯一识别"这个设备上的人"

#### 2. PostHog 身份关联（Correct Identify Logic）

**⚠️ 修正说明：** 不要使用 `bootstrap`，因为这会导致原生匿名 ID 丢失，产生数据断层。正确的做法是在初始化后立即进行 `identify`。

```typescript
// 1. 正常初始化（不要用 bootstrap）
posthog.init(apiKey, {
  api_host: '...',
  // bootstrap: { distinctID: permanentUserId }, // ❌ 错误写法，不要用这个
})

// 2. 关键修正：将原生匿名 ID 合并到永久设备 ID
const currentId = posthog.get_distinct_id()
if (currentId !== permanentUserId) {
  // 这步操作会将浏览器生成的匿名 ID (anon_xxx) 与我们的 puid 强行合并
  // 从而保证初始化前的行为也能归属到这个人
  posthog.identify(permanentUserId)
}

// 3. 登录时建立关联（保持不变）
// 只有当 userId 不等于 puid 时才尝试 alias，避免自己关联自己
if (userId !== permanentUserId) {
    posthog.alias(userId, permanentUserId)
}
```

**工作原理（修正后）：**
```
1. 浏览器加载 -> PostHog 生成原生匿名 ID: anon_123
2. 代码执行 -> 检测到 anon_123 != puid_pc_123
3. 执行 identify(puid_pc_123) -> PostHog 将 anon_123 合并进 puid_pc_123
4. 结果：初始化前的页面浏览行为 + 初始化后的行为 = 同一个人 ✅
```

#### 3. Amplitude 身份关联（使用 Device ID）

```typescript
// 使用永久设备用户 ID 作为 Device ID
amplitude.init(apiKey, undefined, {
  deviceId: permanentUserId,
})

// 登录时设置 User ID
amplitude.setUserId(userId)
```

**工作原理：**
- Device ID 保持不变（永久设备用户 ID）
- User ID 随账号切换而变化
- Amplitude 通过 Device ID 自动关联所有数据

#### 4. Mixpanel 身份关联（使用 Alias）

```typescript
// 使用永久设备用户 ID 作为 distinct_id
mixpanel.identify(permanentUserId)

// 登录时建立关联
mixpanel.alias(userId, permanentUserId)
mixpanel.identify(userId)
```

**工作原理：**
- 与 PostHog 相同，通过 alias 建立身份图谱
- Mixpanel 自动推断关联关系

## 📊 数据分析示例

### 场景 1：查看一个人的所有行为（跨设备）

**PostHog / Amplitude / Mixpanel：**
```
Filter: user_id = "account_A"
或者：device_user_id = "puid_pc_123"

Result:
├── 电脑设备的所有行为
├── 手机设备的所有行为
└── 所有关联账号的行为
```

### 场景 2：分析设备使用习惯

```
Query: 按 device_type 分组
Result:
├── 移动设备: 60%
└── 桌面设备: 40%
```

### 场景 3：识别多账号用户

```
Query: 一个 permanent_user_id 关联的所有 user_id
Result:
puid_pc_123 关联：
├── account_A
└── account_B
```

## 🔄 退出登录处理

### 策略：不清除任何身份信息

```typescript
// Amplitude
export function resetUser() {
  // 不执行任何操作
}

// Mixpanel
export const resetMixpanelUser = () => {
  // 不执行任何操作
}

// PostHog
export const resetPostHogUser = () => {
  // 不执行任何操作
}
```

**原因：**
1. ✅ 这是个人产品，不存在多人共享设备
2. ✅ 同一个人的多个账号应该被识别为同一个人
3. ✅ 退出登录后的行为仍然属于这个人
4. ✅ 通过永久设备用户 ID 实现完整的身份追踪

## 🎨 身份关联图示

```
┌─────────────────────────────────────────────────────────────┐
│                        同一个人（小明）                        │
│                                                               │
│  ┌──────────────────┐           ┌──────────────────┐         │
│  │   电脑设备        │           │   手机设备        │         │
│  │ puid_pc_123      │◄─────────►│ puid_phone_456   │         │
│  │                  │  账号 A    │                  │         │
│  │  ├─ 账号 A       │   关联     │  └─ 账号 A       │         │
│  │  └─ 账号 B       │           │                  │         │
│  └──────────────────┘           └──────────────────┘         │
│         │                                                     │
│         └────────► 设备关联账号 A 和 B                        │
│                                                               │
│  结果：所有数据归属到"小明"这一个人                           │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 验证方法

### 1. 查看控制台日志

打开浏览器控制台（F12），你会看到：

```
🆕 生成永久设备用户 ID: puid_1234567890_abc123
✅ PostHog initialized with permanent user ID: puid_1234567890_abc123
✅ Amplitude initialized with permanent user ID: puid_1234567890_abc123
✅ Mixpanel initialized with permanent user ID: puid_1234567890_abc123
```

### 2. 登录时查看关联

```
🔗 PostHog alias: account_A ←→ puid_1234567890_abc123
🔗 Mixpanel alias: account_A ←→ puid_1234567890_abc123
✅ Analytics (Amplitude, Mixpanel & PostHog) 用户已标识: { userId: "account_A", ... }
```

### 3. 退出登录时查看

```
🔄 Amplitude: 保留所有身份信息，持续追踪同一个人
🔄 Mixpanel: 保留设备 ID，等待下次登录
🔄 PostHog: 保留设备 ID，等待下次登录
```

### 4. 在分析平台验证

#### PostHog 查询：
1. 进入 PostHog Dashboard
2. 查询：`distinct_id = "puid_xxx"`
3. 查看 "Aliases" 选项卡，应该能看到所有关联的账号

#### Amplitude 查询：
1. 进入 Amplitude Dashboard
2. 查询：`device_user_id = "puid_xxx"`
3. 查看用户档案，应该能看到所有关联的 User ID

#### Mixpanel 查询：
1. 进入 Mixpanel Dashboard
2. 查询：`device_user_id = "puid_xxx"`
3. 查看用户档案，应该能看到身份合并信息

## ⚙️ 配置文件

所有配置都在以下文件中：
- `src/lib/posthog.ts` - PostHog 配置
- `src/lib/amplitude.ts` - Amplitude 配置
- `src/lib/mixpanel.ts` - Mixpanel 配置
- `src/hooks/useAnalytics.ts` - 统一埋点接口

## ⚠️ 风险与限制说明

### 1. "永久"的局限性
- **浏览器缓存清理**：如果用户清除了浏览器缓存（Cookie/LocalStorage）或使用了无痕模式，`puid` 会丢失并重新生成。
- **后果**：新生成的 `puid` 在用户**再次登录**之前，会被视为一个全新的匿名用户。只有再次登录，通过 `alias` 关联到旧账号，数据才会重新连起来。

### 2. 公共设备风险
- **场景**：如果在网吧或图书馆等公共电脑使用。
- **风险**：因为退出登录**不清除**身份信息，下一位使用者在这个浏览器上的行为，**会被错误地归属到你的账号下**。
- **建议**：本策略仅适用于**个人专用设备**。如果是面向大众的产品，建议在退出登录时提供“彻底清除”选项（即清除 localStorage 里的 puid）。

### 3. Alias 调用规范
- `alias` 操作在埋点平台的逻辑中通常只需调用一次（创建映射关系）。
- 前端虽然在每次登录时都调用，但我们加了 `if (userId !== permanentUserId)` 判断。
- PostHog/Mixpanel 后端会自动处理重复的 alias 请求，通常不会报错，但这是需要知晓的技术细节。

## 📝 技术要点

### localStorage 的使用
```typescript
// 关键存储
localStorage.setItem('firego_permanent_user_id', permanentUserId)

// 永不清除，除非用户手动清除浏览器数据
```

### Alias 的时机
```typescript
// 只在登录时调用，建立新的关联
if (permanentUserId && permanentUserId !== userId) {
  posthog.alias(userId, permanentUserId)
}
```

### 避免重复 Alias
- 检查 `permanentUserId !== userId` 避免自己关联自己
- 每次登录都会建立新的关联关系
- 埋点平台会自动去重和合并

## 🎉 总结

通过这套系统，你可以：
- ✅ 识别同一个人在不同设备上的行为
- ✅ 识别同一个人的不同账号
- ✅ 完整追踪用户的产品使用旅程
- ✅ 分析跨设备、跨账号的行为模式

所有这些都是自动完成的，无需手动维护身份图谱！

