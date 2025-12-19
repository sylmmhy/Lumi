# Supabase 头像上传配置指南

## 问题
上传头像时出现错误：
```
Failed to upload avatar. Please make sure you have created an "avatars" bucket in Supabase Storage.
```

## 解决方案

### 步骤 1: 创建 Storage Bucket

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 在左侧菜单点击 **Storage**
4. 点击 **New bucket** 按钮
5. 填写以下信息：
   - **Name**: `avatars`
   - **Public bucket**: ✅ 勾选（允许公开访问头像）
6. 点击 **Create bucket**

### 步骤 2: 配置 Storage 策略

在 Supabase Dashboard → Storage → avatars bucket → Policies，添加以下策略：

#### 策略 1: 允许所有人查看头像

```sql
CREATE POLICY "Public avatars are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

**或在 UI 中创建**:
- Policy name: `Public avatars are viewable by everyone`
- Allowed operation: `SELECT`
- Target roles: `public`
- USING expression: `bucket_id = 'avatars'`

#### 策略 2: 允许认证用户上传头像

```sql
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**解释**: 用户只能上传到以自己 UID 命名的文件夹中（例如：`user-uuid/avatar.png`）

#### 策略 3: 允许用户更新自己的头像

```sql
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING ((storage.foldername(name))[1] = auth.uid()::text);
```

#### 策略 4: 允许用户删除自己的头像

```sql
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ((storage.foldername(name))[1] = auth.uid()::text);
```

### 步骤 3: 在 SQL 编辑器中一次性执行

如果你更喜欢用 SQL，可以在 **SQL Editor** 中一次性执行：

```sql
-- 策略 1: 公开查看
CREATE POLICY "Public avatars are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 策略 2: 认证用户上传
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略 3: 用户更新自己的头像
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING ((storage.foldername(name))[1] = auth.uid()::text);

-- 策略 4: 用户删除自己的头像
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ((storage.foldername(name))[1] = auth.uid()::text);
```

### 步骤 4: 验证配置

1. 刷新你的应用页面
2. 尝试上传头像
3. 应该能成功上传并显示

### 文件夹结构

头像将按以下结构存储：

```
avatars/
├── user-uuid-1/
│   └── avatar.png
├── user-uuid-2/
│   └── avatar.jpg
└── user-uuid-3/
    └── profile-pic.png
```

### 获取头像 URL

上传成功后，可以通过以下方式获取公开 URL：

```typescript
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.png`);

console.log(data.publicUrl);
// https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/avatars/user-id/avatar.png
```

---

## 可选：更宽松的策略（仅用于开发）

如果你想快速测试，可以使用更宽松的策略（⚠️ 不推荐生产环境）：

```sql
-- 允许任何人上传（仅开发）
CREATE POLICY "Allow all uploads for development"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

-- 允许任何人更新（仅开发）
CREATE POLICY "Allow all updates for development"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

-- 允许任何人删除（仅开发）
CREATE POLICY "Allow all deletes for development"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');
```

⚠️ **生产环境请使用上面的严格策略！**

---

## 故障排除

### 问题 1: 策略冲突

**错误**: `duplicate key value violates unique constraint "policies_pkey"`

**解决**:
```sql
-- 先删除旧策略
DROP POLICY IF EXISTS "policy_name" ON storage.objects;

-- 再创建新策略
CREATE POLICY "policy_name" ...
```

### 问题 2: 仍然无法上传

**检查清单**:
1. ✅ bucket 名称是否为 `avatars`
2. ✅ bucket 是否设置为 public
3. ✅ 策略是否正确应用
4. ✅ 用户是否已登录（检查 `auth.uid()`）

### 问题 3: 图片无法显示

**原因**: bucket 不是 public

**解决**:
1. Storage → avatars bucket → Configuration
2. 勾选 **Public bucket**
3. 点击 **Save**

---

完成以上步骤后，头像上传功能应该可以正常工作了！
