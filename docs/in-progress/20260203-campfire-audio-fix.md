# 篝火专注模式 - 音频和数据库问题修复

## 问题 1: 数据库创建失败

**错误信息**：
```
❌ Failed to create focus session: {}
```

**可能原因**：
1. 数据库迁移未应用
2. RLS 策略阻止插入
3. Service role key 配置错误

**解决步骤**：

### 步骤 1: 检查迁移是否应用

```bash
cd Lumi-supabase
npm run supabase:push:local
```

### 步骤 2: 检查表是否存在

访问 Supabase Studio: http://127.0.0.1:54323

查看 `focus_sessions` 表是否存在。

### 步骤 3: 检查 RLS 策略

在 Supabase Studio 中查看 `focus_sessions` 表的 RLS 策略：
- 应该有 "Service role can access all focus sessions" 策略

### 步骤 4: 检查环境变量

确保 Edge Function 有正确的 Service Role Key：
```bash
cat Lumi-supabase/supabase/.env.local | grep SUPABASE_SERVICE_ROLE_KEY
```

---

## 问题 2: AI 嘴巴动但没有声音

**症状**：
- 看到火焰动画（嘴巴在动）
- `isSpeaking` 状态为 `true`
- 但没有听到声音

**可能原因**：
1. AudioContext 未正确初始化
2. 浏览器音频权限问题
3. 音频数据格式问题

**解决步骤**：

### 步骤 1: 检查浏览器控制台

打开开发者工具，查看是否有音频相关错误：
- `AudioContext not ready`
- `AudioContext is closed`
- `Cannot play audio`

### 步骤 2: 检查 AudioContext 状态

在浏览器控制台运行：
```javascript
// 检查 AudioContext
const ctx = new AudioContext();
console.log('AudioContext state:', ctx.state);

// 如果状态是 'suspended'，需要用户交互后恢复
ctx.resume().then(() => {
  console.log('AudioContext resumed');
});
```

### 步骤 3: 检查浏览器音频设置

- 确保浏览器音量未静音
- 确保系统音量正常
- 检查浏览器标签页是否被静音（Chrome 标签页图标）

### 步骤 4: 检查用户交互

AudioContext 必须在用户交互上下文中初始化。确保：
- 点击"开始专注"按钮后立即连接
- 不要在页面加载时自动连接

---

## 调试技巧

### 1. 添加详细日志

在 `useCampfireSession.ts` 中添加：
```typescript
console.log('🔊 [Campfire] AudioContext state:', audioOutput.audioContextRef.current?.state);
console.log('🔊 [Campfire] isSpeaking:', geminiLive.isSpeaking);
console.log('🔊 [Campfire] audioStream:', geminiLive.audioStream);
```

### 2. 检查音频数据

在 `useGeminiLive.ts` 的 `onAudioData` 回调中添加：
```typescript
onAudioData: async (data: string) => {
  console.log('🔊 [GeminiLive] Received audio data, length:', data.length);
  try {
    await audioOutput.ensureReady();
    console.log('🔊 [GeminiLive] AudioContext ready, playing...');
    audioOutput.playAudio(data);
  } catch (err) {
    console.error('❌ [GeminiLive] Audio playback error:', err);
  }
},
```

### 3. 测试音频输出

创建一个简单的测试：
```typescript
// 在浏览器控制台运行
const ctx = new AudioContext();
const oscillator = ctx.createOscillator();
const gainNode = ctx.createGain();

oscillator.connect(gainNode);
gainNode.connect(ctx.destination);

oscillator.frequency.value = 440; // A4
gainNode.gain.value = 0.1;

oscillator.start();
setTimeout(() => oscillator.stop(), 1000);
```

如果这个测试没有声音，说明是浏览器/系统音频问题。

---

## 快速修复

### 修复 1: 确保数据库迁移已应用

```bash
cd Lumi-supabase
npm run supabase:reset  # 重置数据库
npm run supabase:push:local  # 重新应用迁移
```

### 修复 2: 确保 AudioContext 在用户交互后初始化

`useGeminiLive.connect` 方法已经包含了 `ensureReady()` 调用，但确保：
1. 用户点击"开始专注"按钮
2. 在点击事件处理程序中调用 `startSession()`
3. 不要在页面加载时自动连接

### 修复 3: 检查浏览器权限

某些浏览器需要用户交互后才能播放音频。确保：
- 用户点击了按钮
- 浏览器允许自动播放音频（检查浏览器设置）

---

## 验证步骤

1. **数据库验证**：
   ```sql
   -- 在 Supabase Studio 中运行
   SELECT * FROM focus_sessions LIMIT 1;
   ```

2. **音频验证**：
   - 打开浏览器控制台
   - 查看是否有音频相关日志
   - 检查 `AudioContext` 状态

3. **完整流程验证**：
   - 点击"开始专注"
   - 等待连接成功
   - 说话测试
   - 检查是否有声音输出
