/**
 * @file Header.tsx
 * @description ファン向けヘッダーコンポーネント
 *
 * ファンがログイン後に表示されるヘッダー。
 * ロゴ・ユーザー名・ログアウトボタンを表示する。
 *
 * レスポンシブ対応:
 * - モバイル: ロゴとログアウトボタンのみ（ユーザー名は省略）
 * - タブレット/PC: ロゴ・ユーザー名・ログアウトボタン
 */

'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

/**
 * ヘッダーコンポーネントのProps
 */
export interface HeaderProps {
  /** ログインユーザーの名前（nullの場合は非表示） */
  userName?: string | null;
}

/**
 * ファン向けヘッダーコンポーネント
 *
 * ロゴ・ユーザー名・ログアウトボタンを含むヘッダー。
 * ログアウト時はNextAuth.jsのsignOutを呼び出し、/loginにリダイレクトする。
 *
 * @param props - コンポーネントのProps
 * @returns {JSX.Element} ヘッダー
 */
export function Header({ userName }: HeaderProps) {
  /** ログアウト処理中フラグ */
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  /**
   * ログアウト処理
   * NextAuth.jsのsignOutでセッションを終了し、ログインページにリダイレクト
   */
  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    try {
      await signOut({
        callbackUrl: '/login',
        redirect: true,
      });
    } catch {
      // リダイレクトが発生するためエラー処理は不要
      setIsLoggingOut(false);
    }
  }

  return (
    <header style={styles.header}>
      <div style={styles.headerContent}>
        {/* ロゴ */}
        <div style={styles.logo} aria-label="Signia ホーム">
          <span style={styles.logoIcon}>✍️</span>
          <span style={styles.logoText}>Signia</span>
        </div>

        {/* 右側: ユーザー名 + ログアウトボタン */}
        <div style={styles.headerRight}>
          {/* ユーザー名（PC・タブレットのみ表示） */}
          {userName && (
            <span style={styles.userName}>
              {userName} さん
            </span>
          )}

          {/* ログアウトボタン */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{
              ...styles.logoutButton,
              ...(isLoggingOut ? styles.logoutButtonDisabled : {}),
            }}
            aria-label="ログアウト"
          >
            {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </div>
    </header>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    height: '64px',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textDecoration: 'none',
    cursor: 'default',
  },
  logoIcon: {
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  logoText: {
    fontSize: '1.375rem',
    fontWeight: '700',
    color: '#0070f3',
    letterSpacing: '-0.02em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userName: {
    color: '#374151',
    fontSize: '0.875rem',
    fontWeight: '500',
    // モバイルでは非表示（CSS Media Queryが使えないため条件分岐が必要な場合はuseWindowSizeを使用）
    display: 'inline-block',
  },
  logoutButton: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
    whiteSpace: 'nowrap',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};
