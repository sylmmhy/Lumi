---
title: "铃声类型选择功能"
created: 2026-01-19
updated: 2026-01-19 22:00
stage: "🚀 实现完成"
due: 2026-01-22
issue: ""
---

# 铃声类型选择功能 实现计划

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现
- [ ] 阶段 4：测试验证
- [ ] 阶段 5：文档更新

---

## 1. 背景与目标

### 需求
用户希望能够选择铃声类型：
- **人声铃声（Voice）**：当前的 AI 语音铃声（默认）
- **音乐铃声（Music）**：纯音乐铃声，无人声

### 目标
1. 在 Web 端 `/app/profile` 页面添加铃声类型选择 UI
2. 存储用户偏好到本地
3. 通过桥接同步设置到 iOS 和 Android 原生端
4. 原生端根据设置播放对应类型的铃声

---

## 2. 现有架构分析

### 2.1 iOS 端（mindboat-ios-web-warpper）

| 文件 | 作用 |
|------|-----|
| `MindBoat/Managers/RingtoneManager.swift` | 管理铃声轮换，返回铃声文件名 |
| `MindBoat/CallKit/CallManager.swift:124` | 调用 `RingtoneManager.selectNextRingtone()` 获取铃声 |
| `MindBoat/Resources/Ringtones/` | 存放铃声文件（ringtone_01~10.mp3） |

**铃声播放流程**：
```
CallManager.reportIncomingCall()
    ↓
RingtoneManager.selectNextRingtone()
    ↓
返回 "ringtone_XX.mp3"
    ↓
CXProviderConfiguration.ringtoneSound = "ringtone_XX.mp3"
    ↓
CallKit 播放铃声
```

### 2.2 Android 端（FireGo）

| 文件 | 作用 |
|------|-----|
| `app/src/main/java/com/miko/lumiai/utils/RandomRingtonePlayer.kt` | 随机选择并播放铃声 |
| `app/src/main/java/com/miko/lumiai/utils/IncomingCallManager.kt:142` | 调用 `RandomRingtonePlayer.play()` |
| `app/src/main/res/raw/` | 存放铃声文件（ringtone_0~9.wav） |

**铃声播放流程**：
```
IncomingCallManager.startFallbackRingtone()
    ↓
RandomRingtonePlayer(context)
    ↓
随机选择 R.raw.ringtone_X
    ↓
MediaPlayer.create() + start()
```

### 2.3 Web 端（firego--original-web）

| 文件 | 作用 |
|------|-----|
| `src/components/app-tabs/ProfileView.tsx` | 设置页面 UI |
| `src/lib/timeFormat.ts` | 时间格式设置的参考实现（localStorage） |
| `src/context/AuthContext.tsx:57-121` | 原生桥接接口定义 |

---

## 3. 实现方案

### 3.1 铃声文件准备

源文件：`/Users/miko_mac_mini/Desktop/ringing.MP3`

**iOS 端**：
- 目标路径：`MindBoat/Resources/Ringtones/music_ringtone.mp3`
- 需要添加到 Xcode 项目的 Build Phases

**Android 端**：
- 目标路径：`app/src/main/res/raw/music_ringtone.mp3`
- Android 资源文件名只能使用小写字母和下划线

### 3.2 Web 端实现

#### 3.2.1 新建铃声设置工具库
文件：`src/lib/ringtoneSettings.ts`

```typescript
/**
 * 铃声类型设置
 * 管理用户对铃声类型的偏好（人声/音乐）
 */

const RINGTONE_TYPE_STORAGE_KEY = 'lumi_ringtone_type';

export type RingtoneType = 'voice' | 'music';

/**
 * 获取用户的铃声类型偏好
 * 默认为 'voice'（人声铃声）
 */
export function getRingtoneType(): RingtoneType {
  try {
    const stored = localStorage.getItem(RINGTONE_TYPE_STORAGE_KEY);
    if (stored === 'voice' || stored === 'music') {
      return stored;
    }
    return 'voice'; // 默认人声
  } catch {
    return 'voice';
  }
}

/**
 * 设置用户的铃声类型偏好
 * 同时通知原生端更新设置
 */
export function setRingtoneType(type: RingtoneType): void {
  try {
    localStorage.setItem(RINGTONE_TYPE_STORAGE_KEY, type);
    // 通知原生端
    syncRingtoneTypeToNative(type);
  } catch (error) {
    console.error('Failed to save ringtone type:', error);
  }
}

/**
 * 同步铃声类型到原生端
 */
function syncRingtoneTypeToNative(type: RingtoneType): void {
  // Android
  if (window.AndroidBridge?.setRingtoneType) {
    window.AndroidBridge.setRingtoneType(type);
  }
  // iOS
  if (window.webkit?.messageHandlers?.setRingtoneType) {
    window.webkit.messageHandlers.setRingtoneType.postMessage({ type });
  }
}
```

#### 3.2.2 更新 TypeScript 类型定义
文件：`src/context/AuthContext.tsx`

在 `Window` 接口中添加：
```typescript
// Android Bridge
AndroidBridge?: {
  // ... 现有方法
  setRingtoneType?: (type: string) => void;
  getRingtoneType?: () => string;
};

// iOS WebView Bridge
webkit?: {
  messageHandlers?: {
    // ... 现有 handlers
    setRingtoneType?: { postMessage: (message: { type: string }) => void };
  };
};
```

#### 3.2.3 更新 ProfileView UI
文件：`src/components/app-tabs/ProfileView.tsx`

在时间格式设置下方添加铃声类型切换：

```tsx
{/* Ringtone Type Setting */}
<button
  onClick={handleRingtoneTypeToggle}
  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
>
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
      <i className="fa-solid fa-bell text-pink-500"></i>
    </div>
    <div className="text-left">
      <p className="font-medium text-gray-800">{t('profile.ringtoneType')}</p>
      <p className="text-sm text-gray-400">{t('profile.ringtoneTypeHint')}</p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-500">
      {currentRingtoneType === 'voice' ? t('profile.ringtoneVoice') : t('profile.ringtoneMusic')}
    </span>
    <div className={`w-12 h-7 rounded-full p-1 transition-colors ${currentRingtoneType === 'music' ? 'bg-brand-blue' : 'bg-gray-300'}`}>
      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${currentRingtoneType === 'music' ? 'translate-x-5' : 'translate-x-0'}`} />
    </div>
  </div>
</button>
```

#### 3.2.4 更新国际化文件
需要在所有语言文件中添加：

```json
{
  "profile": {
    "ringtoneType": "Ringtone Type",
    "ringtoneTypeHint": "Choose voice or music",
    "ringtoneVoice": "Voice",
    "ringtoneMusic": "Music"
  }
}
```

### 3.3 iOS 端实现

#### 3.3.1 添加铃声文件
1. 将 `ringing.MP3` 复制到 `MindBoat/Resources/Ringtones/music_ringtone.mp3`
2. 在 Xcode 中添加到项目

#### 3.3.2 更新 RingtoneManager.swift

```swift
final class RingtoneManager {
    static let shared = RingtoneManager()

    // 铃声类型
    enum RingtoneType: String {
        case voice = "voice"
        case music = "music"
    }

    // 人声铃声列表
    private let voiceRingtoneNames = [
        "ringtone_01", "ringtone_02", "ringtone_03", "ringtone_04", "ringtone_05",
        "ringtone_06", "ringtone_07", "ringtone_08", "ringtone_09", "ringtone_10"
    ]

    // 音乐铃声
    private let musicRingtoneName = "music_ringtone"

    // 用户设置的铃声类型
    private let ringtoneTypeKey = "RingtoneManager.ringtoneType"

    var currentRingtoneType: RingtoneType {
        get {
            let stored = UserDefaults.standard.string(forKey: ringtoneTypeKey)
            return RingtoneType(rawValue: stored ?? "voice") ?? .voice
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: ringtoneTypeKey)
            print("🔔 RingtoneManager: 铃声类型已设置为 \(newValue.rawValue)")
        }
    }

    /// 根据当前设置选择铃声
    func selectNextRingtone() -> String {
        switch currentRingtoneType {
        case .voice:
            return selectNextVoiceRingtone()
        case .music:
            return "\(musicRingtoneName).mp3"
        }
    }

    private func selectNextVoiceRingtone() -> String {
        // 原有的轮换逻辑
        let lastIndex = UserDefaults.standard.integer(forKey: lastIndexKey)
        let nextIndex = (lastIndex + 1) % voiceRingtoneNames.count
        UserDefaults.standard.set(nextIndex, forKey: lastIndexKey)
        return "\(voiceRingtoneNames[nextIndex]).mp3"
    }
}
```

#### 3.3.3 添加 WebView 桥接
文件：`MindBoat/ViewControllers/WebViewController.swift`

在 WKScriptMessageHandler 中添加：

```swift
case "setRingtoneType":
    if let body = message.body as? [String: Any],
       let typeString = body["type"] as? String {
        let type = RingtoneManager.RingtoneType(rawValue: typeString) ?? .voice
        RingtoneManager.shared.currentRingtoneType = type
    }
```

在 `userContentController` 注册：
```swift
contentController.add(self, name: "setRingtoneType")
```

### 3.4 Android 端实现

#### 3.4.1 添加铃声文件
1. 将 `ringing.MP3` 复制到 `app/src/main/res/raw/music_ringtone.mp3`

#### 3.4.2 创建 RingtonePreferences.kt
文件：`app/src/main/java/com/miko/lumiai/utils/RingtonePreferences.kt`

```kotlin
package com.miko.lumiai.utils

import android.content.Context
import android.content.SharedPreferences

/**
 * 铃声设置管理器
 * 存储和读取用户的铃声类型偏好
 */
object RingtonePreferences {
    private const val PREFS_NAME = "ringtone_preferences"
    private const val KEY_RINGTONE_TYPE = "ringtone_type"

    enum class RingtoneType(val value: String) {
        VOICE("voice"),
        MUSIC("music");

        companion object {
            fun fromValue(value: String): RingtoneType {
                return values().find { it.value == value } ?: VOICE
            }
        }
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getRingtoneType(context: Context): RingtoneType {
        val value = getPrefs(context).getString(KEY_RINGTONE_TYPE, RingtoneType.VOICE.value)
        return RingtoneType.fromValue(value ?: RingtoneType.VOICE.value)
    }

    fun setRingtoneType(context: Context, type: RingtoneType) {
        getPrefs(context).edit().putString(KEY_RINGTONE_TYPE, type.value).apply()
    }
}
```

#### 3.4.3 更新 RandomRingtonePlayer.kt

```kotlin
class RandomRingtonePlayer(private val context: Context) {

    private var mediaPlayer: MediaPlayer? = null

    // 人声铃声列表
    private val voiceRingtones = listOf(
        R.raw.ringtone_0, R.raw.ringtone_1, R.raw.ringtone_2, R.raw.ringtone_3,
        R.raw.ringtone_4, R.raw.ringtone_5, R.raw.ringtone_6, R.raw.ringtone_7,
        R.raw.ringtone_8, R.raw.ringtone_9
    )

    // 音乐铃声
    private val musicRingtone = R.raw.music_ringtone

    /**
     * 根据用户设置选择并播放铃声
     */
    fun play() {
        stop()

        val ringtoneType = RingtonePreferences.getRingtoneType(context)
        val selectedRingtone = when (ringtoneType) {
            RingtonePreferences.RingtoneType.VOICE -> {
                voiceRingtones[Random.nextInt(voiceRingtones.size)]
            }
            RingtonePreferences.RingtoneType.MUSIC -> {
                musicRingtone
            }
        }

        try {
            mediaPlayer = MediaPlayer.create(context, selectedRingtone).apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
                isLooping = true
                start()
            }
            Log.d("RandomRingtonePlayer", "Playing ringtone type: ${ringtoneType.value}")
        } catch (e: Exception) {
            Log.e("RandomRingtonePlayer", "播放铃声失败", e)
        }
    }

    // ... stop() 和 isPlaying() 保持不变
}
```

#### 3.4.4 更新 WebView Bridge
文件：`app/src/main/java/com/miko/lumiai/webview/WebViewBridge.kt`（或对应文件）

添加 JavascriptInterface 方法：

```kotlin
@JavascriptInterface
fun setRingtoneType(type: String) {
    val ringtoneType = RingtonePreferences.RingtoneType.fromValue(type)
    RingtonePreferences.setRingtoneType(context, ringtoneType)
    Log.d("WebViewBridge", "Ringtone type set to: $type")
}

@JavascriptInterface
fun getRingtoneType(): String {
    return RingtonePreferences.getRingtoneType(context).value
}
```

---

## 4. 实现步骤清单

### Phase 1: Web 端 ✅
- [x] 创建 `src/lib/ringtoneSettings.ts`
- [x] 更新 `src/context/AuthContext.tsx` 添加桥接类型
- [x] 更新 `src/components/app-tabs/ProfileView.tsx` 添加 UI
- [x] 更新所有语言文件 (`src/locales/*.json`)

### Phase 2: iOS 端 ✅
- [x] 复制铃声文件到 `MindBoat/Resources/Ringtones/music_ringtone.mp3`
- [ ] 在 Xcode 中添加文件到项目（需要手动操作）
- [x] 更新 `RingtoneManager.swift`
- [x] 更新 `WebViewController.swift` 添加桥接
- [x] 更新 `WebViewConfigurationFactory.swift` 注册消息处理器

### Phase 3: Android 端 ✅
- [x] 复制铃声文件到 `app/src/main/res/raw/music_ringtone.mp3`
- [x] 创建 `RingtonePreferences.kt`
- [x] 更新 `RandomRingtonePlayer.kt`
- [x] 更新 `TaskBridge.kt` 添加桥接接口

### Phase 4: 测试
- [ ] Web 端：切换设置后 localStorage 正确保存
- [ ] iOS 端：接收桥接消息，铃声正确切换
- [ ] Android 端：接收桥接消息，铃声正确切换
- [ ] 跨会话测试：重启 App 后设置保持

---

## 5. 关键文件汇总

| 项目 | 文件 | 变更类型 |
|------|-----|---------|
| Web | `src/lib/ringtoneSettings.ts` | 新建 |
| Web | `src/context/AuthContext.tsx` | 修改 |
| Web | `src/components/app-tabs/ProfileView.tsx` | 修改 |
| Web | `src/locales/*.json` (6个文件) | 修改 |
| iOS | `MindBoat/Resources/Ringtones/music_ringtone.mp3` | 新增 |
| iOS | `MindBoat/Managers/RingtoneManager.swift` | 修改 |
| iOS | `MindBoat/ViewControllers/WebViewController.swift` | 修改 |
| Android | `app/src/main/res/raw/music_ringtone.mp3` | 新增 |
| Android | `app/src/main/java/.../utils/RingtonePreferences.kt` | 新建 |
| Android | `app/src/main/java/.../utils/RandomRingtonePlayer.kt` | 修改 |
| Android | WebView Bridge 文件 | 修改 |

---

## 6. 实现记录

### 2026-01-19
- 完成需求分析和现有架构梳理
- 确定三端联动的实现方案
- 创建详细的实现计划文档

### 2026-01-19 (实现阶段)
**Web 端完成：**
- 创建 `src/lib/ringtoneSettings.ts` 铃声设置工具库
- 更新 `src/context/AuthContext.tsx` 添加 `setRingtoneType` 桥接类型定义
- 更新 `src/components/app-tabs/ProfileView.tsx` 添加铃声类型切换 UI（toggle switch）
- 更新 6 个语言文件添加国际化文本（en/zh/es/ja/ko/it）

**iOS 端完成：**
- 复制 `music_ringtone.mp3` 到 `MindBoat/Resources/Ringtones/`
- 重构 `RingtoneManager.swift`：添加 `RingtoneType` 枚举、支持人声/音乐两种模式
- 更新 `WebViewController.swift`：添加 `setRingtoneType` 消息处理
- 更新 `WebViewConfigurationFactory.swift`：注册 `setRingtoneType` 消息处理器

**Android 端完成：**
- 复制 `music_ringtone.mp3` 到 `app/src/main/res/raw/`
- 创建 `RingtonePreferences.kt`：铃声类型偏好管理
- 更新 `RandomRingtonePlayer.kt`：根据用户设置选择人声或音乐铃声
- 更新 `TaskBridge.kt`：添加 `setRingtoneType()` 和 `getRingtoneType()` JavaScript 接口

**待测试：**
- 需要在 Xcode 中手动添加 `music_ringtone.mp3` 到项目 Build Phases
- 三端联调测试

---

## 7. 注意事项

1. **铃声文件格式**：
   - iOS 支持 mp3、m4a、caf 格式
   - Android 资源文件名只能用小写字母和下划线

2. **默认值**：
   - 所有端默认使用人声铃声（voice），保持向后兼容

3. **同步时机**：
   - Web 端切换时立即同步到原生端
   - App 启动时不需要从原生端同步回 Web（各端独立存储）

4. **测试设备**：
   - iOS：真机测试（模拟器可能没有铃声）
   - Android：真机测试各种品牌
