/**
 * @file bookshelf/page.tsx
 * @description 本棚画面（F3 - ファン向け）
 *
 * ファンがログイン後にリダイレクトされる本棚画面。
 * バックエンドAPIからサイン入り書籍一覧を取得し表示する。
 *
 * レンダリング方式: CSR（Client Side Rendering）
 * - 認証状態確認のためClient Component必須
 * - バックエンドAPIをブラウザからfetchして書籍一覧を取得
 *
 * 機能:
 * - ログインセッションの確認（NextAuth.js）
 * - バックエンドJWTトークンの同期（ローカルストレージへの保存）
 * - バックエンドから書籍一覧を取得・表示
 * - 書籍がない場合の空状態メッセージ
 * - 書籍クリックで閲覧URL取得・新タブ表示
 * - ヘッダー（ロゴ・ユーザー名・ログアウト）
 * - レスポンシブグリッドレイアウト
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '../../components/layout/Header';
import { Footer } from '../../components/layout/Footer';
import { FanBookCard } from '../../components/book/FanBookCard';
import {
  saveOAuthToken,
  apiGetBookshelf,
  BookshelfItem,
  ApiError,
} from '../../lib/api';

/**
 * 本棚画面コンポーネント（Client Component）
 *
 * 認証状態を確認し、バックエンドAPIから書籍一覧を取得して表示する。
 * 未認証の場合はログインページにリダイレクト。
 *
 * @returns {JSX.Element} 本棚画面UI
 */
export default function BookshelfPage() {
  const router = useRouter();
  /** NextAuth.jsのセッション情報 */
  const { data: session, status } = useSession();

  /** 書籍一覧データ */
  const [items, setItems] = useState<BookshelfItem[]>([]);
  /** データ取得中フラグ */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [error, setError] = useState<string | null>(null);
  /** 閲覧URL取得中の書籍ID */
  const [readingBookId, setReadingBookId] = useState<string | null>(null);

  /**
   * バックエンドAPIから書籍一覧を取得する
   *
   * 認証済みの場合のみ呼び出す。
   * エラーが発生した場合はエラーメッセージを設定する。
   */
  const fetchBookshelf = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiGetBookshelf();
      setItems(result.items);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.statusCode === 401) {
        // トークン切れの場合はログインページにリダイレクト
        router.push('/login');
        return;
      }
      setError(apiErr.message || '書籍一覧の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  /**
   * セッション状態の確認とバックエンドトークンの同期
   *
   * 未認証の場合はログインページにリダイレクト。
   * 認証済みの場合はバックエンドJWTをローカルストレージに保存し、
   * 書籍一覧を取得する。
   */
  useEffect(() => {
    if (status === 'unauthenticated') {
      // 未認証の場合はログインページにリダイレクト
      router.push('/login');
      return;
    }

    if (status === 'authenticated' && session?.backendToken) {
      // バックエンドJWTトークンをローカルストレージに保存
      saveOAuthToken(session.backendToken);
      // 書籍一覧を取得
      fetchBookshelf();
    }
  }, [session, status, router, fetchBookshelf]);

  /**
   * 書籍閲覧ハンドラー
   *
   * 電子書籍ビューアーページに遷移する。
   * ビューアーページ側で署名付きURLを取得してPDF/EPUBビューアーで表示する。
   *
   * @param bookId - 閲覧する書籍ID
   */
  async function handleReadBook(bookId: string): Promise<void> {
    setReadingBookId(bookId);
    try {
      // ビューアーページに遷移（reader/[bookId]）
      router.push(`/reader/${bookId}`);
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr.message || '書籍の読み込みに失敗しました');
    } finally {
      setReadingBookId(null);
    }
  }

  // --- レンダリング ---

  // セッション確認中またはデータ取得中はローディング表示
  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return (
      <div style={styles.pageWrapper}>
        <Header userName={session?.user?.name} />
        <main style={styles.main}>
          <div style={styles.loadingContainer}>
            <p style={styles.loadingText}>読み込み中...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 未認証の場合は何も表示しない（useEffectでリダイレクト済み）
  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div style={styles.pageWrapper}>
      {/* ===== ヘッダー ===== */}
      <Header userName={session?.user?.name} />

      {/* ===== メインコンテンツ ===== */}
      <main style={styles.main}>
        <div style={styles.mainContent}>
          {/* ページタイトル */}
          <div style={styles.pageHeader}>
            <h1 style={styles.pageTitle}>あなたの本棚</h1>
            {!isLoading && !error && items.length > 0 && (
              <p style={styles.bookCount}>{items.length}冊</p>
            )}
          </div>

          {/* エラー表示 */}
          {error && (
            <div style={styles.errorContainer}>
              <p style={styles.errorText}>{error}</p>
              <button
                type="button"
                onClick={fetchBookshelf}
                style={styles.retryButton}
              >
                再試行
              </button>
            </div>
          )}

          {/* 書籍一覧グリッド */}
          {!error && !isLoading && items.length > 0 && (
            <div style={styles.booksGrid}>
              {items.map((item) => (
                <FanBookCard
                  key={item.access.id}
                  item={item}
                  onRead={handleReadBook}
                  isLoading={readingBookId === item.book.id}
                />
              ))}
            </div>
          )}

          {/* 空状態メッセージ（書籍がない場合） */}
          {!error && !isLoading && items.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon} aria-hidden="true">📚</div>
              <h2 style={styles.emptyStateTitle}>まだ書籍がありません</h2>
              <p style={styles.emptyStateText}>
                著者からサイン入り電子書籍が届くとここに表示されます。
              </p>
              <p style={styles.emptyStateSubtext}>
                お気に入りの著者のサイン会やキャンペーンに参加して、
                あなただけの1冊を手に入れましょう。
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ===== フッター ===== */}
      <Footer />
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9fafb',
  },
  main: {
    flex: 1,
    padding: '2rem 1.5rem',
  },
  mainContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },

  // --- ページヘッダー ---
  pageHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  pageTitle: {
    fontSize: 'clamp(1.375rem, 3vw, 1.875rem)',
    fontWeight: '700',
    color: '#111827',
    margin: 0,
  },
  bookCount: {
    fontSize: '0.9375rem',
    color: '#9ca3af',
    margin: 0,
  },

  // --- ローディング ---
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '6rem 2rem',
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: '1rem',
    margin: 0,
  },

  // --- エラー ---
  errorContainer: {
    backgroundColor: '#fee2e2',
    borderRadius: '12px',
    padding: '2rem',
    textAlign: 'center',
  },
  errorText: {
    color: '#991b1b',
    fontSize: '0.9375rem',
    margin: '0 0 1rem 0',
  },
  retryButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.5rem 1.25rem',
    fontSize: '0.9375rem',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // --- 書籍グリッド ---
  booksGrid: {
    display: 'grid',
    // モバイル: 1列、タブレット: 2列、PC: 3-4列
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1.5rem',
  },

  // --- 空状態 ---
  emptyState: {
    textAlign: 'center',
    padding: '5rem 2rem',
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    border: '2px dashed #e5e7eb',
  },
  emptyStateIcon: {
    fontSize: '4rem',
    lineHeight: 1,
    marginBottom: '1.5rem',
    display: 'block',
  },
  emptyStateTitle: {
    fontSize: '1.375rem',
    fontWeight: '700',
    color: '#374151',
    margin: '0 0 1rem 0',
  },
  emptyStateText: {
    fontSize: '1rem',
    color: '#6b7280',
    margin: '0 0 0.5rem 0',
    lineHeight: 1.6,
  },
  emptyStateSubtext: {
    fontSize: '0.875rem',
    color: '#9ca3af',
    margin: '0 auto',
    lineHeight: 1.6,
    maxWidth: '400px',
  },
};
