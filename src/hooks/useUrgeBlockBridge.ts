/**
 * useUrgeBlockBridge Hook
 *
 * iOS 原生层 Urge Block 功能桥接
 *
 * 功能：
 * - 与 iOS 原生层通信（打开 Shortcuts、打开应用、管理冷却状态）
 * - 检测当前运行环境（iOS WebView / Web）
 * - 管理本地冷却状态缓存
 *
 * @example
 * ```tsx
 * const { isNativeApp, openShortcuts, openApp, checkCooldown } = useUrgeBlockBridge();
 *
 * if (isNativeApp) {
 *   await openShortcuts();
 * }
 * ```
 */

import { useCallback, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

// =====================================================
// 类型定义
// =====================================================

/** 冷却状态 */
export interface CooldownState {
  /** 是否在冷却期内 */
  inCooldown: boolean;
  /** 冷却期结束时间（ISO 字符串） */
  cooldownExpiresAt: string | null;
  /** 剩余秒数 */
  remainingSeconds: number;
}

/** 应用配置 */
export interface BlockedAppConfig {
  /** Bundle ID */
  appId: string;
  /** 应用显示名称 */
  appName: string;
  /** URL Scheme（用于打开应用） */
  urlScheme?: string;
}

/** Urge Block 设置 */
export interface UrgeBlockSettings {
  /** 是否启用 */
  enabled: boolean;
  /** 冷却时间（分钟） */
  cooldownMinutes: number;
  /** 被阻止的应用列表 */
  blockedApps: BlockedAppConfig[];
  /** 冲浪阶段 */
  surfingPhase: 'breathing' | 'ai_call';
}

/** Bridge 返回类型 */
export interface UseUrgeBlockBridgeReturn {
  /** 是否在 iOS 原生 App 内运行 */
  isNativeApp: boolean;
  /** 打开 iOS Shortcuts App */
  openShortcuts: () => void;
  /** 打开指定应用 */
  openApp: (appId: string, urlScheme?: string) => void;
  /** 检查应用冷却状态 */
  checkCooldown: (appId: string) => Promise<CooldownState>;
  /** 设置应用冷却状态 */
  setCooldown: (appId: string, expiresAt: string) => void;
  /**
   * 设置绕过剪贴板（用于 Shortcuts 检测）
   * 将 "LUMI_BYPASS_{appName}" 写入剪贴板，Shortcuts 会检查此内容
   */
  setBypassClipboard: (appName: string) => void;
  /** 获取 Urge Block 设置 */
  getSettings: () => UrgeBlockSettings;
  /** 保存 Urge Block 设置 */
  saveSettings: (settings: UrgeBlockSettings) => Promise<void>;
}

// =====================================================
// 常量
// =====================================================

/** localStorage 键名 */
const COOLDOWN_STORAGE_KEY = 'urge_block_cooldowns';
const SETTINGS_STORAGE_KEY = 'urge_block_settings';

/** 默认设置 */
const DEFAULT_SETTINGS: UrgeBlockSettings = {
  enabled: false,
  cooldownMinutes: 15,
  blockedApps: [],
  surfingPhase: 'breathing',
};

// =====================================================
// 工具函数
// =====================================================

/**
 * 检测是否在 iOS 原生 App 内运行
 */
function detectNativeApp(): boolean {
  // 检查是否有 nativeApp 消息处理器
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.nativeApp) {
    return true;
  }
  return false;
}

/**
 * 从 localStorage 读取冷却状态
 */
function getCooldownsFromStorage(): Record<string, string> {
  try {
    const stored = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * 保存冷却状态到 localStorage
 */
function saveCooldownsToStorage(cooldowns: Record<string, string>): void {
  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
  } catch (error) {
    console.error('保存冷却状态失败:', error);
  }
}

/**
 * 从 localStorage 读取设置
 */
function getSettingsFromStorage(): UrgeBlockSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 保存设置到 localStorage
 */
function saveSettingsToStorage(settings: UrgeBlockSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// =====================================================
// Hook 实现
// =====================================================

/**
 * Urge Block iOS 原生桥接 Hook
 *
 * @returns Bridge 方法和状态
 */
export function useUrgeBlockBridge(): UseUrgeBlockBridgeReturn {
  const [isNativeApp] = useState(() => detectNativeApp());


  /**
   * 打开 iOS Shortcuts App
   * 使用 URL Scheme: shortcuts://
   */
  const openShortcuts = useCallback(() => {
    if (isNativeApp && window.webkit?.messageHandlers?.urgeBlockOpenShortcuts) {
      // 通过原生层打开
      window.webkit.messageHandlers.urgeBlockOpenShortcuts.postMessage({});
    } else {
      // 直接使用 URL Scheme（Safari 也支持）
      window.location.href = 'shortcuts://';
    }
  }, [isNativeApp]);

  /**
   * 打开指定应用
   *
   * @param appId - Bundle ID
   * @param urlScheme - URL Scheme（可选）
   */
  const openApp = useCallback((appId: string, urlScheme?: string) => {
    if (isNativeApp && window.webkit?.messageHandlers?.urgeBlockOpenApp) {
      // 通过原生层打开
      window.webkit.messageHandlers.urgeBlockOpenApp.postMessage({
        appId,
        urlScheme,
      });
    } else if (urlScheme) {
      // 尝试通过 URL Scheme 打开
      window.location.href = urlScheme;
    } else {
      console.warn('无法打开应用: 缺少 URL Scheme');
    }
  }, [isNativeApp]);

  /**
   * 检查应用冷却状态
   *
   * @param appId - Bundle ID
   * @returns 冷却状态
   */
  const checkCooldown = useCallback(async (appId: string): Promise<CooldownState> => {
    // 1. 先检查本地缓存
    const cooldowns = getCooldownsFromStorage();
    const localExpires = cooldowns[appId];

    if (localExpires) {
      const expiresAt = new Date(localExpires);
      const now = new Date();

      if (expiresAt > now) {
        return {
          inCooldown: true,
          cooldownExpiresAt: localExpires,
          remainingSeconds: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
        };
      } else {
        // 已过期，清理本地缓存
        delete cooldowns[appId];
        saveCooldownsToStorage(cooldowns);
      }
    }

    // 2. 查询服务器（作为备份）
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase.rpc('check_app_cooldown', {
            p_user_id: user.id,
            p_app_id: appId,
          });

          if (!error && data && data[0]?.in_cooldown) {
            // 同步到本地缓存
            cooldowns[appId] = data[0].cooldown_expires_at;
            saveCooldownsToStorage(cooldowns);

            return {
              inCooldown: true,
              cooldownExpiresAt: data[0].cooldown_expires_at,
              remainingSeconds: data[0].remaining_seconds,
            };
          }
        }
      }
    } catch (error) {
      console.error('检查冷却状态失败:', error);
    }

    return {
      inCooldown: false,
      cooldownExpiresAt: null,
      remainingSeconds: 0,
    };
  }, []);

  /**
   * 设置应用冷却状态
   *
   * @param appId - Bundle ID
   * @param expiresAt - 过期时间（ISO 字符串）
   */
  const setCooldown = useCallback((appId: string, expiresAt: string) => {
    const cooldowns = getCooldownsFromStorage();
    cooldowns[appId] = expiresAt;
    saveCooldownsToStorage(cooldowns);

    // 通知原生层（如果在原生环境）
    if (isNativeApp && window.webkit?.messageHandlers?.urgeBlockSetCooldown) {
      window.webkit.messageHandlers.urgeBlockSetCooldown.postMessage({
        appId,
        expiresAt,
      });
    }
  }, [isNativeApp]);

  /**
   * 设置绕过剪贴板（用于 Shortcuts 检测）
   *
   * 将 "LUMI_BYPASS_{appName}" 写入剪贴板。
   * Shortcuts 自动化会检查剪贴板内容，如果匹配则允许访问应用一次。
   *
   * @param appName - 应用名称
   */
  const setBypassClipboard = useCallback((appName: string) => {
    const bypassToken = `LUMI_BYPASS_${appName}`;
    console.log(`📋 [useUrgeBlockBridge] 设置绕过剪贴板: ${bypassToken}`);

    // 通过原生层设置剪贴板
    if (isNativeApp && window.webkit?.messageHandlers?.urgeBlockSetBypassClipboard) {
      window.webkit.messageHandlers.urgeBlockSetBypassClipboard.postMessage({
        appName,
      });
    } else {
      // Web 环境下使用 Clipboard API
      navigator.clipboard.writeText(bypassToken).catch((err) => {
        console.error('设置剪贴板失败:', err);
      });
    }
  }, [isNativeApp]);

  /**
   * 获取 Urge Block 设置
   */
  const getSettings = useCallback((): UrgeBlockSettings => {
    return getSettingsFromStorage();
  }, []);

  /**
   * 保存 Urge Block 设置
   *
   * @param settings - 新设置
   */
  const saveSettings = useCallback(async (settings: UrgeBlockSettings): Promise<void> => {
    // 保存到 localStorage
    saveSettingsToStorage(settings);

    // 同步到服务器
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('users')
            .update({ urge_block_settings: settings })
            .eq('id', user.id);
        }
      }
    } catch (error) {
      console.error('同步设置到服务器失败:', error);
    }
  }, []);

  return {
    isNativeApp,
    openShortcuts,
    openApp,
    checkCooldown,
    setCooldown,
    setBypassClipboard,
    getSettings,
    saveSettings,
  };
}

// =====================================================
// 全局类型声明 - 扩展现有 WebKit 消息处理器类型
// =====================================================

// 使用 type assertion 在运行时访问消息处理器，避免覆盖其他地方的类型定义
// 具体类型定义在 src/context/AuthContext.tsx 中的 Window 接口
