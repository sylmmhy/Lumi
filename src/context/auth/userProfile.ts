/**
 * User Profile Module
 *
 * 负责用户资料的读取和更新
 * 从 AuthContext 中拆分出来，保持单一职责
 */

import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 确保 public.users 表存在当前会话用户行，避免 tasks.user_id 外键约束报错。
 *
 * @param supabase - Supabase 客户端实例
 * @param user - Supabase Auth 返回的用户对象
 * @returns 成功确保存在返回 true，失败返回 false
 */
export async function ensureUserProfileExists(
  supabase: SupabaseClient,
  user: User
): Promise<boolean> {
  const { data: existingUser, error: queryError } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (queryError) {
    console.warn('⚠️ 检查 users 表时出错，尝试继续创建', queryError);
  }

  if (existingUser?.id) {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMetadata = (user as any)?.user_metadata;

  const { error: upsertError } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      email: user.email ?? null,
      name: userMetadata?.full_name ?? null,
      picture_url: userMetadata?.avatar_url ?? null,
    }, { onConflict: 'id' });

  if (upsertError) {
    console.error('❌ 创建/同步 users 表记录失败', upsertError);
    return false;
  }

  return true;
}

/**
 * 从 users 表获取用户资料
 *
 * @param supabase - Supabase 客户端实例
 * @param userId - 用户 ID
 * @returns 用户名和头像 URL
 */
export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ name: string | null; pictureUrl: string | null }> {
  try {
    const { data: userProfile } = await supabase
      .from('users')
      .select('name, picture_url')
      .eq('id', userId)
      .single();

    return {
      name: userProfile?.name ?? null,
      pictureUrl: userProfile?.picture_url ?? null,
    };
  } catch (err) {
    console.warn('⚠️ 获取用户资料失败:', err);
    return { name: null, pictureUrl: null };
  }
}

/**
 * 更新用户资料
 *
 * @param supabase - Supabase 客户端实例
 * @param updates - 要更新的字段
 * @returns 更新结果
 */
export async function updateUserProfile(
  supabase: SupabaseClient,
  updates: { name?: string; pictureUrl?: string }
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No user logged in' };

  // 1. Update auth.users metadata
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      ...(updates.name && { full_name: updates.name }),
      ...(updates.pictureUrl && { avatar_url: updates.pictureUrl }),
    }
  });

  if (authError) return { error: authError.message };

  // 2. Update public.users table
  const { error: dbError } = await supabase
    .from('users')
    .update({
      ...(updates.name && { name: updates.name }),
      ...(updates.pictureUrl && { picture_url: updates.pictureUrl }),
    })
    .eq('id', user.id);

  if (dbError) return { error: dbError.message };

  // 3. Update local storage
  if (updates.name) localStorage.setItem('user_name', updates.name);
  if (updates.pictureUrl) localStorage.setItem('user_picture', updates.pictureUrl);

  return { error: null };
}

/**
 * 同步用户资料到 localStorage
 * 用于补全 localStorage 中缺失的用户名或头像
 *
 * @param supabase - Supabase 客户端实例
 * @param userId - 用户 ID
 */
export async function syncUserProfileToStorage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const storedName = localStorage.getItem('user_name');
  const storedPicture = localStorage.getItem('user_picture');

  if (!storedName || !storedPicture) {
    const profile = await fetchUserProfile(supabase, userId);
    if (!storedName && profile.name) {
      localStorage.setItem('user_name', profile.name);
    }
    if (!storedPicture && profile.pictureUrl) {
      localStorage.setItem('user_picture', profile.pictureUrl);
    }
  }
}
