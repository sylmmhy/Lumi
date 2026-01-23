# Amplitude 数据分析规则

## 内部用户排除列表

以下账户为内部开发/测试人员，在数据分析时需要排除：

| 邮箱 | 备注 |
|------|------|
| wenxuanw060@gmail.com | 开发人员 |
| sylblh@gmail.com | 开发人员 |
| johnqin130@gmail.com | 开发人员 |
| jxd5jx7tv7@privaterelay.appleid.com | 开发人员 |
| davidzhangshs@gmail.com | 开发人员 |
| eimantas.petk@gmail.com | 开发人员 |
| echoxlu114@gmail.com | 开发人员 |
| 1002942101@qq.com | 开发人员 |
| 25sg4p7scp@privaterelay.appleid.com | 开发人员 |
| aayushi.rawat677@gmail.com | Aayushi |
| aayushi.rawat67774@gmail.com | Aayushi |
| q@q.com | 测试账户 |
| devteam@mindboat.app | 团队账户 |

### 在 Amplitude 中排除内部用户

在 Amplitude 查询时，使用 Segment 条件排除：
```
Segment: User Property "gp:email" is not any of [上述邮箱列表]
```

---

## 新用户定义规则

### 真实新用户的定义

只有满足以下条件之一的用户才算"真实新用户"：

1. **iOS App 用户**:
   - OS 包含 "WKWebView"
   - 且完成了注册流程

2. **Android App 用户**:
   - Device family = "Android"
   - OS 包含 "Chrome Mobile" 但不是普通浏览器
   - 且完成了注册流程

### 排除的用户类型

- 纯网页访问（非 App 内 WebView）
- HeadlessChrome（爬虫/自动化测试）
- 内部开发人员账户

---

## 追踪事件列表

### Landing Page 事件

| 事件名称 | 触发时机 | 属性 |
|---------|---------|------|
| `landing_page_viewed` | 访问 Landing Page | `referrer`, `url`, `timestamp` |
| `landing_cta_clicked` | 点击下载按钮 | `button_type`, `button_text`, `destination` |

**button_type 值**:
- `ios_download`: 点击 "Get the App" 按钮
- `android_beta`: 点击 "Android Beta" 按钮

### 核心功能事件

| 事件名称 | 触发时机 |
|---------|---------|
| `gemini_live_connected` | AI 连接成功 |
| `gemini_live_disconnected` | AI 断开连接 |
| `gemini_live_mic_toggled` | 麦克风开关 |
| `gemini_live_camera_toggled` | 摄像头开关 |

---

## Amplitude 查询模板

### 1. Landing Page 转化漏斗

```json
{
  "type": "funnels",
  "events": [
    {"event_type": "landing_page_viewed"},
    {"event_type": "landing_cta_clicked", "filters": [{"subprop_key": "button_type", "subprop_op": "is", "subprop_value": ["ios_download"]}]},
    {"event_type": "_new"}
  ]
}
```

### 2. 排除内部用户的真实新用户查询

在 Segment 中添加条件：
- `gp:email` is not any of [内部邮箱列表]
- `os` contains "WKWebView" OR `device` is "Android"

### 3. iOS WebView 真实用户漏斗

```json
{
  "type": "funnels",
  "segments": [{
    "conditions": [{
      "type": "property",
      "prop": "os",
      "op": "contains",
      "values": ["WKWebView"]
    }]
  }],
  "events": [
    {"event_type": "_new"},
    {"event_type": "gemini_live_connected"},
    {"event_type": "gemini_live_mic_toggled"}
  ]
}
```

---

## 数据更新日志

| 日期 | 更新内容 |
|------|---------|
| 2026-01-23 | 初始创建：添加 landing_page_viewed 和 landing_cta_clicked 事件追踪 |
