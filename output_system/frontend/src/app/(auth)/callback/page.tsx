/**
 * @file (auth)/callback/page.tsx
 * @description OAuthコールバック処理ページ
 *
 * NextAuth.jsのOAuth認証フロー中に表示される中間ページ。
 * OAuthプロバイダーからのコールバック処理中にローディング状態を表示する。
 *
 * 処理フロー:
 * 1. OAuthプロバイダーが認証後に /api/auth/callback/:provider にリダイレクト
 * 2. NextAuth.jsがコールバックを処理してセッションを作成
 * 3. セッション作成後、signInに指定したcallbackUrl（/bookshelf）にリダイレクト
 *
 * Next.js App Routerでは useSearchParams() を使用するコンポーネントを
 * Suspenseでラップする必要がある（プリレンダリング対応）
 *
 * 参考: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
 */

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

/**
 * コールバック処理の内部コンポーネント
 * useSearchParams()を使用するためSuspenseでラップする必要がある
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  useEffect(() => {
    // エラーがある場合はログインページにリダイレクト
    const error = searchParams.get('error');
    if (error) {
      router.push(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    // セッションが確立されたらロールに応じてリダイレクト
    if (status === 'authenticated' && session) {
      const role = session.role;
      if (role === 'fan') {
        router.push('/bookshelf');
      } else if (role === 'admin') {
        router.push('/admin/dashboard');
      } else if (role === 'author') {
        router.push('/author/books');
      } else {
        // ロールが不明な場合はデフォルトで本棚へ
        router.push('/bookshelf');
      }
    }

    // 未認証の場合はログインページにリダイレクト
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [session, status, router, searchParams]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={styles.message}>認証処理中...</p>
        <p style={styles.subMessage}>しばらくお待ちください</p>
      </div>
    </div>
  );
}

/**
 * OAuthコールバック処理ページ（エクスポート）
 *
 * useSearchParams()を使用するCallbackContentをSuspenseでラップする。
 * Next.js App Routerでのプリレンダリングエラーを防ぐために必要。
 *
 * @returns {JSX.Element} ローディング表示UI
 */
export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={styles.message}>読み込み中...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    padding: '3rem 2.5rem',
    textAlign: 'center',
    minWidth: '280px',
  },
  message: {
    fontSize: '1.125rem',
    fontWeight: '500',
    color: '#374151',
    margin: '0 0 0.5rem 0',
  },
  subMessage: {
    fontSize: '0.875rem',
    color: '#9ca3af',
    margin: '0',
  },
};
