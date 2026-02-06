/**
 * auth/logout.ts - 登出逻辑
 *
 * 将设备清理、Supabase signOut、localStorage 清理从 AuthContext 中拆分出来。
 * 不包含 React 状态更新和 Native/Analytics 通知——调用方自行处理。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { clearAuthStorage } from './storage';

/**
 * 执行登出操作：清理设备记录、Supabase signOut、localStorage 清理。
 *
 * @param client - Supabase 客户端（可能为 null）
 */
export async function performLogout(client: SupabaseClient | null): Promise<void> {
  const currentToken = localStorage.getItem('session_token');

  if (client) {
    if (currentToken) {
      const makeCleanupRequest = (action: string, label: string) =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-devices`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action }),
        }).then(res => {
          if (res.ok) console.log(`✅ ${label} 设备记录已清理`);
          else console.warn(`⚠️ 清理 ${label} 设备记录失败（已忽略）`);
        }).catch(err => {
          console.warn(`⚠️ 清理 ${label} 设备记录时出错（已忽略）:`, err);
        });

      await Promise.allSettled([
        makeCleanupRequest('remove_voip_device', 'VoIP'),
        makeCleanupRequest('remove_fcm_device', 'FCM'),
      ]);
    }

    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('⚠️ Supabase signOut 失败（已忽略），将强制清理本地状态:', error);
    }
  }

  localStorage.removeItem('voip_token');
  clearAuthStorage();

  // 清理 Supabase SDK 残留的 localStorage keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('sb-') || key.startsWith('supabase'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️ 已清理 Supabase 存储: ${key}`);
  });

  if (import.meta.env.DEV) console.log('🔓 已登出');
}
