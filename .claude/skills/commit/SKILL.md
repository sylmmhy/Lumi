---
name: commit
description: 智能提交。自动检查并修复 lint 错误，然后提交到当前分支（不推送到远程）。
---

# 智能提交流程

## 功能说明

自动完成以下步骤：
1. 检查 lint 错误
2. 自动修复可修复的错误
3. 生成符合规范的 commit message
4. 提交到当前分支（**不推送**到远程）

---

## 执行步骤

### 1. 检查当前状态

```bash
# 查看当前分支
git branch --show-current

# 查看所有变更（不使用 -uall 避免大仓库内存问题）
git status

# 查看具体改动
git diff
git diff --staged
```

**告诉用户**：
> 当前分支：`xxx`
> 修改的文件：[列出文件]

### 2. 运行 Lint 检查

```bash
npm run lint
```

#### 情况 A：没有错误

直接进入步骤 4（生成 commit message）

#### 情况 B：有错误

1. **先尝试自动修复**：
   ```bash
   npm run lint -- --fix
   ```

2. **再次检查**：
   ```bash
   npm run lint
   ```

3. **如果仍有错误**：
   - 读取报错的文件
   - 分析错误原因
   - 使用 Edit 工具修复
   - 重复检查直到没有错误

### 3. Lint 修复后再次检查状态

```bash
git status
git diff
```

**告诉用户**修复了哪些 lint 错误（如果有的话）。

### 4. 生成 Commit Message

分析所有变更，生成符合 Conventional Commits 规范的中文 commit message。

**格式**：
```
<type>(<scope>): <简短描述>

<详细说明（可选）>

Co-Authored-By: Claude <noreply@anthropic.com>
```

**type 类型**：
| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| docs | 文档变更 |
| style | 代码格式（不影响功能） |
| refactor | 重构（不是新功能也不是修复） |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具/依赖变更 |

**示例**：
```
feat(auth): 添加用户登录功能

- 实现邮箱密码登录
- 添加登录状态持久化

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 5. 确认并提交

**询问用户**：
> 📝 即将提交以下内容：
>
> **分支**：`xxx`
> **文件**：[列出文件]
> **Commit Message**：
> ```
> [生成的 message]
> ```
>
> 确认提交吗？（Y/n）

用户确认后执行：

```bash
# 添加所有变更的文件（不要用 git add -A，逐个添加更安全）
git add <file1> <file2> ...

# 提交（使用 HEREDOC 确保格式正确）
git commit -m "$(cat <<'EOF'
<commit message>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 6. 完成

```bash
# 确认提交成功
git log --oneline -1
```

**告诉用户**：
```
✅ 提交成功！

📦 提交信息：
[commit hash] [commit message 第一行]

💡 提示：
- 代码已提交到本地的 `xxx` 分支
- 如需推送到远程，请运行：git push origin xxx
- 如需撤销这次提交：git reset --soft HEAD~1
```

---

## 注意事项

- **不会**自动推送到远程，需要用户手动 push
- **不会**提交 `.env`、`credentials.json` 等敏感文件（如检测到会警告）
- **会**自动修复 lint 错误，但会告知用户修复了什么
- **会**使用 Conventional Commits 格式 + 中文描述

---

## 特殊情况处理

### 没有任何变更

```
ℹ️ 没有需要提交的变更。

当前分支 `xxx` 已是最新状态。
```

### 有敏感文件

```
⚠️ 检测到可能包含敏感信息的文件：
- .env.local
- credentials.json

这些文件不会被提交。如果确实需要提交，请手动执行 git add。
```

### Lint 错误无法自动修复

```
❌ 以下 lint 错误需要手动处理：

📍 文件：src/xxx.tsx:42
🔴 错误：[错误信息]
💡 原因：[用简单的话解释]
🔧 建议：[给出修复建议]

我来帮你修复这个问题...
```
