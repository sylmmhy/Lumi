[18:10:21.474] [INFO] [DevConsole] 调试控制台已启动
[18:10:21.482] [INFO] [DevConsole] WebView 环境: native-app
[18:10:21.482] [INFO] [DevConsole] User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mind...
[18:10:21.482] [LOG] 🔐 NativeAuth bootstrap window armed: startNativeAuthBridge deadline= 1770430229474
[18:10:21.482] [LOG] 🔐 Web: Native Auth Bridge 已初始化
[18:10:21.482] [LOG] 🔐 Web: 发现已设置的登录态，立即处理
[18:10:21.482] [LOG] 🔐 NativeAuth bootstrap window armed: native_payload_found deadline= 1770430229474
[18:10:21.482] [LOG] 🔐 applyNativeLogin: 开始处理, userId: 31d5da79-2cfc-445d-9543-eefc5b8d31d7
[18:10:21.482] [LOG] 🔐 setSession (applyNativeLogin): 获取锁
[18:10:21.482] [LOG] 🔐 applyNativeLogin: 调用 setSession (尝试 1/3)...
[18:10:21.482] [LOG] 📱 已取消注册 window.refreshTasks()
[18:10:21.482] [LOG] 📹 useVideoInput unmounted, all resources cleaned up
[18:10:21.482] [LOG] 🔌 Disconnecting Gemini Live...
[18:10:21.482] [LOG] 🔌 Disconnecting Gemini Live session...
[18:10:21.482] [LOG] ✅ Gemini Live session disconnected
[18:10:21.482] [LOG] 🎤 Microphone stopped
[18:10:21.482] [LOG] 📹 Camera stopped
[18:10:21.482] [LOG] ✅ Gemini Live disconnected and cleaned up
[18:10:21.482] [INFO] [DevConsole] 调试控制台已启动
[18:10:21.482] [INFO] [DevConsole] WebView 环境: native-app
[18:10:21.482] [INFO] [DevConsole] User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mind...
[18:10:21.482] [DEBUG] [PermissionContext] 跳过权限检查（防抖）
[18:10:21.482] [LOG] 🔐 NativeAuth bootstrap window armed: startNativeAuthBridge deadline= 1770430229476
[18:10:21.482] [LOG] 🔐 Web: Native Auth Bridge 已初始化
[18:10:21.482] [LOG] 🔐 Web: 发现已设置的登录态，立即处理
[18:10:21.482] [LOG] 🔐 NativeAuth bootstrap window armed: native_payload_found deadline= 1770430229476
[18:10:21.482] [LOG] 🔐 applyNativeLogin: 已在处理中，跳过重复调用
[18:10:21.482] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "categoriesCount": 1,
  "isAuthorized": true,
  "action": "statusUpdate",
  "isConfigured": true,
  "status": "approved"
}
[18:10:21.482] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "categoriesCount": 1,
  "isAuthorized": true,
  "action": "statusUpdate",
  "isConfigured": true,
  "status": "approved"
}
[18:10:21.482] [LOG] 🔄 restoreSession: 正在处理原生登录，跳过
[18:10:21.482] [LOG] 🔄 restoreSession: 正在处理原生登录，跳过
[18:10:21.536] [LOG] 🔐 iOS: native 提供了 token，强制触发登录事件以建立新会话
[18:10:21.536] [LOG] 🔐 applyNativeLogin: 已在处理中，跳过重复调用
[18:10:21.576] [WARN] Amplitude API key missing; analytics disabled.
[18:10:21.655] [LOG] 🔄 Auth state changed: SIGNED_IN
[18:10:21.655] [LOG] 📱 onAuthStateChange: 原生 App 环境，跳过数据库查询，从 URL 推断 hasCompletedHabitOnboarding = true
[18:10:21.655] [LOG] ✅ onAuthStateChange: 处理完成, hasCompletedHabitOnboarding = true
[18:10:21.655] [LOG] ✅ applyNativeLogin: setSession 成功，Supabase 会话已建立，autoRefreshToken 已激活
[18:10:21.655] [LOG] 🔐 setSession (applyNativeLogin): 释放锁
[18:10:21.655] [LOG] 🔄 Auth state changed: INITIAL_SESSION
[18:10:21.655] [LOG] 📱 onAuthStateChange: 原生 App 环境，跳过数据库查询，从 URL 推断 hasCompletedHabitOnboarding = true
[18:10:21.655] [LOG] ✅ onAuthStateChange: 处理完成, hasCompletedHabitOnboarding = true
[18:10:21.676] [WARN] PostHog key missing; analytics disabled.
[18:10:21.754] [LOG] 🔐 applyNativeLogin: onAuthStateChange 已接管状态处理，跳过重复查询
[18:10:21.754] [LOG] 🔐 Web: 已通知 Native 停止重试, reason: session_set
[18:10:21.769] [LOG] 🔍 [DEBUG] fetchReminders 返回的任务: [
  {
    "id": "e5c47cfd-b2fb-49a4-b188-3a25177bb389",
    "title": "打那个电话",
    "is_snoozed": false,
    "time": "10:16",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "f6b3af07-d2cc-42be-b65a-61b72c2acfab",
    "title": "需要洗澡",
    "is_snoozed": false,
    "time": "10:44",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "dae6f6e4-39c8-4f3c-94c5-b9d1160acd26",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "10:45",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "201db622-7bd7-4583-a0d2-5d5836d269ad",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:46",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "7cd0da19-e676-4171-be44-247c6c691c86",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "10:48",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "2245da6e-f2e3-4b97-8761-4de0f859c29d",
    "title": "需要洗澡",
    "is_snoozed": false,
    "time": "10:51",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "c348b2c8-55b8-477e-b7a7-217aa9f862dc",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:52",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "e52fbceb-2386-4e3e-b15c-129e83f33cc6",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:53",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "1c6689f7-f0f8-4581-ac38-65330518375e",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:54",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "164332c3-249c-4759-8b5a-e1cd72372be3",
    "title": "打扫卫生",
    "is_snoozed": false,
    "time": "14:39",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "00b7eeaf-d098-4721-9730-966784ae7c11",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "17:22",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "a021c1ec-41ad-4f4e-8277-f6b34df2e771",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "17:59",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "8f2dc21b-6aca-4285-a383-ff2f9ad5e13f",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "18:08",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "ef768807-6164-40ea-bc46-abab419d8d1c",
    "title": "起床",
    "is_snoozed": false,
    "time": "18:10",
    "reminder_date": "2026-02-06"
  }
]
[18:10:21.784] [LOG] 🔍 [DEBUG] fetchReminders 返回的任务: [
  {
    "id": "e5c47cfd-b2fb-49a4-b188-3a25177bb389",
    "title": "打那个电话",
    "is_snoozed": false,
    "time": "10:16",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "f6b3af07-d2cc-42be-b65a-61b72c2acfab",
    "title": "需要洗澡",
    "is_snoozed": false,
    "time": "10:44",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "dae6f6e4-39c8-4f3c-94c5-b9d1160acd26",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "10:45",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "201db622-7bd7-4583-a0d2-5d5836d269ad",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:46",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "7cd0da19-e676-4171-be44-247c6c691c86",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "10:48",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "2245da6e-f2e3-4b97-8761-4de0f859c29d",
    "title": "需要洗澡",
    "is_snoozed": false,
    "time": "10:51",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "c348b2c8-55b8-477e-b7a7-217aa9f862dc",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:52",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "e52fbceb-2386-4e3e-b15c-129e83f33cc6",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:53",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "1c6689f7-f0f8-4581-ac38-65330518375e",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "10:54",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "164332c3-249c-4759-8b5a-e1cd72372be3",
    "title": "打扫卫生",
    "is_snoozed": false,
    "time": "14:39",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "00b7eeaf-d098-4721-9730-966784ae7c11",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "17:22",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "a021c1ec-41ad-4f4e-8277-f6b34df2e771",
    "title": "睡觉",
    "is_snoozed": false,
    "time": "17:59",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "8f2dc21b-6aca-4285-a383-ff2f9ad5e13f",
    "title": "开始阅读",
    "is_snoozed": false,
    "time": "18:08",
    "reminder_date": "2026-02-06"
  },
  {
    "id": "ef768807-6164-40ea-bc46-abab419d8d1c",
    "title": "起床",
    "is_snoozed": false,
    "time": "18:10",
    "reminder_date": "2026-02-06"
  }
]
[18:10:21.901] [LOG] 📱 [iOS] 已发送 taskChanged 批量同步消息 {
  "count": 14
}
[18:10:21.901] [LOG] 📱 已同步 14 个任务到原生端
[18:10:21.942] [LOG] 📱 [iOS] 已发送 taskChanged 批量同步消息 {
  "count": 14
}
[18:10:21.942] [LOG] 📱 已同步 14 个任务到原生端
[18:10:21.946] [LOG] ✓ VoIP Token injected
[18:10:23.871] [LOG] [PermissionsSection] Mount - isAndroidWebView: false isIOSWebView: true
[18:10:23.883] [LOG] [PermissionsSection] window.webkit: true
[18:10:23.883] [LOG] [PermissionsSection] window.webkit.messageHandlers: true
[18:10:23.883] [LOG] [PermissionsSection] iOS: checking notification permission
[18:10:23.883] [LOG] [PermissionsSection] iOS: checking microphone permission
[18:10:23.883] [LOG] [PermissionsSection] iOS: checking camera permission
[18:10:23.883] [LOG] [HealthKit] Checking permission status...
[18:10:23.883] [LOG] [PermissionsSection] Mount - isAndroidWebView: false isIOSWebView: true
[18:10:23.883] [LOG] [PermissionsSection] window.webkit: true
[18:10:23.883] [LOG] [PermissionsSection] window.webkit.messageHandlers: true
[18:10:23.883] [DEBUG] [PermissionsSection] 跳过权限检查（防抖）
[18:10:23.883] [LOG] [HealthKit] Checking permission status...
[18:10:23.883] [LOG] [PermissionsSection] Native permission result: microphone = true, status = granted
[18:10:23.883] [LOG] [PermissionsSection] Native permission result: camera = true, status = granted
[18:10:23.883] [LOG] [HealthKit] Result received: {
  "type": "permissionStatus",
  "data": {
    "status": "prompt",
    "granted": false
  }
}
[18:10:23.883] [LOG] [HealthKit] Result received: {
  "type": "permissionStatus",
  "data": {
    "status": "prompt",
    "granted": false
  }
}
[18:10:23.883] [LOG] [HealthKitSection] Authorization status: prompt
[18:10:23.883] [LOG] [HealthKitSection] Authorization status: prompt
[18:10:23.883] [LOG] [PermissionsSection] Native permission result: notification = true, status = granted
[18:10:23.883] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "isAuthorized": true,
  "categoriesCount": 1,
  "action": "statusUpdate",
  "isConfigured": true,
  "status": "approved"
}
[18:10:23.883] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "isAuthorized": true,
  "categoriesCount": 1,
  "action": "statusUpdate",
  "isConfigured": true,
  "status": "approved"
}
[18:10:24.480] [LOG] 🔄 会话检查触发来源: initial_delay
[18:10:40.692] [LOG] [PermissionsSection] Mount - isAndroidWebView: false isIOSWebView: true
[18:10:40.695] [LOG] [PermissionsSection] window.webkit: true
[18:10:40.695] [LOG] [PermissionsSection] window.webkit.messageHandlers: true
[18:10:40.695] [LOG] [PermissionsSection] iOS: checking notification permission
[18:10:40.695] [LOG] [PermissionsSection] iOS: checking microphone permission
[18:10:40.695] [LOG] [PermissionsSection] iOS: checking camera permission
[18:10:40.695] [LOG] [HealthKit] Checking permission status...
[18:10:40.695] [LOG] [PermissionsSection] Mount - isAndroidWebView: false isIOSWebView: true
[18:10:40.695] [LOG] [PermissionsSection] window.webkit: true
[18:10:40.695] [LOG] [PermissionsSection] window.webkit.messageHandlers: true
[18:10:40.695] [DEBUG] [PermissionsSection] 跳过权限检查（防抖）
[18:10:40.695] [LOG] [HealthKit] Checking permission status...
[18:10:40.695] [LOG] [PermissionsSection] Native permission result: microphone = true, status = granted
[18:10:40.695] [LOG] [PermissionsSection] Native permission result: camera = true, status = granted
[18:10:40.699] [LOG] [HealthKit] Result received: {
  "type": "permissionStatus",
  "data": {
    "granted": false,
    "status": "prompt"
  }
}
[18:10:40.699] [LOG] [HealthKit] Result received: {
  "type": "permissionStatus",
  "data": {
    "granted": false,
    "status": "prompt"
  }
}
[18:10:40.699] [LOG] [HealthKitSection] Authorization status: prompt
[18:10:40.699] [LOG] [HealthKitSection] Authorization status: prompt
[18:10:40.699] [LOG] [PermissionsSection] Native permission result: notification = true, status = granted
[18:10:40.699] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "categoriesCount": 1,
  "isAuthorized": true,
  "action": "statusUpdate",
  "status": "approved",
  "isConfigured": true
}
[18:10:40.699] [LOG] [ScreenTime] Callback received: {
  "appsCount": 19,
  "isLocked": true,
  "categoriesCount": 1,
  "isAuthorized": true,
  "action": "statusUpdate",
  "status": "approved",
  "isConfigured": true
}
[18:10:43.169] [LOG] 🔄 Auth state changed: SIGNED_IN
[18:10:43.193] [LOG] 📱 onAuthStateChange: 原生 App 环境，跳过数据库查询，从 URL 推断 hasCompletedHabitOnboarding = true
[18:10:43.193] [LOG] ✅ onAuthStateChange: 处理完成, hasCompletedHabitOnboarding = true
[18:10:54.761] [LOG] [DevConsole] 使用 Clipboard API 复制成功