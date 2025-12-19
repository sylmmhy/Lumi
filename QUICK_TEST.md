# 原生登录快速测试（无需额外页面）

## 🚀 最简单的测试方法

1. **打开你的应用任意页面**
   ```
   https://localhost:5173
   ```

2. **按 F12 打开控制台**

3. **复制粘贴以下代码并回车**：

```javascript
// 📋 快速测试脚本 - 原生登录桥接
(function() {
  console.log('🔐 开始测试原生登录...\n');

  // 测试函数：基础登录（无 token）
  window.testNativeLogin = function() {
    const payload = {
      userId: 'a1234567-b123-c123-d123-e12345678901',
      email: 'test@firego.app',
      name: '测试用户',
      pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test'
    };

    console.log('🚀 触发 mindboat:nativeLogin 事件', payload);
    const event = new CustomEvent('mindboat:nativeLogin', { detail: payload });
    window.dispatchEvent(event);

    setTimeout(() => {
      console.log('\n📊 检查登录状态...');
      checkAuthState();
    }, 1000);
  };

  // 测试函数：登出
  window.testNativeLogout = function() {
    console.log('🚪 触发 mindboat:nativeLogout 事件');
    const event = new CustomEvent('mindboat:nativeLogout');
    window.dispatchEvent(event);

    setTimeout(() => {
      console.log('\n📊 检查登出后状态...');
      checkAuthState();
    }, 1000);
  };

  // 检查状态
  window.checkAuthState = function() {
    const state = {
      user_id: localStorage.getItem('user_id'),
      user_email: localStorage.getItem('user_email'),
      user_name: localStorage.getItem('user_name'),
      session_token: localStorage.getItem('session_token'),
      refresh_token: localStorage.getItem('refresh_token'),
      native_login: localStorage.getItem('native_login'),
      is_new_user: localStorage.getItem('is_new_user'),
    };

    const isNativeLogin = state.native_login === 'true';
    const hasSession = !!state.session_token;
    const hasUserId = !!state.user_id;

    console.log('━'.repeat(60));

    if (isNativeLogin && hasUserId) {
      console.log('✅ 原生登录状态');
      console.log(`   用户: ${state.user_email || state.user_id}`);
      console.log(`   姓名: ${state.user_name || '(未设置)'}`);
      if (hasSession) {
        console.log('   ✅ 已同步 Supabase 会话');
      } else {
        console.warn('   ⚠️ 仅前端登录态（无 Supabase token）');
      }
    } else if (hasSession && hasUserId) {
      console.log('✅ 常规登录状态（非原生）');
      console.log(`   用户: ${state.user_email || state.user_id}`);
    } else if (hasUserId) {
      console.warn('⚠️ 异常状态：有 userId 但无 session');
    } else {
      console.log('ℹ️ 未登录状态');
    }

    console.log('━'.repeat(60));
    console.log('详细信息:');
    console.table(state);

    return state;
  };

  console.log('✅ 测试工具已加载\n');
  console.log('可用命令:');
  console.log('  testNativeLogin()  - 测试原生登录');
  console.log('  testNativeLogout() - 测试原生登出');
  console.log('  checkAuthState()   - 检查当前状态\n');

  // 自动检查当前状态
  checkAuthState();
})();
```

## ✨ 使用方法

### 测试登录
```javascript
testNativeLogin()
```

**预期输出：**
```
✅ 原生登录状态
   用户: test@firego.app
   姓名: 测试用户
   ⚠️ 仅前端登录态（无 Supabase token）
```

**验证：**
- 页面应该显示已登录（用户头像、名字等）
- localStorage 中有 `native_login: "true"`

### 测试登出
```javascript
testNativeLogout()
```

**预期输出：**
```
ℹ️ 未登录状态
```

**验证：**
- 页面应该跳转到登录页或显示未登录
- localStorage 中所有认证数据被清空

### 检查状态
```javascript
checkAuthState()
```

随时运行查看当前登录状态。

## 🎯 完整测试流程

1. **初始检查**
   ```javascript
   checkAuthState()  // 应该显示"未登录"
   ```

2. **测试登录**
   ```javascript
   testNativeLogin()  // 1秒后自动显示状态
   ```

3. **验证 UI**
   - 检查页面是否显示用户信息
   - 检查是否能访问需要登录的页面

4. **测试登出**
   ```javascript
   testNativeLogout()  // 1秒后自动显示状态
   ```

5. **验证清空**
   - 检查是否跳转到登录页
   - 检查 localStorage 是否清空

## 🔍 调试技巧

### 查看事件监听器
```javascript
// 检查是否注册了监听器
console.log('mindboat:nativeLogin listeners:',
  getEventListeners(window)['mindboat:nativelogin'] || '未注册'
);
```

### 手动检查 localStorage
```javascript
// 一次性查看所有认证相关数据
Object.keys(localStorage)
  .filter(key => key.includes('user') || key.includes('session') || key.includes('native'))
  .forEach(key => console.log(key, '=', localStorage.getItem(key)));
```

### 监控存储变化
```javascript
// 监听 localStorage 变化
window.addEventListener('storage', (e) => {
  console.log('📝 Storage changed:', e.key, '=', e.newValue);
});
```

## ⚡ 高级测试：完整 Token 登录

如果你想测试带 Supabase token 的登录（推荐生产环境）：

1. **先通过邮箱登录获取真实 token**
   ```javascript
   const realAccessToken = localStorage.getItem('session_token');
   const realRefreshToken = localStorage.getItem('refresh_token');
   console.log('Access Token:', realAccessToken?.substring(0, 30) + '...');
   console.log('Refresh Token:', realRefreshToken?.substring(0, 30) + '...');
   ```

2. **使用真实 token 测试**
   ```javascript
   const event = new CustomEvent('mindboat:nativeLogin', {
     detail: {
       userId: 'a1234567-b123-c123-d123-e12345678901', // 替换为真实 UUID
       email: 'test@firego.app',
       accessToken: realAccessToken,
       refreshToken: realRefreshToken,
       name: '测试用户'
     }
   });
   window.dispatchEvent(event);
   ```

3. **验证 API 调用**
   ```javascript
   // 测试是否能调用 Supabase API
   const { data, error } = await supabase.from('tasks').select('*').limit(1);
   console.log(error ? '❌ API 失败:' : '✅ API 成功:', data);
   ```

---

## 📱 与 iOS 真实集成的区别

以上是浏览器模拟测试。iOS 真实集成时：

```swift
// iOS 端注入代码
webView.evaluateJavaScript("""
  const event = new CustomEvent('mindboat:nativeLogin', {
    detail: {
      userId: '\(userId)',
      email: '\(email)',
      accessToken: '\(accessToken)',
      refreshToken: '\(refreshToken)',
      name: '\(userName)'
    }
  });
  window.dispatchEvent(event);
""")
```

效果完全一样！
