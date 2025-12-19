/**
 * 原生登录桥接 - 浏览器控制台测试脚本
 *
 * 使用方法：
 * 1. 在你的应用页面打开浏览器控制台（F12）
 * 2. 复制整个文件内容粘贴到控制台执行
 * 3. 使用提供的函数进行测试
 */

console.log('🔐 原生登录测试工具已加载');
console.log('可用函数：');
console.log('  - testNativeLogin()          测试完整登录（需先填写真实 token）');
console.log('  - testBasicLogin()           测试仅 userId/email 登录');
console.log('  - testNativeLogout()         测试原生登出');
console.log('  - checkAuthState()           检查当前登录状态');
console.log('  - clearAuthState()           清空所有登录信息');

/**
 * 测试完整原生登录（带 Supabase token）
 *
 * ⚠️ 注意：accessToken 和 refreshToken 必须是真实的 Supabase JWT token
 * 如何获取真实 token：
 * 1. 在应用中通过邮箱登录
 * 2. 运行 localStorage.getItem('session_token') 获取 accessToken
 * 3. 运行 localStorage.getItem('refresh_token') 获取 refreshToken
 * 4. 将这些值填入下面的 payload
 */
window.testNativeLogin = function() {
  const payload = {
    userId: 'a1234567-b123-c123-d123-e12345678901', // ⚠️ 替换为真实 UUID
    email: 'test@firego.app',
    name: '测试用户',
    pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
    // ⚠️ 下面的 token 需要替换为真实的 Supabase JWT
    accessToken: localStorage.getItem('session_token') || 'REPLACE_WITH_REAL_ACCESS_TOKEN',
    refreshToken: localStorage.getItem('refresh_token') || 'REPLACE_WITH_REAL_REFRESH_TOKEN',
  };

  if (payload.accessToken === 'REPLACE_WITH_REAL_ACCESS_TOKEN') {
    console.warn('⚠️ 请先通过邮箱登录，然后再次运行此函数以使用真实 token');
    console.warn('或手动编辑此脚本，填入真实的 accessToken 和 refreshToken');
    return;
  }

  console.log('🚀 触发 mindboat:nativeLogin 事件', payload);
  const event = new CustomEvent('mindboat:nativeLogin', { detail: payload });
  window.dispatchEvent(event);

  setTimeout(() => {
    console.log('⏱️ 等待 500ms 后检查状态...');
    checkAuthState();
  }, 500);
};

/**
 * 测试基础原生登录（仅 userId/email，无 token）
 *
 * 这种情况下：
 * - 前端会显示已登录状态
 * - isNativeLogin = true
 * - 但 Supabase API 调用会失败（因为没有 token）
 */
window.testBasicLogin = function() {
  const payload = {
    userId: 'a1234567-b123-c123-d123-e12345678901', // ⚠️ 替换为真实 UUID
    email: 'basic@firego.app',
    name: '基础登录用户',
  };

  console.log('🔑 触发 mindboat:nativeLogin 事件（无 token）', payload);
  console.warn('⚠️ 此模式下仅前端显示登录，Supabase API 仍需后端签发 token 才能调用');

  const event = new CustomEvent('mindboat:nativeLogin', { detail: payload });
  window.dispatchEvent(event);

  setTimeout(() => {
    console.log('⏱️ 等待 500ms 后检查状态...');
    checkAuthState();
  }, 500);
};

/**
 * 测试原生登出
 */
window.testNativeLogout = function() {
  console.log('🚪 触发 mindboat:nativeLogout 事件');
  const event = new CustomEvent('mindboat:nativeLogout');
  window.dispatchEvent(event);

  setTimeout(() => {
    console.log('⏱️ 等待 500ms 后检查状态...');
    checkAuthState();
  }, 500);
};

/**
 * 检查当前认证状态
 */
window.checkAuthState = function() {
  const state = {
    user_id: localStorage.getItem('user_id'),
    user_email: localStorage.getItem('user_email'),
    user_name: localStorage.getItem('user_name'),
    user_picture: localStorage.getItem('user_picture'),
    session_token: localStorage.getItem('session_token'),
    refresh_token: localStorage.getItem('refresh_token'),
    native_login: localStorage.getItem('native_login'),
    is_new_user: localStorage.getItem('is_new_user'),
  };

  const isNativeLogin = state.native_login === 'true';
  const hasSession = !!state.session_token;
  const hasUserId = !!state.user_id;

  console.log('📊 当前认证状态：');
  console.log('─'.repeat(60));

  if (isNativeLogin && hasUserId) {
    console.log('✅ 原生登录状态');
    console.log(`   用户: ${state.user_email || state.user_id}`);
    console.log(`   姓名: ${state.user_name || '(未设置)'}`);
    if (hasSession) {
      console.log('   ✅ 已同步 Supabase 会话');
      console.log(`   Access Token: ${state.session_token?.substring(0, 30)}...`);
    } else {
      console.warn('   ⚠️ 仅前端登录态（无 Supabase token）');
      console.warn('   ⚠️ Supabase API 调用会失败，需要后端签发 token');
    }
  } else if (hasSession && hasUserId) {
    console.log('✅ 常规登录状态（非原生）');
    console.log(`   用户: ${state.user_email || state.user_id}`);
  } else if (hasUserId) {
    console.warn('⚠️ 异常状态：有 userId 但无 session');
    console.warn('   可能被误清除，请检查代码逻辑');
  } else {
    console.log('ℹ️ 未登录状态');
  }

  console.log('─'.repeat(60));
  console.log('详细信息:');
  console.table(state);

  if (window.MindBoatNativeAuth) {
    console.log('window.MindBoatNativeAuth:', window.MindBoatNativeAuth);
  }

  return state;
};

/**
 * 清空所有认证状态（用于重置测试）
 */
window.clearAuthState = function() {
  const keys = [
    'user_id',
    'user_email',
    'user_name',
    'user_picture',
    'session_token',
    'refresh_token',
    'native_login',
    'is_new_user',
  ];

  console.log('🗑️ 清空认证状态...');
  keys.forEach(key => {
    localStorage.removeItem(key);
  });

  delete window.MindBoatNativeAuth;

  console.log('✅ 已清空');
  checkAuthState();
};

// 自动检查初始状态
console.log('');
checkAuthState();
console.log('');
console.log('💡 提示：运行 testBasicLogin() 快速测试基础登录');
