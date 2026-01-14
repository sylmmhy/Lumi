# Lumi (firego--original-web)

Lumi 是一个多平台 AI 教练应用，使用 Gemini Live 进行基于语音的任务辅导。

## 🚀 快速开始

### 新开发者必读

如果你是第一次设置项目，**请先阅读**：

📖 **[开发者设置指南 (DEVELOPER_SETUP.md)](./DEVELOPER_SETUP.md)**

**⚠️ 重要**：为了让 Vercel 自动部署你的提交，需要配置本地 Git 身份：

```bash
cd firego--original-web
git config user.name "sylmmhy"
git config user.email "yilunarchi@gmail.com"
```

详见：[完整配置说明](./DEVELOPER_SETUP.md#方案-1-配置本地-git-身份为仓库所有者推荐)

---

## 📦 技术栈

- **框架**: React 19 + TypeScript + Vite
- **路由**: React Router DOM v7
- **样式**: Tailwind CSS
- **后端**: Supabase (PostgreSQL + Edge Functions)
- **AI**: Gemini Live API（多模态 AI）
- **部署**: Vercel

---

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行 linter
npm run lint
```

---

## 📚 文档

- [开发者设置指南](./DEVELOPER_SETUP.md) - 新开发者必读
- [部署指南](./DEPLOY_GUIDE.md) - Deploy Hook 使用说明
- [项目架构](./docs/architecture/README.md) - 完整架构文档
- [记忆系统](./docs/memory-architecture.md) - 记忆系统深入解析
- [Claude 开发指南](./CLAUDE.md) - AI 辅助开发规范

---

## 🌐 部署

- **生产环境**: https://meetlumi.org
- **Vercel Dashboard**: https://vercel.com/dashboard

---

## 📱 跨平台

本仓库是 monorepo，包含三个互联的项目：

- **firego--original-web** - React 网页应用（本目录）
- **mindboat-ios-web-warpper** - iOS 原生壳子（WebView 封装）
- **firego-Android** - Android 原生壳子（WebView 封装）

iOS 和 Android 应用都通过 WebView 加载网页应用，Web 应用更新后，原生 App 会自动加载最新版本（无需重新构建）。

---

## 🤝 贡献

欢迎贡献！请先阅读 [开发者设置指南](./DEVELOPER_SETUP.md)。

---

# Original Vite Template README

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
