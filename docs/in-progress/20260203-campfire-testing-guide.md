# 篝火专注模式测试指南

> 创建时间：2026-02-03

## 📋 前置准备

### 1. 确保 Docker 运行
```bash
# 检查 Docker 是否运行
docker ps

# 如果未运行，启动 Docker Desktop
```

### 2. 确保已安装 Supabase CLI
```bash
# 检查是否安装
supabase --version

# 如果未安装
npm install -g supabase
# 或
brew install supabase/tap/supabase
```

### 3. 检查环境变量
确保后端有 `GEMINI_API_KEY`：
```bash
# 在 Lumi-supabase 目录
cat supabase/.env.local | grep GEMINI_API_KEY
```

如果没有，创建或编辑 `Lumi-supabase/supabase/.env.local`：
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 🚀 启动步骤

### 步骤 1：启动后端服务（终端 1）

```bash
# 进入后端目录
cd Lumi-supabase

# 启动 Supabase 本地服务
npm run supabase:start

# 等待启动完成（约 1-2 分钟）
# 看到 "Started supabase local development setup." 表示成功
```

### 步骤 2：应用数据库迁移（终端 1，新命令）

```bash
# 确保在 Lumi-supabase 目录
cd Lumi-supabase

# 应用迁移（包括 focus_sessions 表和 RPC 函数）
npm run supabase:push:local
```

### 步骤 3：启动 Edge Functions（终端 2）

```bash
# 进入后端目录
cd Lumi-supabase

# 启动 Edge Functions（热重载模式）
npm run supabase:functions

# 看到类似输出表示成功：
# "Functions server listening on port 54321"
```

### 步骤 4：启动前端（终端 3）

```bash
# 进入前端目录
cd Lumi

# 启动前端开发服务器（连接本地 Supabase）
npm run dev:local

# 等待启动完成，看到：
# "Local:   http://localhost:5173/"
```

---

## 🧪 测试流程

### 方式 1：直接访问篝火页面（推荐）

1. **打开浏览器**
   ```
   http://localhost:5173/campfire
   ```

2. **登录/使用测试账号**
   - 如果未登录，先登录
   - 或使用测试账号（如果有）

3. **开始测试**
   - 点击"开始专注"按钮
   - 允许麦克风权限
   - 观察火焰动画和计时器

### 方式 2：从开发测试页面进入

1. **访问开发测试页面**
   ```
   http://localhost:5173/dev
   ```

2. **找到"篝火专注模式"按钮**
   - 点击进入测试

---

## ✅ 测试检查清单

### 基础功能测试

- [ ] **页面加载**
  - 访问 `/campfire` 能正常显示
  - 显示"开始专注"按钮

- [ ] **开始会话**
  - 点击"开始专注"后请求麦克风权限
  - 连接 Gemini（首次）
  - 播放白噪音
  - 开始计时
  - 火焰动画显示

- [ ] **状态指示器**
  - `starting` → 显示"🔌 连接中..."
  - `active` → 显示"💬 对话中"
  - `focusing` → 显示"🔥 专注中"

- [ ] **AI 开场**
  - AI 应该问："准备好一起专注了吗？今天想专注做什么？"
  - 可以说出任务，或说"准备好了"

### 核心功能测试

- [ ] **自动断开**
  - AI 说完话后，30 秒无对话
  - 应该自动断开 Gemini（状态变为 `focusing`）
  - 白噪音继续播放
  - 计时器继续运行

- [ ] **自动重连（VAD）**
  - 在 `focusing` 状态下说话
  - VAD 检测到后自动连接 Gemini
  - 状态变为 `connecting` → `active`
  - AI 能接上之前的对话

- [ ] **白噪音控制**
  - 点击 🔊 按钮可以开关白噪音
  - AI 说话时自动降低音量
  - AI 说完后恢复音量

- [ ] **专注计时**
  - 计时器实时更新（格式：MM:SS）
  - 离开页面后重新进入，计时继续

### 结束功能测试

- [ ] **结束会话**
  - 点击"结束专注"按钮
  - 状态变为 `ending`
  - 显示统计弹窗
  - 显示：专注时长、对话次数、分心次数

- [ ] **数据库记录**
  - 在 Supabase Studio 查看 `focus_sessions` 表
  - 应该有新记录，包含：
    - `status = 'completed'`
    - `duration_seconds` > 0
    - `chat_count` > 0
    - `ended_at` 不为空

---

## 🔍 调试技巧

### 1. 查看控制台日志

打开浏览器开发者工具（F12），查看 Console：
- `[Campfire]` 开头的日志
- 连接状态变化
- 错误信息

### 2. 检查数据库

访问 Supabase Studio：
```
http://127.0.0.1:54323
```

查看 `focus_sessions` 表：
```sql
SELECT * FROM focus_sessions 
ORDER BY started_at DESC 
LIMIT 5;
```

### 3. 检查 Edge Functions 日志

在运行 `supabase:functions` 的终端查看：
- `start-campfire-focus` 的调用日志
- `update-focus-session` 的调用日志
- 错误信息

### 4. 测试 VAD（语音检测）

在开发模式下，页面会显示：
- VAD 音量数值
- 是否触发（`isVadTriggered`）

观察这些值，确认 VAD 正常工作。

---

## 🐛 常见问题

### 问题 1：无法连接 Gemini

**症状**：点击"开始专注"后一直显示"连接中..."

**检查**：
1. Edge Functions 是否运行？（终端 2）
2. `GEMINI_API_KEY` 是否正确设置？
3. 查看 Edge Functions 日志是否有错误

**解决**：
```bash
# 检查环境变量
cat Lumi-supabase/supabase/.env.local

# 检查 Edge Functions 日志
# 在运行 supabase:functions 的终端查看
```

### 问题 2：麦克风权限被拒绝

**症状**：点击"开始专注"后提示权限错误

**解决**：
1. 浏览器设置中允许麦克风权限
2. 刷新页面重试
3. 检查浏览器是否支持 `getUserMedia` API

### 问题 3：白噪音不播放

**症状**：没有听到篝火声音

**检查**：
1. 浏览器音量是否开启？
2. 检查 `public/campfire-sound.mp3` 文件是否存在
3. 查看控制台是否有音频加载错误

### 问题 4：VAD 不触发

**症状**：说话后没有自动重连

**检查**：
1. 在开发模式下查看 VAD 音量数值
2. 如果数值一直为 0，可能是麦克风未正确获取
3. 尝试调整 `vadThreshold`（默认 25）

**调试**：
```typescript
// 在 CampfireFocusView.tsx 中临时显示 VAD 信息
<div>VAD 音量: {session.vadVolume}</div>
<div>VAD 触发: {session.isVadTriggered ? '是' : '否'}</div>
```

### 问题 5：数据库迁移失败

**症状**：`npm run supabase:push:local` 报错

**解决**：
```bash
# 重置数据库（会清空所有数据）
cd Lumi-supabase
npm run supabase:reset

# 重新应用迁移
npm run supabase:push:local
```

---

## 📊 测试数据验证

### 验证数据库记录

```sql
-- 查看最近的专注会话
SELECT 
  id,
  user_id,
  task_description,
  status,
  duration_seconds,
  chat_count,
  distraction_count,
  connection_count,
  started_at,
  ended_at
FROM focus_sessions
ORDER BY started_at DESC
LIMIT 5;

-- 查看统计视图
SELECT * FROM focus_stats_view
WHERE user_id = 'your_user_id';
```

### 验证 Edge Functions

```bash
# 测试 start-campfire-focus
curl -X POST https://127.0.0.1:54321/functions/v1/start-campfire-focus \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111"
  }' \
  --insecure
```

---

## 🎯 完整测试场景

### 场景 1：完整流程测试

1. 访问 `/campfire`
2. 点击"开始专注"
3. 允许麦克风权限
4. AI 问："想专注做什么？"
5. 回答："写代码"
6. 进入专注状态（30 秒后自动断开）
7. 说话触发 VAD 重连
8. 简短对话
9. 再次自动断开
10. 点击"结束专注"
11. 查看统计弹窗

### 场景 2：长时间专注测试

1. 开始专注
2. 不说话，观察自动断开
3. 等待 5 分钟
4. 说话重连
5. 再次断开
6. 重复几次
7. 结束，验证 `duration_seconds` 是否正确

### 场景 3：闲聊检测测试

1. 开始专注，说出任务
2. 连接后，说一些与任务无关的话（闲聊）
3. 观察 AI 是否提醒（根据 `distractionCount`）
4. 继续闲聊，观察提醒强度变化
5. 验证 `distraction_count` 是否正确记录

---

## 📝 测试记录模板

```
测试日期：2026-02-03
测试人员：[你的名字]

✅ 通过项：
- [ ] 页面加载
- [ ] 开始会话
- [ ] 自动断开
- [ ] 自动重连
- [ ] 白噪音控制
- [ ] 专注计时
- [ ] 结束会话
- [ ] 数据库记录

❌ 问题项：
- [问题描述]

💡 改进建议：
- [建议内容]
```

---

## 🚀 下一步

测试通过后：
1. 修复发现的问题
2. 优化用户体验
3. 添加更多测试用例
4. 准备部署到生产环境

---

**Happy Testing! 🔥**
