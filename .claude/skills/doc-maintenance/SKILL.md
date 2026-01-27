---
name: doc-maintenance
description: 文档维护规则。当进行复杂实现、完成功能、或需要更新文档时自动加载。
---

# 文档维护系统

## 目录结构

```
docs/
├── in-progress/          # 进行中的实现（必须实时更新）
│   └── _TEMPLATE.md      # 实现文档模板
├── implementation-log/   # 已完成的实现记录（扁平结构）
├── architecture/         # 架构文档（必须保持最新）
├── dev-guide/           # 开发/部署指南
└── KEY_DECISIONS.md     # 关键技术决策
```

| 目录 | 用途 | 更新策略 |
|------|------|---------|
| `in-progress/` | 进行中的实现 | **实时更新**，完成后迁移 |
| `implementation-log/` | 已完成的实现记录 | 完成时创建，不再更新 |
| `architecture/` | 系统架构文档 | 架构变化时更新 |
| `dev-guide/` | 开发/部署指南 | 工具变化时更新 |

---

## 规则

### 规则 1：开始复杂实现时

当开始涉及多个文件或新功能的实现时：
1. 在 `docs/in-progress/` 创建 `YYYYMMDD-功能名.md`
2. 复制 `_TEMPLATE.md` 内容，填写 front matter
3. **实现过程中持续更新**进度和记录

### 规则 2：实现过程中

每次有重要进展时：
1. 更新 front matter 中的 `updated` 时间
2. 更新 `stage` 状态
3. 在「实现记录」章节追加当日进展
4. 保持记录**精简**（禁止大段代码）

### 规则 3：实现完成后

当功能全部完成并验证通过时：
1. 将文档从 `in-progress/` 移动到 `implementation-log/`
2. 更新 `stage` 为 `✅ 完成`
3. 更新 `architecture/` 中相关文档（如果涉及架构）
4. 如有重大决策，追加到 `KEY_DECISIONS.md`

### 规则 4：读取 in-progress/ 时

自动检查：
- front matter `updated` 超过 3 天 → 提醒更新
- front matter `due` 已过期 → 提醒处理

---

## 命名规范

- `in-progress/`: `YYYYMMDD-功能名称.md`
- `implementation-log/`: `YYYYMMDD-功能名称.md`
- `architecture/`: `模块名.md` 或 `模块名-system.md`
- `dev-guide/`: `动作名.md`

---

## 精简原则

实现记录必须精简：
- ✅ 关键决策和原因
- ✅ 问题和解决方案
- ✅ 文件路径引用（如 `src/hooks/useX.ts:42`）
- ✅ 简短代码片段（<20行）
- ❌ 禁止大段复制代码
- ❌ 禁止冗长调试日志
