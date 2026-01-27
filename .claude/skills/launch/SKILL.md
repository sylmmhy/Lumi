---
name: launch
description: 发布流程。将 dev 分支的代码同步到 master 分支，用于部署上线。
---

# 发布流程（dev → master）

## 功能说明

将 dev 分支的最新代码合并到 master 分支，准备部署上线。

---

## 执行步骤

### 1. 检查当前状态

```bash
# 确认当前分支
git branch

# 检查是否有未提交的更改
git status

# 查看 dev 和 master 的差异概况
git log master..dev --oneline
```

**如果有未提交的更改**，先询问用户：
> 你有一些改动还没提交（列出文件）。你想：
> 1. 先提交这些改动，再发布
> 2. 暂存起来（stash），发布后再恢复
> 3. 放弃这些改动，直接发布

### 2. 拉取最新代码

```bash
# 更新远程分支信息
git fetch origin

# 确保 dev 分支是最新的
git checkout dev
git pull origin dev

# 确保 master 分支是最新的
git checkout master
git pull origin master
```

### 3. 合并 dev 到 master

```bash
git merge dev
```

---

## 冲突处理

如果出现冲突，**必须用产品经理能听懂的话**解释：

### 解释格式

```
📍 冲突文件：src/components/xxx.tsx

🔴 冲突内容：
- master 分支（线上版本）的代码是：[用一句话描述功能]
- dev 分支（你想发布的）的代码是：[用一句话描述功能]

💡 冲突原因：
[解释为什么会冲突，比如：两边都改了同一个按钮的文字/逻辑]

❓ 请选择：
1. 用 dev 的版本（即将发布的新功能）
2. 用 master 的版本（保持线上现状）
3. 两个都要（我来帮你合并两边的改动）
```

### 处理流程

1. **逐个文件**询问用户的选择
2. 用户选择后，执行对应的 git 操作
3. 所有冲突解决后，继续合并流程

---

## 合并成功后

### 1. 确认合并结果

```bash
# 查看合并后的最新提交
git log --oneline -5
```

### 2. 推送到远程

```bash
git push origin master
```

### 3. 输出发布摘要

```
✅ 发布完成！

📦 本次发布包含以下更新：
[列出 dev → master 的主要提交，用中文描述]

🔗 下一步：
- 检查线上环境是否正常
- 通知团队发布完成
```

---

## 回滚方案

如果发布后发现问题，告诉用户：

```
⚠️ 如果需要回滚，运行以下命令：

1. 找到上一个正常的版本：
   git log --oneline -10

2. 回滚到指定版本（假设是 abc1234）：
   git revert abc1234..HEAD
   git push origin master

或者硬回滚（会丢失历史）：
   git reset --hard abc1234
   git push origin master --force
```

---

## 注意事项

- **不要**在有未提交更改时直接合并
- **不要**跳过冲突处理
- **始终**在推送前确认合并结果
- **始终**用中文、产品经理能听懂的话解释冲突
