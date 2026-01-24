-- ============================================================================
-- 创建 voice-previews Storage Bucket
-- 用于存储 AI 声音的试听音频文件
-- ============================================================================

-- 创建 voice-previews bucket（公开访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-previews',
  'voice-previews',
  true,  -- 公开访问，无需认证即可播放
  5242880,  -- 5MB 文件大小限制
  ARRAY['audio/wav', 'audio/mpeg', 'audio/mp3']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 允许公开读取
CREATE POLICY "Public can read voice previews"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'voice-previews');

-- 只允许 service role 写入（通过 Edge Function）
CREATE POLICY "Service role can manage voice previews"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'voice-previews')
WITH CHECK (bucket_id = 'voice-previews');
