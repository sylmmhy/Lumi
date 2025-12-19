# AI 系统指令修改指南

本指南帮助你修改和部署 AI 教练的对话行为。

## 📂 文件位置

**本地源代码：** `supabase/functions/get-system-instruction/index.ts`

这个文件控制 AI 如何与用户对话。

## 🎯 主要内容

文件中的 `getOnboardingSystemInstruction()` 函数包含一个超长的系统指令，定义了：

1. **AI 角色**：温暖的陪伴者，通过摄像头观察用户
2. **说话风格**：简短、友好、不机械
3. **行为规则**：
   - 基于实际视频观察给反馈
   - 记住对话历史和用户情绪
   - 避免"我看到..."等机械表达
   - 将任务拆解成小步骤
4. **特殊情况处理**：
   - 用户分心时如何引导
   - 视频看不清时如何应对
   - 用户不在镜头前时如何处理

## ✏️ 如何修改

### 1. 编辑本地文件

打开 `supabase/functions/get-system-instruction/index.ts`

找到 `getOnboardingSystemInstruction()` 函数，修改其中的系统指令文本。

### 示例修改

**例子 1: 修改 AI 的语气**

```typescript
// 原文
return `You are Mindboat's AI companion, helping the user...`

// 改为更严格的教练风格
return `You are Mindboat's strict fitness coach, pushing the user...`
```

**例子 2: 调整鼓励频率**

在指令中添加：
```typescript
⚠️ Only give encouragement every 60 seconds, not too often.
```

**例子 3: 修改分心时的处理**

找到 "WHEN USER IS DISTRACTED" 部分，调整引导策略。

## 🧪 测试修改

### 方法 1: 本地测试（需要 Supabase CLI 和 Docker）

```bash
# 启动本地 Supabase
supabase start

# 测试函数
supabase functions serve get-system-instruction

# 发送测试请求
curl -i --location --request POST 'http://localhost:54321/functions/v1/get-system-instruction' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskInput":"刷牙"}'
```

### 方法 2: 直接部署测试（推荐）

如果你的改动很小，可以直接部署到云端测试：

```bash
bash deploy-ai-prompt.sh
```

然后在 App 中测试实际效果。

## 🚀 部署到云端

### 快速部署（推荐）

```bash
bash deploy-ai-prompt.sh
```

### 手动部署

```bash
supabase functions deploy get-system-instruction
```

### 验证部署

```bash
# 查看函数列表，确认版本号增加了
supabase functions list
```

## 📊 查看效果

1. **打开 App**：启动你的 Firego 应用
2. **开始任务**：输入一个任务（例如"刷牙"）
3. **观察 AI 行为**：看看 AI 的回复是否符合你的修改

## 🐛 调试技巧

### 查看云端日志

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入你的项目
3. 点击 **Edge Functions** → **get-system-instruction**
4. 查看 **Logs** 标签

### 在代码中添加调试信息

在 `getOnboardingSystemInstruction()` 函数开头添加：

```typescript
function getOnboardingSystemInstruction(taskDescription: string): string {
  // 打印接收到的任务
  console.log('收到任务描述:', taskDescription);

  const systemInstruction = `You are Mindboat's AI companion...`;

  // 打印生成的指令长度
  console.log('系统指令长度:', systemInstruction.length);

  return systemInstruction;
}
```

然后重新部署，查看 Supabase 日志。

## 💡 常见修改场景

### 1. AI 太啰嗦，想让它更简短

在指令中添加：
```
⚠️ CRITICAL: Keep ALL responses under 10 words. Be extremely brief.
```

### 2. AI 不够鼓励，想要更积极

修改鼓励语气部分：
```
✅ Be EXTREMELY enthusiastic and celebratory
✅ Use exclamation marks frequently!
✅ Treat every small step like a huge achievement!
```

### 3. 想让 AI 在特定任务上有不同行为

在函数开头添加任务检测：
```typescript
function getOnboardingSystemInstruction(taskDescription: string): string {
  // 针对运动任务的特殊指令
  if (taskDescription.includes('运动') || taskDescription.includes('锻炼')) {
    return `You are a fitness coach...`;
  }

  // 针对学习任务的特殊指令
  if (taskDescription.includes('学习') || taskDescription.includes('读书')) {
    return `You are a study buddy...`;
  }

  // 默认指令
  return `You are Mindboat's AI companion...`;
}
```

## ⚠️ 注意事项

1. **备份修改前的版本**：第一次修改前，复制一份原文件
2. **渐进式修改**：每次只改一小部分，部署测试后再继续
3. **保留关键规则**：特别是"不能猜测位置"这类关键行为规则
4. **测试多种场景**：
   - 用户正常工作
   - 用户分心玩手机
   - 用户离开镜头
   - 视频模糊看不清

## 🔄 回滚到之前的版本

如果改坏了，可以回滚：

1. 在 Supabase Dashboard 查看函数版本历史
2. 或者恢复本地文件的备份，重新部署

## 📞 需要帮助？

如果遇到问题，可以：
1. 查看 Supabase 函数日志
2. 在项目 Issues 提问
3. 回滚到上一个可用版本
