# 原生登录桥接功能验证指南

## 📋 目录

1. [快速开始](#快速开始)
2. [验证方法](#验证方法)
3. [验证检查点](#验证检查点)
4. [iOS WebView 集成验证](#ios-webview-集成验证)
5. [常见问题排查](#常见问题排查)

---

## 快速开始

### 方法一：测试页面（推荐）

1. 启动你的开发服务器
2. 在浏览器中打开 `http://localhost:5173/test-native-auth.html`
3. 使用页面上的测试场景按钮进行验证

### 方法二：控制台脚本

1. 在应用页面打开浏览器控制台（F12）
2. 复制 `test-native-auth-console.js` 的内容到控制台执行
3. 运行提供的测试函数

---

## 验证方法

### 1️⃣ 浏览器模拟测试

#### 测试场景 1: 完整 Token 登录

这是**生产环境推荐方式**，模拟 iOS 提供完整的 Supabase JWT token。

**步骤：**

1. 打开测试页面或控制台
2. 准备真实的 Supabase token：
   ```javascript
   // 先通过邮箱登录获取真实 token
   localStorage.getItem('session_token')  // 复制这个作为 accessToken
   localStorage.getItem('refresh_token')  // 复制这个作为 refreshToken
   ```

3. 触发登录事件：
   ```javascript
   const event = new CustomEvent('mindboat:nativeLogin', {
     detail: {
       userId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // 真实 UUID
       email: 'user@example.com',
       accessToken: '真实的_access_token',
       refreshToken: '真实的_refresh_token',
       name: '用户名',
       pictureUrl: 'https://...'
     }
   });
   window.dispatchEvent(event);
   ```

**预期结果：**
- ✅ localStorage 中出现 `native_login: 'true'`
- ✅ localStorage 中有 `user_id`, `user_email`, `session_token`, `refresh_token`
- ✅ 控制台输出 "✅ Login successful" 或相关成功日志
- ✅ UI 显示已登录状态
- ✅ 可以正常调用 Supabase API（任务、日程等）

---

#### 测试场景 2: 仅 UserId/Email 登录（无 Token）

这是**调试/开发模式**，原生仅提供用户信息，不提供 Supabase token。

**步骤：**

```javascript
const event = new CustomEvent('mindboat:nativeLogin', {
  detail: {
    userId: 'a1234567-b123-c123-d123-e12345678901',
    email: 'test@firego.app',
    name: '测试用户'
  }
});
window.dispatchEvent(event);
```

**预期结果：**
- ✅ localStorage 中出现 `native_login: 'true'`
- ✅ localStorage 中有 `user_id`, `user_email`
- ⚠️ localStorage 中**没有** `session_token`, `refresh_token`
- ⚠️ 控制台输出警告："原生登录未提供 refresh_token"
- ✅ UI 显示已登录状态
- ❌ Supabase API 调用会失败（401/403 错误）

**用途：** 验证前端登录态显示逻辑，后端需要单独签发 token。

---

#### 测试场景 3: 预注入方式

模拟原生在页面加载前就注入 `window.MindBoatNativeAuth`。

**步骤：**

```javascript
// 设置预注入数据
window.MindBoatNativeAuth = {
  userId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  email: 'preinjected@firego.app',
  name: '预注入用户',
  accessToken: '...',
  refreshToken: '...'
};

// 刷新页面，AuthContext 会在 DOMContentLoaded 时自动读取
location.reload();
```

**预期结果：**
- ✅ 页面刷新后自动登录
- ✅ 控制台无手动触发事件的日志
- ✅ 行为与场景 1 相同

---

#### 测试场景 4: 原生登出

**步骤：**

```javascript
const event = new CustomEvent('mindboat:nativeLogout');
window.dispatchEvent(event);
```

**预期结果：**
- ✅ localStorage 清空所有认证相关数据
- ✅ `native_login` 标记被移除
- ✅ 控制台输出 "🔓 已登出"
- ✅ UI 显示未登录状态
- ✅ 跳转到登录页

---

### 2️⃣ iOS WebView 真实环境验证

#### iOS 端需要做的事情

```swift
// Swift 代码示例（WebView 注入）

// 方式 1: 页面加载前预注入
let script = """
window.MindBoatNativeAuth = {
  userId: '\(userId)',
  email: '\(email)',
  accessToken: '\(accessToken)',
  refreshToken: '\(refreshToken)',
  name: '\(userName)',
  pictureUrl: '\(pictureUrl)'
};
"""
let userScript = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true)
webView.configuration.userContentController.addUserScript(userScript)

// 方式 2: 登录后触发事件
webView.evaluateJavaScript("""
  const event = new CustomEvent('mindboat:nativeLogin', {
    detail: {
      userId: '\(userId)',
      email: '\(email)',
      accessToken: '\(accessToken)',
      refreshToken: '\(refreshToken)',
      name: '\(userName)',
      pictureUrl: '\(pictureUrl)'
    }
  });
  window.dispatchEvent(event);
""")

// 登出
webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('mindboat:nativeLogout'));")
```

#### 验证步骤

1. **在 iOS 应用中登录**
2. **打开 WebView 加载你的网页**
3. **使用 Safari 远程调试** (Mac 上的 Safari > 开发 > [设备名] > [WebView])
4. **在 Safari 控制台检查：**
   ```javascript
   // 检查登录态
   localStorage.getItem('native_login')  // 应该是 'true'
   localStorage.getItem('user_id')       // 应该是 iOS 传入的 userId
   localStorage.getItem('user_email')    // 应该是 iOS 传入的 email

   // 检查 window 对象（如果用预注入方式）
   window.MindBoatNativeAuth
   ```

5. **在网页 UI 上验证：**
   - 用户头像/名字是否正确显示
   - 是否能访问需要登录的页面
   - 是否能创建/查看任务和日程

---

## 验证检查点

### ✅ 登录成功的标志

#### LocalStorage 检查
```javascript
// 原生登录（有 token）
{
  "user_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "user_email": "user@example.com",
  "user_name": "用户名",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "native_login": "true",
  "is_new_user": "false"
}

// 原生登录（无 token）
{
  "user_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "user_email": "user@example.com",
  "user_name": "用户名",
  "native_login": "true",
  "is_new_user": "false"
}
```

#### 控制台日志
- ✅ 无警告或错误日志（场景 1）
- ⚠️ "原生登录未提供 refresh_token" 警告（场景 2 预期）
- ⚠️ "userId 不是有效的 UUID" 警告（如果 userId 格式错误）

#### AuthContext 状态
```javascript
// 在 React DevTools 或代码中检查
{
  isLoggedIn: true,
  isNativeLogin: true,
  userId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  userEmail: "user@example.com",
  userName: "用户名",
  sessionToken: "eyJhbGci...",  // 可能为 null（场景 2）
  refreshToken: "eyJhbGci..."   // 可能为 null（场景 2）
}
```

#### API 调用测试
```javascript
// 测试 Supabase API 是否正常工作
const { data, error } = await supabase
  .from('tasks')
  .select('*')
  .limit(1);

console.log('API 测试:', error ? '❌ 失败' : '✅ 成功', data);
```

---

### ❌ 登出成功的标志

#### LocalStorage 检查
```javascript
{
  "user_id": null,
  "user_email": null,
  "user_name": null,
  "session_token": null,
  "refresh_token": null,
  "native_login": null  // 已移除
}
```

#### AuthContext 状态
```javascript
{
  isLoggedIn: false,
  isNativeLogin: false,
  userId: null,
  userEmail: null,
  userName: null,
  sessionToken: null,
  refreshToken: null
}
```

---

## 常见问题排查

### 问题 1: 触发事件后没有反应

**可能原因：**
- AuthContext 还未挂载
- 事件监听器未注册

**检查方法：**
```javascript
// 检查事件监听器是否存在（需要在有权限的浏览器中）
getEventListeners(window)['mindboat:nativelogin']  // 应该有监听器
```

**解决方案：**
- 确保在 React 应用完全加载后再触发事件
- 使用预注入方式（`window.MindBoatNativeAuth`）更可靠

---

### 问题 2: userId 格式警告

**错误信息：**
```
⚠️ mindboat:nativeLogin 提供的 userId 不是有效的 Supabase UUID，Task/日程接口可能会返回 400
```

**原因：**
- userId 不是标准 UUID 格式（例如：数字 ID "12345"）

**解决方案：**
- iOS 端需要使用 Supabase 的用户 UUID
- 如果使用自己的用户系统，需要在后端建立映射关系

---

### 问题 3: 有登录态但 API 调用失败

**症状：**
- `isLoggedIn: true`
- 但调用 Supabase API 返回 401/403

**原因：**
- 场景 2（仅传 userId/email，无 token）

**解决方案：**
- 方案 A：iOS 端传递完整的 `accessToken` 和 `refreshToken`
- 方案 B：前端显示登录后，后端签发 token 并更新

---

### 问题 4: 原生登录后刷新页面就丢失

**可能原因：**
- Supabase 会话恢复逻辑清空了原生登录态

**检查方法：**
```javascript
// 检查 restoreSession 逻辑（AuthContext.tsx:484-547）
// 540-545 行应该保护原生登录
```

**解决方案：**
- 确保代码中 540-545 行的保护逻辑存在：
  ```typescript
  if (hasNativeAuth) {
    // 原生登录（无 Supabase token）场景：保留本地态由原生端接管
    setAuthState(readAuthFromStorage());
  } else {
    clearAuthStorage();
  }
  ```

---

### 问题 5: 原生登出后仍显示登录

**可能原因：**
- `mindboat:nativeLogout` 事件未正确触发
- logout 逻辑有问题

**检查方法：**
```javascript
// 手动清空测试
localStorage.clear();
location.reload();
```

**解决方案：**
- 确保 iOS 端正确触发事件
- 检查控制台是否有 "🔓 已登出" 日志

---

## 端到端测试清单

### 完整登录流程（场景 1）

- [ ] iOS 原生登录成功
- [ ] iOS 注入完整的 userId, email, accessToken, refreshToken
- [ ] WebView 加载网页
- [ ] 网页自动显示已登录状态
- [ ] 可以访问需要登录的页面（任务、日程等）
- [ ] 可以成功创建/编辑/删除任务
- [ ] 可以成功创建/查询日程
- [ ] localStorage 中有 `native_login: 'true'`
- [ ] localStorage 中有完整的 token
- [ ] 刷新页面后仍保持登录
- [ ] 关闭 WebView 再打开仍保持登录（如果原生侧保留了 session）

### 登出流程

- [ ] iOS 触发 `mindboat:nativeLogout` 事件
- [ ] 网页显示未登录状态
- [ ] localStorage 被清空
- [ ] 跳转到登录页
- [ ] 不能访问需要登录的页面

### 混合使用测试

- [ ] 原生登录后，在网页上邮箱登出 → 清空原生登录标记
- [ ] 邮箱登录后，原生登出 → 清空所有登录态
- [ ] 原生登录后，网页刷新 → 仍保持原生登录态

---

## 调试技巧

### 1. 启用详细日志

在 `AuthContext.tsx` 开头添加：

```typescript
const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) console.log('[AuthContext]', ...args);
}
```

### 2. React DevTools 检查

安装 React DevTools 浏览器扩展，检查 AuthContext 的状态：

1. 打开 React DevTools
2. 找到 `AuthProvider` 组件
3. 查看 `authState` 的值

### 3. Network 面板

检查 Supabase API 请求：

1. 打开浏览器 Network 面板
2. 筛选 XHR/Fetch 请求
3. 检查请求头中的 `Authorization` 是否存在

### 4. Safari 远程调试（iOS）

1. Mac 上打开 Safari
2. Safari > 偏好设置 > 高级 > 勾选"在菜单栏中显示开发菜单"
3. iOS 设备 > 设置 > Safari > 高级 > 开启 Web 检查器
4. 在 Mac 的 Safari > 开发 > [设备名] > [WebView]
5. 可以查看控制台、网络、localStorage 等

---

## 总结

### 快速验证步骤

1. **开发环境测试**（5分钟）
   - 打开 `test-native-auth.html`
   - 点击"场景 2: 仅 UserId/Email 登录"
   - 检查状态显示为"原生登录成功"

2. **真实 token 测试**（10分钟）
   - 先邮箱登录获取真实 token
   - 复制 token 到测试页面
   - 点击"场景 1: 完整 Token 登录"
   - 测试 API 调用（创建任务等）

3. **iOS WebView 测试**（取决于 iOS 开发进度）
   - iOS 端注入用户信息
   - 打开 WebView
   - Safari 远程调试检查状态
   - 测试完整功能流程

---

## 下一步

1. ✅ 验证浏览器模拟测试通过
2. ⏳ iOS 端实现注入逻辑
3. ⏳ 端到端集成测试
4. ⏳ 生产环境灰度测试
