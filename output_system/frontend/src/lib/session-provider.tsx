/**
 * @file session-provider.tsx
 * @description NextAuth.js SessionProviderラッパー
 *
 * NextAuth.js v5のSessionProviderはクライアントコンポーネントのみ対応のため、
 * 'use client' ディレクティブを持つラッパーコンポーネントを作成する。
 *
 * App Routerのレイアウト（Server Component）からクライアントコンポーネントの
 * SessionProviderをインポートするために必要なパターン。
 *
 * 参考: https://authjs.dev/getting-started/session-management/get-session#in-app-router
 */

'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * SessionProviderラッパーコンポーネントのProps型定義
 */
interface SessionProviderWrapperProps {
  /** 子コンポーネント */
  children: React.ReactNode;
}

/**
 * NextAuth.js SessionProviderのラッパーコンポーネント
 *
 * App Routerのレイアウト（RootLayout）からインポートして使用する。
 * セッション状態をアプリ全体に提供するコンテキストプロバイダー。
 *
 * @param props - コンポーネントのProps
 * @returns SessionProviderでラップされた子コンポーネント
 */
export function SessionProviderWrapper({ children }: SessionProviderWrapperProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
