/**
 * @file bookshelf/page.tsx
 * @description 本棚画面（ファン向け）
 *
 * ファンがログイン後にリダイレクトされる本棚画面。
 * サイン入り電子書籍のリストを表示する。
 *
 * このページはPBI #8（ソーシャルログイン）のリダイレクト先として実装。
 * 本棚の詳細機能（書籍リスト表示・閲覧機能）は後続のPBIで実装する。
 *
 * 機能:
 * - ログインセッションの確認（NextAuth.js）
 * - バックエンドJWTトークンの同期（ローカルストレージへの保存）
 * - ログアウトボタン
 * - 書籍一覧のプレースホルダー
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { saveOAuthToken } from '../../lib/api';

/**
 * 本棚画面コンポーネント
 *
 * セッション状態を確認し、未ログインの場合はログインページにリダイレクトする。
 * ログイン済みの場合はバックエンドJWTトークンをローカルストレージに同期する。
 *
 * @returns {JSX.Element} 本棚画面UI
 */
export default function BookshelfPage() {
  const router = useRouter();
  /** NextAuth.jsのセッション情報 */
  const { data: session, status } = useSession();
  /** ログアウト処理中フラグ */
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  /**
   * セッション状態の確認とバックエンドトークンの同期
   * セッションがない場合はログインページにリダイレクト
   * セッションがある場合はバックエンドJWTをローカルストレージに保存
   */
  useEffect(() => {
    if (status === 'unauthenticated') {
      // 未認証の場合はログインページにリダイレクト
      router.push('/login');
      return;
    }

    if (status === 'authenticated' && session?.backendToken) {
      // バックエンドJWTトークンをローカルストレージに保存
      // これによりバックエンドAPIへのリクエスト時にトークンを使用できる
      saveOAuthToken(session.backendToken);
    }
  }, [session, status, router]);

  /**
   * ログアウト処理
   * NextAuth.jsのセッションを終了し、ログインページにリダイレクト
   */
  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    try {
      // NextAuth.jsのsignOutでセッションを終了
      await signOut({
        callbackUrl: '/login',
        redirect: true,
      });
    } catch {
      setIsLoggingOut(false);
    }
  }

  // セッション確認中はローディング表示
  if (status === 'loading') {
    return (
      <div style={styles.loadingContainer}>
        <p style={styles.loadingText}>読み込み中...</p>
      </div>
    );
  }

  // 未認証の場合は何も表示しない（useEffectでリダイレクト済み）
  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>Signia</h1>
          <div style={styles.headerRight}>
            {/* ユーザー名表示 */}
            {session?.user?.name && (
              <span style={styles.userName}>
                {session.user.name} さん
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
            >
              {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main style={styles.main}>
        <h2 style={styles.pageTitle}>あなたの本棚</h2>

        {/* 書籍一覧プレースホルダー（後続PBIで実装） */}
        <div style={styles.emptyState}>
          <p style={styles.emptyStateIcon}>📚</p>
          <p style={styles.emptyStateText}>まだ書籍がありません</p>
          <p style={styles.emptyStateSubtext}>
            著者からサイン入り電子書籍が届くとここに表示されます
          </p>
        </div>
      </main>
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: '1rem',
  },
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '0 1.5rem',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#0070f3',
    margin: '0',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userName: {
    color: '#374151',
    fontSize: '0.9rem',
  },
  logoutButton: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '0.375rem 0.875rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'color 0.15s ease, border-color 0.15s ease',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  pageTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#111827',
    margin: '0 0 2rem 0',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
  },
  emptyStateIcon: {
    fontSize: '3rem',
    margin: '0 0 1rem 0',
  },
  emptyStateText: {
    fontSize: '1.125rem',
    fontWeight: '500',
    color: '#374151',
    margin: '0 0 0.5rem 0',
  },
  emptyStateSubtext: {
    fontSize: '0.875rem',
    color: '#9ca3af',
    margin: '0',
  },
};
