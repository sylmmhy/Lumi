# Git 工作流规范

## Commit 格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <简短描述>

[可选] 详细说明
```

### Type 类型

| Type | 用途 | 示例 |
|------|------|------|
| `feat` | 新增功能 | `feat: 添加任务提醒功能` |
| `fix` | 修复 Bug | `fix: 修复登录页面闪退问题` |
| `refactor` | 重构代码（不改变功能） | `refactor: 优化 useAICoachSession 结构` |
| `style` | 样式调整（不影响逻辑） | `style: 调整首页按钮间距` |
| `docs` | 文档更新 | `docs: 更新 README 安装说明` |
| `chore` | 构建/工具变更 | `chore: 升级 Vite 到 v6` |
| `perf` | 性能优化 | `perf: 优化首页加载速度` |
| `test` | 测试相关 | `test: 添加登录模块单元测试` |

---

## 分支命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 新功能 | `feature/功能名` | `feature/task-reminder` |
| Bug 修复 | `fix/问题描述` | `fix/login-crash` |
| 重构 | `refactor/模块名` | `refactor/auth-flow` |

---

## PR 规范

### 标题格式
```
[type] 简短描述
```

### 描述模板
```markdown
## 改动说明
- 改动点 1
- 改动点 2

## 测试方法
- [ ] 测试步骤 1
- [ ] 测试步骤 2

## 截图（如有 UI 改动）
```

---

## 常用命令

```bash
# 查看当前分支状态
git status

# 创建并切换到新分支
git checkout -b feature/xxx

# 提交代码
git add .
git commit -m "feat: xxx"

# 推送到远程
git push origin feature/xxx

# 合并 master 到当前分支
git merge master
```
