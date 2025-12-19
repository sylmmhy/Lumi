# IP 哈希使用指南 - 隐私友好的滥用监控

## ✅ 已完成的改动

数据库已添加：
- **新字段**：`onboarding_session.ip_address_hash` （存储 IP 的哈希值）
- **索引 1**：`idx_onboarding_ip_hash` （加速查询）
- **索引 2**：`idx_onboarding_ip_hash_created` （加速"24小时内重复访问"查询）

---

## 🧠 为什么要用 IP 哈希？（小白版）

### 传统做法的问题：
```
用户访问 → 直接存 IP: "192.168.1.100" → 数据库
```

**问题**：
- 🚨 **隐私风险**：IP 地址算"个人信息"（欧洲 GDPR 规定），直接存可能违法
- 🚨 **安全风险**：黑客入侵数据库后，能看到所有用户的真实 IP
- 🚨 **法律风险**：如果被投诉，可能面临巨额罚款

### 哈希的做法：
```
用户访问 → IP: "192.168.1.100"
         → 哈希加密: "a3f8b2c1..." （像指纹，不可逆）
         → 存到数据库
```

**好处**：
- ✅ **保护隐私**：即使数据库泄露，也无法还原出真实 IP
- ✅ **仍能监控**：同一个 IP 的哈希值总是一样的，可以检测"重复访问"
- ✅ **符合法规**：GDPR 允许存储"假名化"（pseudonymized）数据

---

## 💻 后端代码实现

### 1️⃣ Node.js / TypeScript 示例

```typescript
import crypto from 'crypto';

/**
 * 将 IP 地址转换为 SHA256 哈希值
 * @param ip - 原始 IP 地址（如 "192.168.1.100"）
 * @returns 哈希值（如 "a3f8b2c1e4d5..."）
 */
function hashIP(ip: string): string {
  // 添加一个"盐"（salt），让哈希更安全
  // 盐可以是你的应用密钥，存在环境变量里
  const salt = process.env.IP_HASH_SALT || 'firego-default-salt-2024';

  return crypto
    .createHash('sha256')
    .update(ip + salt)  // IP + 盐 一起哈希
    .digest('hex');     // 输出 16 进制字符串
}

// 使用示例：
const userIP = '192.168.1.100';
const hashedIP = hashIP(userIP);
console.log(hashedIP);
// 输出: "a3f8b2c1e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
```

---

### 2️⃣ 在 API 中使用（创建 Onboarding 会话时）

```typescript
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * 从请求中获取真实 IP（支持反向代理）
 */
function getClientIP(req: Request): string {
  // 如果用了 Cloudflare/Nginx 等反向代理，真实 IP 在这些 header 里
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  const cfIP = req.headers.get('cf-connecting-ip'); // Cloudflare

  return cfIP || realIP || forwarded?.split(',')[0] || 'unknown';
}

/**
 * 哈希 IP 地址
 */
function hashIP(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'firego-default-salt-2024';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

// API: 开始 Onboarding
export async function startOnboarding(req: Request): Promise<Response> {
  const { visitorId, taskName, taskDescription } = await req.json();

  // 1. 获取用户 IP
  const clientIP = getClientIP(req);

  // 2. 哈希 IP
  const ipHash = hashIP(clientIP);

  // 3. 创建 Onboarding 会话
  const { data: session, error } = await supabase
    .from('onboarding_session')
    .insert({
      visitor_id: visitorId,
      session_id: `onboarding-${Date.now()}`,
      status: 'started',
      task_description: taskDescription,
      ip_address: clientIP,        // ⚠️ 可选：存原始 IP（7天后自动删除）
      ip_address_hash: ipHash,      // ✅ 必需：存哈希值（永久保留）
      user_agent: req.headers.get('user-agent'),
    })
    .select()
    .single();

  if (error) throw error;

  return Response.json({
    sessionId: session.session_id,
    onboardingSessionId: session.id,
  });
}
```

---

### 3️⃣ 监控滥用行为

#### **查询 1：找出 24 小时内同一 IP 体验超过 5 次的**

```typescript
async function detectAbuse24h(): Promise<void> {
  const { data, error } = await supabase.rpc('detect_ip_abuse_24h');

  if (data && data.length > 0) {
    console.log('🚨 检测到可疑 IP：', data);
    // 可以发邮件通知、自动拉黑等
  }
}
```

对应的 SQL 函数（运行一次创建）：

```sql
-- 创建检测滥用的函数
CREATE OR REPLACE FUNCTION detect_ip_abuse_24h()
RETURNS TABLE (
  ip_hash TEXT,
  attempt_count BIGINT,
  latest_attempt TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ip_address_hash,
    COUNT(*) as attempt_count,
    MAX(created_at) as latest_attempt
  FROM onboarding_session
  WHERE
    created_at > NOW() - INTERVAL '24 hours'
    AND ip_address_hash IS NOT NULL
  GROUP BY ip_address_hash
  HAVING COUNT(*) > 5
  ORDER BY attempt_count DESC;
END;
$$ LANGUAGE plpgsql;
```

---

#### **查询 2：找出总共体验超过 10 次的 IP**

```sql
-- 直接用 SQL 查询
SELECT
  ip_address_hash,
  COUNT(*) as total_attempts,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  COUNT(DISTINCT visitor_id) as unique_visitors
FROM onboarding_session
WHERE ip_address_hash IS NOT NULL
GROUP BY ip_address_hash
HAVING COUNT(*) > 10
ORDER BY total_attempts DESC;
```

---

#### **查询 3：检查某个 IP 哈希的历史记录**

```typescript
async function checkIPHistory(ipHash: string) {
  const { data, error } = await supabase
    .from('onboarding_session')
    .select('created_at, status, visitor_id, user_id')
    .eq('ip_address_hash', ipHash)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`IP ${ipHash.substring(0, 8)}... 的历史记录:`, data);
}
```

---

## 🔒 安全最佳实践

### 1️⃣ 盐（Salt）要保密

```bash
# .env 文件（不要提交到 Git！）
IP_HASH_SALT=your-random-secret-key-change-this-in-production
```

**生成随机盐的方法**：
```bash
# 在终端运行
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 2️⃣ 原始 IP 定期删除（可选）

如果你同时存了 `ip_address` 和 `ip_address_hash`，建议定期清除原始 IP：

```sql
-- 创建定时任务：每天删除 7 天前的原始 IP
-- （保留哈希值用于长期监控）
CREATE OR REPLACE FUNCTION cleanup_old_ip_addresses()
RETURNS void AS $$
BEGIN
  UPDATE onboarding_session
  SET ip_address = NULL
  WHERE
    ip_address IS NOT NULL
    AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 使用 pg_cron 扩展自动执行（需要 Supabase Pro 以上）
-- SELECT cron.schedule('cleanup-ips', '0 2 * * *', 'SELECT cleanup_old_ip_addresses();');
```

---

### 3️⃣ 拉黑恶意 IP 哈希

```sql
-- 创建黑名单表
CREATE TABLE IF NOT EXISTS ip_hash_blacklist (
  ip_hash TEXT PRIMARY KEY,
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加到黑名单
INSERT INTO ip_hash_blacklist (ip_hash, reason)
VALUES ('a3f8b2c1...', '24小时内尝试体验50次');

-- 在 API 中检查黑名单
SELECT EXISTS (
  SELECT 1 FROM ip_hash_blacklist
  WHERE ip_hash = 'a3f8b2c1...'
) as is_blocked;
```

---

## 📊 监控仪表板查询

### 每日 IP 去重的体验次数

```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_sessions,
  COUNT(DISTINCT ip_address_hash) as unique_ips,
  ROUND(COUNT(*)::numeric / COUNT(DISTINCT ip_address_hash), 2) as avg_sessions_per_ip
FROM onboarding_session
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 转化率（按 IP 去重）

```sql
SELECT
  COUNT(DISTINCT ip_address_hash) as total_unique_ips,
  COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN ip_address_hash END) as converted_ips,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN ip_address_hash END) /
    COUNT(DISTINCT ip_address_hash),
    2
  ) as conversion_rate_pct
FROM onboarding_session
WHERE status = 'task_completed';
```

---

## ⚠️ 注意事项

### 1. 哈希不可逆
一旦哈希后，**无法还原出原始 IP**。
如果以后需要"解封某个 IP"，只能：
- 让用户提供他的 IP
- 你手动哈希这个 IP
- 从黑名单中删除对应的哈希值

### 2. 盐变更后所有哈希失效
如果你改了 `IP_HASH_SALT`，之前的哈希值就对不上了。
**建议**：一旦上线，就不要改盐。

### 3. 合规性
- 存 IP 哈希符合 GDPR 的"假名化"要求 ✅
- 但仍需在隐私政策中说明"我们收集 IP 用于防止滥用" ✅

---

## 🎯 快速开始检查清单

- [ ] 在 `.env` 文件中添加 `IP_HASH_SALT`（随机生成）
- [ ] 在 `/api/onboarding/start` 中添加 `hashIP()` 调用
- [ ] 测试：创建一个体验会话，检查数据库中 `ip_address_hash` 是否有值
- [ ] 运行监控查询，看是否能检测到重复 IP
- [ ] （可选）创建 `ip_hash_blacklist` 表
- [ ] （可选）设置定时任务自动删除旧的原始 IP

---

## 🆘 常见问题

**Q1: 为什么不直接删除 `ip_address` 字段，只保留哈希？**
A: 短期内保留原始 IP 可以帮助调试（比如用户投诉"我明明没体验过，为什么不让我试"，你可以查原始 IP 确认）。7 天后自动删除即可。

**Q2: 如果用户用 VPN 怎么办？**
A: IP 哈希无法防止 VPN 用户。需要配合 `device_fingerprint` 一起使用。

**Q3: Supabase 会自动记录 IP 吗？**
A: 不会。你需要在 API 中手动从 `req.headers` 获取 IP。

---

完成！现在你的系统既能监控滥用行为，又能保护用户隐私 🎉
