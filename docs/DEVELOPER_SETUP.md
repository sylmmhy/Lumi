# 开发者设置指南 - Developer Setup Guide

欢迎加入 Lumi (firego--original-web) 项目！本指南将帮助新开发者完成环境设置和首次部署配置。

---

## 📋 目录

- [环境准备](#环境准备)
- [项目克隆与安装](#项目克隆与安装)
- [首次推送与 Vercel 部署权限](#首次推送与-vercel-部署权限)
- [开发工作流](#开发工作流)
- [部署流程](#部署流程)
- [常见问题](#常见问题)

---

## 🛠️ 环境准备

### 必需工具

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0 或 **pnpm** >= 8.0.0
- **Git** >= 2.30.0

### 推荐工具

- **VS Code** + 以下扩展：
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
- **GitHub Desktop** （可选，GUI 工具）

---

## 📦 项目克隆与安装

### 1. 克隆仓库

```bash
# 克隆主仓库（包含 Web、iOS、Android 三个子项目）
git clone https://github.com/sylmmhy/firego--original-web.git
cd firego--original-web
```

### 2. 安装依赖

```bash
npm install
# 或使用 pnpm
pnpm install
```

### 3. 配置环境变量

复制环境变量模板：
```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入必要的 API 密钥：
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
```

> **注意**：向团队成员索取实际的 API 密钥，或在 Supabase/Google AI Studio 中创建自己的测试密钥。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 验证项目正常运行。

---

## 🔐 首次推送与 Vercel 部署权限

### ⚠️ 重要：新开发者必读

**Vercel 只会自动构建仓库所有者的提交。** 其他协作者的 push 默认不会触发自动部署。

有两种解决方案：

---

### 方案 1: 配置本地 Git 身份为仓库所有者（推荐）⭐

**这是最简单的方案**，让 Vercel 认为你的 commit 来自仓库所有者，从而自动触发部署。

#### 配置步骤

在项目目录下运行以下命令：

```bash
# 进入项目目录
cd firego--original-web

# 配置本地 Git 用户信息为仓库所有者
git config user.name "sylmmhy"
git config user.email "yilunarchi@gmail.com"

# 验证配置
git config user.name   # 应显示: sylmmhy
git config user.email  # 应显示: yilunarchi@gmail.com
```

#### 重要说明

- ✅ **仅影响当前仓库**：这个配置只对 `firego--original-web` 项目生效，不会影响你其他项目的 Git 身份
- ✅ **自动部署**：配置后，你的所有 commit 都会触发 Vercel 自动部署
- ✅ **保留贡献记录**：GitHub 仍然会显示实际的提交者（通过 commit 元数据）
- ℹ️ **Co-authored-by 标记**：如果你想在 commit 中保留自己的署名，可以添加：
  ```bash
  git commit -m "feat: your feature

  Co-authored-by: Your Name <your-email@example.com>"
  ```

#### 验证配置是否生效

```bash
# 1. 提交一个测试 commit
git commit --allow-empty -m "test: verify vercel auto-deploy"

# 2. 推送到远程
git push origin master

# 3. 查看 Vercel Dashboard（应该能看到自动触发的部署）
# 访问: https://vercel.com/dashboard
```

---

### 方案 2: 请求 Vercel 团队权限（昂贵且尚未考虑）⚠️

**注意**：Vercel 团队权限功能需要付费计划，目前项目未采用此方案。

**如果未来需要启用**，可以请求仓库所有者：
1. 升级 Vercel 计划到 Team 或以上
2. 在 Vercel Dashboard 中添加你为团队成员
3. 配置后，你的 push 将自动触发部署（无需修改 Git 身份）

**当前推荐**：使用方案 1（配置 Git 身份），简单免费且有效。

---

### 方案 3: 使用 Deploy Hook（手动触发）

如果你既不想修改 Git 身份，也不想等待团队权限，可以使用 Deploy Hook 手动触发部署。

详见：[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)

---

## 💼 开发工作流

### 分支策略

- `master` / `main` - 生产分支（自动部署到 https://meetlumi.org）
- `develop` - 开发分支（如果有）
- `feature/xxx` - 功能分支
- `fix/xxx` - 修复分支

### 日常开发流程

```bash
# 1. 拉取最新代码
git pull origin master

# 2. 创建功能分支
git checkout -b feature/your-feature-name

# 3. 开发并提交
git add .
git commit -m "feat: add your feature"

# 4. 推送到远程
git push origin feature/your-feature-name

# 5. 在 GitHub 创建 Pull Request
```

### Commit 消息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式调整（不影响逻辑）
- `refactor:` - 重构
- `test:` - 测试相关
- `chore:` - 构建/工具配置

**示例**：
```bash
git commit -m "feat: 添加用户头像上传功能"
git commit -m "fix: 修复 iOS WebView 中的剪贴板复制问题"
git commit -m "docs: 更新 README 部署说明"
```

---

## 🚀 部署流程

### 自动部署（推荐）

一旦获得 Vercel 权限后，**每次推送到 master 分支都会自动触发部署**：

```bash
git push origin master
# 等待 1-2 分钟，Vercel 自动构建并部署
# 访问 https://meetlumi.org 查看更新
```

### 手动部署（如果自动部署未配置）

如果你的 push 不触发自动部署，参考 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) 使用 Deploy Hook。

---

## 🧪 测试

### 运行单元测试

```bash
npm run test
```

### 运行 Lint 检查

```bash
npm run lint
```

### 构建生产版本

```bash
npm run build
npm run preview  # 预览生产构建
```

---

## 📱 跨平台测试

### Web 应用测试

```bash
npm run dev
# 访问 http://localhost:5173
```

### iOS 应用测试

Web 应用部署到线上后，iOS App 会自动加载最新版本（无需重新构建 App）。

详见：`../mindboat-ios-web-warpper/README.md`

### Android 应用测试

同样，Android App 也会自动加载最新的 Web 应用。

详见：`../firego-Android/README.md`

---

## 🐛 常见问题

### Q1: 推送后 Vercel 没有自动部署怎么办？

**原因**：Vercel 只自动构建仓库所有者的 commit。

**解决**（推荐）：配置本地 Git 身份为仓库所有者
```bash
cd firego--original-web
git config user.name "sylmmhy"
git config user.email "yilunarchi@gmail.com"
```

**其他方案**：按照 [首次推送与 Vercel 部署权限](#首次推送与-vercel-部署权限) 章节的步骤操作。

### Q1.5: 配置 Git 身份后会影响我其他项目吗？

**不会**。使用 `git config`（不带 `--global`）只影响当前仓库。

你的其他项目仍然使用你的全局 Git 身份：
```bash
# 查看全局配置（不受影响）
git config --global user.name
git config --global user.email

# 查看当前项目配置
git config user.name    # 显示: sylmmhy (仅此项目)
```

### Q1.6: GitHub 上会显示我的贡献吗？

**会显示**。即使使用仓库所有者的 Git 身份，GitHub 仍然会：
- 通过 push 记录识别实际提交者
- 在你的 GitHub Profile 中显示贡献
- 在仓库的 Contributors 页面显示你的头像

如果想更明确地标记自己的贡献，可以在 commit 消息中添加 `Co-authored-by`。

### Q2: npm install 失败

**解决**：
```bash
# 清除缓存
npm cache clean --force
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### Q3: 开发服务器启动失败

**检查**：
- 端口 5173 是否被占用？
- `.env.local` 文件是否正确配置？
- Node.js 版本是否符合要求？

### Q4: Git push 被拒绝（权限问题）

**解决**：
```bash
# 确认你已被添加为仓库协作者
# 联系仓库所有者添加你的 GitHub 账号

# 检查 Git 远程配置
git remote -v

# 如果使用 HTTPS，确保凭据正确
# 如果使用 SSH，确保 SSH Key 已添加到 GitHub
```

### Q5: 如何查看 Vercel 部署日志？

1. 访问 https://vercel.com/dashboard
2. 选择项目 `firego--original-web`
3. 点击 "Deployments" 查看所有部署记录
4. 点击具体的部署查看详细日志

---

## 📚 相关文档

- [项目架构文档](./docs/architecture/README.md)
- [记忆系统文档](./docs/architecture/memory-system.md)
- [部署指南](./DEPLOY_GUIDE.md)
- [原生 App 集成](./NATIVE_AUTH_VERIFICATION.md)
- [Claude 开发指南](./CLAUDE.md)

---

## 👥 联系方式

- **仓库所有者**: sylmmhy
- **项目地址**: https://github.com/sylmmhy/firego--original-web
- **生产环境**: https://meetlumi.org

---

## 🎉 欢迎贡献

感谢你加入 Lumi 项目！如果你在设置过程中遇到任何问题，或者有改进建议，欢迎：

1. 提交 Issue: https://github.com/sylmmhy/firego--original-web/issues
2. 更新本文档，让后来的开发者更容易上手
3. 在团队中分享你的经验

祝开发愉快！🚀
