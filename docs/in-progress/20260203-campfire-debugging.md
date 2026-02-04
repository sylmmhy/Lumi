# 篝火专注模式 - 空白页调试指南

## 🔍 问题诊断步骤

### 1. 检查浏览器控制台

打开浏览器开发者工具（F12），查看：
- **Console 标签**：是否有红色错误信息
- **Network 标签**：是否有请求失败（红色）

### 2. 常见问题

#### 问题 A：导入错误
**症状**：控制台显示 `Failed to resolve import` 或 `Cannot find module`

**解决**：
```bash
# 确保所有依赖已安装
cd Lumi
npm install
```

#### 问题 B：AuthContext 未初始化
**症状**：控制台显示 `useAuth must be used within an AuthProvider`

**检查**：
- 确认 `App.tsx` 中 `AuthProvider` 包裹了路由
- 确认访问的路径在 `<Routes>` 内

#### 问题 C：环境变量缺失
**症状**：Supabase 连接失败

**检查**：
```bash
# 检查 .env.local 文件
cat Lumi/.env.local

# 应该包含：
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
```

#### 问题 D：组件渲染错误
**症状**：页面空白，但控制台没有明显错误

**调试步骤**：
1. 在 `CampfireFocusView.tsx` 开头添加：
```typescript
console.log('🔥 CampfireFocusView rendering...');
```

2. 检查组件是否被调用

3. 临时简化组件，只返回一个简单的 div：
```typescript
export function CampfireFocusView({ onEnd }: CampfireFocusViewProps) {
  return <div>Test</div>;
}
```

### 3. 快速测试

#### 测试 1：检查路由是否工作
访问：
```
http://localhost:5173/dev
```

如果 `/dev` 能正常显示，说明路由系统正常。

#### 测试 2：检查组件导入
在浏览器控制台运行：
```javascript
// 检查 React 是否加载
console.log(window.React);

// 检查路由
console.log(window.location.pathname);
```

#### 测试 3：简化测试
创建一个最简单的测试页面：

```typescript
// src/pages/TestPage.tsx
export function TestPage() {
  return <div>Test Page Works!</div>;
}
```

在 `App.tsx` 添加路由：
```typescript
<Route path="/test" element={<TestPage />} />
```

访问 `http://localhost:5173/test`，如果显示 "Test Page Works!"，说明基础设置正常。

### 4. 检查清单

- [ ] 浏览器控制台没有错误
- [ ] Network 标签没有失败的请求
- [ ] `.env.local` 文件存在且配置正确
- [ ] `npm install` 已运行
- [ ] 开发服务器正在运行（`npm run dev:local`）
- [ ] 访问 `/dev` 页面能正常显示
- [ ] React DevTools 显示组件树

### 5. 逐步排查

如果页面完全空白：

1. **检查 HTML 是否加载**
   - 右键页面 → 查看源代码
   - 确认 `<div id="root"></div>` 存在

2. **检查 JavaScript 是否加载**
   - Network 标签 → 查找 `main.tsx` 或 `App.tsx`
   - 确认状态码是 200

3. **检查 React 是否初始化**
   - Console 运行：`document.getElementById('root')`
   - 应该返回 DOM 元素

4. **检查路由**
   - Console 运行：`window.location.pathname`
   - 确认路径正确

### 6. 常见修复

#### 修复 1：清除缓存
```bash
# 清除 node_modules 和重新安装
cd Lumi
rm -rf node_modules package-lock.json
npm install

# 清除浏览器缓存
# Chrome: Ctrl+Shift+Delete
# 或使用无痕模式测试
```

#### 修复 2：重启开发服务器
```bash
# 停止当前服务器 (Ctrl+C)
# 重新启动
npm run dev:local
```

#### 修复 3：检查端口冲突
```bash
# 检查 5173 端口是否被占用
# Windows
netstat -ano | findstr :5173

# Linux/Mac
lsof -i :5173
```

### 7. 获取详细错误信息

在 `main.tsx` 中添加错误边界：

```typescript
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({error}: {error: Error}) {
  return (
    <div style={{padding: '20px', color: 'red'}}>
      <h2>Something went wrong:</h2>
      <pre>{error.message}</pre>
      <pre>{error.stack}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
```

---

## 🆘 如果还是空白

1. **检查 Vite 配置**
   - 查看 `vite.config.ts` 是否有问题

2. **检查 TypeScript 错误**
   ```bash
   npm run build
   ```
   查看是否有编译错误

3. **检查浏览器兼容性**
   - 尝试不同的浏览器
   - 检查浏览器控制台是否有兼容性警告

4. **查看 Vite 服务器日志**
   - 终端中查看是否有错误信息
   - 确认服务器正常启动

---

**如果以上都检查过了还是空白，请提供：**
1. 浏览器控制台的完整错误信息（截图）
2. 终端中 Vite 服务器的输出
3. Network 标签中失败的请求详情
