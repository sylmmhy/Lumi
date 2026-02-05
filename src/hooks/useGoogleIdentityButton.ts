/**
 * useGoogleIdentityButton Hook
 *
 * 封装 Google Identity Services（GIS）按钮初始化逻辑，避免在多个组件里重复写：
 * - loadGoogleScript()
 * - window.google.accounts.id.initialize()
 * - window.google.accounts.id.renderButton()
 *
 * 组件侧只需要关心：拿到 credential 之后要怎么登录/跳转。
 */

import { useEffect, type RefObject } from 'react';
import { loadGoogleScript } from '../lib/google-script';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export interface GoogleCredentialResponse {
  credential: string;
  clientId?: string;
  select_by?: string;
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

export interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string;
}

export type GoogleButtonWidth = string | ((container: HTMLElement) => string);

export interface GoogleIdentityButtonOptions extends Omit<GsiButtonConfiguration, 'width'> {
  /**
   * GIS 的 width 只接受像素字符串。
   * 传入函数时，会在 renderButton 前用当前容器宽度计算一次。
   */
  width?: GoogleButtonWidth;
}

export interface UseGoogleIdentityButtonParams {
  /** 是否启用（通常为 isOpen && canShowGoogleLogin） */
  enabled: boolean;
  /** Google 按钮的容器 */
  buttonRef: RefObject<HTMLElement | null>;
  /** GIS 回调（拿到 credential 后的业务逻辑） */
  onCredential: (response: GoogleCredentialResponse) => void | Promise<void>;
  /** 可选：覆盖默认的 VITE_GOOGLE_CLIENT_ID */
  clientId?: string;
  /** initialize.auto_select（默认 false） */
  autoSelect?: boolean;
  /** initialize.cancel_on_tap_outside（默认 true） */
  cancelOnTapOutside?: boolean;
  /** renderButton 的配置 */
  buttonOptions: GoogleIdentityButtonOptions;
  /** 初始化失败时的回调（例如设置 UI 错误提示） */
  onInitError?: (error: unknown) => void;
}

/**
 * 初始化并渲染 Google Identity Services 按钮
 *
 * @param params - Hook 参数
 */
export function useGoogleIdentityButton(params: UseGoogleIdentityButtonParams): void {
  const {
    enabled,
    buttonRef,
    onCredential,
    clientId,
    autoSelect,
    cancelOnTapOutside,
    buttonOptions,
    onInitError,
  } = params;

  useEffect(() => {
    if (!enabled) return;

    const resolvedClientId = clientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!resolvedClientId) return;

    let cancelled = false;

    const setup = async () => {
      try {
        await loadGoogleScript();
        if (cancelled) return;

        const googleId = window.google?.accounts?.id;
        if (!googleId) return;

        googleId.initialize({
          client_id: resolvedClientId,
          callback: (response: GoogleCredentialResponse) => {
            if (cancelled) return;
            void onCredential(response);
          },
          auto_select: autoSelect ?? false,
          cancel_on_tap_outside: cancelOnTapOutside ?? true,
        });

        const container = buttonRef.current;
        if (!container) return;

        container.textContent = '';

        const { width, ...restButtonOptions } = buttonOptions;
        const widthValue =
          typeof width === 'function'
            ? width(container)
            : width;

        const renderOptions: GsiButtonConfiguration = {
          ...restButtonOptions,
          ...(widthValue ? { width: widthValue } : {}),
        };

        googleId.renderButton(container, renderOptions);
      } catch (error) {
        if (cancelled) return;
        onInitError?.(error);
      }
    };

    void setup();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    buttonRef,
    onCredential,
    clientId,
    autoSelect,
    cancelOnTapOutside,
    buttonOptions,
    onInitError,
  ]);
}
