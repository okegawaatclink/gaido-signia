/**
 * @file reader/[bookId]/page.tsx
 * @description 電子書籍ビューアー画面（F4 - ファン向け）
 *
 * 本棚から書籍を選択してビューアーで閲覧する画面。
 * 書籍のformat（pdf/epub）に応じてPdfViewerまたはEpubViewerを切り替え表示する。
 *
 * 機能:
 * - バックエンドAPIから署名付きURL（15分有効）を取得してビューアーに渡す
 * - PDFはPdfViewerコンポーネント、EPUBはEpubViewerコンポーネントで表示
 * - ヘッダーに戻るボタンと書籍タイトルを表示
 * - 署名付きURL期限切れ時（14分経過後）に自動で再取得
 * - DRM保護: 印刷制限のためbodyにdrmクラスを追加
 *
 * レンダリング方式: CSR（Client Side Rendering）
 * - 認証状態確認のためClient Component必須
 * - PdfViewer / EpubViewerはepub.js / pdf.jsを使用するためSSR非対応
 *
 * DRMセキュリティ:
 * - 署名付きURLは15分有効でバックエンドが発行
 * - ビューアーコンポーネント側でダウンロード・右クリック・印刷を制限
 * - 「body.drm-active」クラスで印刷時に全体が非表示になるCSS適用
 *
 * 参考: ai_generated/requirements/screens.md（F4: 電子書籍ビューアー）
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { saveOAuthToken, apiGetBookReadUrl, apiGetBookshelf, ApiError } from '../../../../lib/api';

// PdfViewer / EpubViewerは動的インポート（SSR非対応のため）
// loading中はnullを返す（ビューアー外のローディング表示で対応）
const PdfViewer = dynamic(
  () => import('../../../../components/reader/PdfViewer').then((m) => m.PdfViewer),
  { ssr: false }
);

const EpubViewer = dynamic(
  () => import('../../../../components/reader/EpubViewer').then((m) => m.EpubViewer),
  { ssr: false }
);

/**
 * 書籍情報の型定義（本棚APIから取得）
 */
interface BookInfo {
  id: string;
  title: string;
  format: 'pdf' | 'epub';
}

/**
 * 署名付きURLのキャッシュ型定義
 * URLと取得時刻を保持して期限切れ判定に使用する
 */
interface UrlCache {
  url: string;
  fetchedAt: number; // Unix timestamp（ミリ秒）
}

/**
 * 電子書籍ビューアー画面コンポーネント（Client Component）
 *
 * URLパラメータから書籍IDを取得し、バックエンドから署名付きURLを取得して
 * 書籍形式に応じたビューアーコンポーネントに渡す。
 *
 * @returns {JSX.Element} ビューアー画面UI
 */
export default function ReaderPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.bookId as string;

  /** NextAuth.jsのセッション情報 */
  const { data: session, status } = useSession();

  /** 表示中の書籍情報 */
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  /** 署名付きURL（ビューアーに渡す） */
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  /** 署名付きURLキャッシュ（期限切れ判定用） */
  const urlCacheRef = useRef<UrlCache | null>(null);
  /** URL自動更新タイマーのID */
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [error, setError] = useState<string | null>(null);

  /**
   * 署名付きURLを取得する
   *
   * バックエンドAPIに書籍IDを渡して15分有効の署名付きURLを取得する。
   * 取得したURLはキャッシュに保存し、14分後に自動で再取得をスケジュールする。
   *
   * @returns 署名付きURL文字列、またはnull（エラー時）
   */
  const fetchSignedUrl = useCallback(async (): Promise<string | null> => {
    try {
      const result = await apiGetBookReadUrl(bookId);
      const url = result.url;

      // キャッシュに保存
      urlCacheRef.current = {
        url,
        fetchedAt: Date.now(),
      };

      setSignedUrl(url);

      // 14分後に自動で再取得（15分の有効期限の前に更新）
      // タイマーをクリアして重複を防ぐ
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        // バックグラウンドで更新（ユーザーの閲覧を中断しない）
        fetchSignedUrl().catch(console.error);
      }, 14 * 60 * 1000); // 14分

      return url;
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.statusCode === 403) {
        setError('この書籍へのアクセス権限がありません。本棚に戻ってください。');
      } else if (apiErr.statusCode === 401) {
        router.push('/login');
      } else if (apiErr.statusCode === 404) {
        setError('書籍が見つかりません。');
      } else {
        setError('書籍の読み込みに失敗しました。');
      }
      return null;
    }
  }, [bookId, router]);

  /**
   * 書籍情報を取得する
   *
   * 本棚APIから書籍一覧を取得して、bookIdに一致する書籍のformat情報を取得する。
   * format（pdf/epub）に応じてビューアーを切り替えるために必要。
   */
  const fetchBookInfo = useCallback(async () => {
    try {
      const result = await apiGetBookshelf();
      const item = result.items.find((i) => i.book.id === bookId);

      if (!item) {
        setError('この書籍へのアクセス権限がありません。');
        return;
      }

      setBookInfo({
        id: item.book.id,
        title: item.book.title,
        format: item.book.format,
      });
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.statusCode === 401) {
        router.push('/login');
      } else {
        setError('書籍情報の取得に失敗しました。');
      }
    }
  }, [bookId, router]);

  /**
   * セッション確認と初期データ取得
   *
   * 未認証の場合はログインページにリダイレクト。
   * 認証済みの場合は書籍情報と署名付きURLを並列取得する。
   */
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status === 'authenticated' && session?.backendToken) {
      // バックエンドJWTをローカルストレージに保存
      saveOAuthToken(session.backendToken);

      // 書籍情報と署名付きURLを並列取得
      Promise.all([fetchBookInfo(), fetchSignedUrl()])
        .finally(() => setIsLoading(false));
    }
  }, [session, status, router, fetchBookInfo, fetchSignedUrl]);

  /**
   * DRM保護: ページ表示中はbodyに drm-active クラスを付与する
   *
   * globals.cssの `@media print { body.drm-active::after }` で
   * 印刷時に「この書籍の印刷は許可されていません」メッセージが表示される。
   */
  useEffect(() => {
    document.body.classList.add('drm-active');
    return () => {
      document.body.classList.remove('drm-active');
    };
  }, []);

  /**
   * コンポーネントのアンマウント時にタイマーをクリアする
   */
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  /**
   * 本棚に戻るハンドラー
   */
  const handleBack = useCallback(() => {
    router.push('/bookshelf');
  }, [router]);

  // ===== レンダリング =====

  // セッション確認中またはデータ取得中はローディング表示
  if (status === 'loading' || isLoading) {
    return (
      <div style={styles.loadingPage}>
        <p style={styles.loadingText}>読み込み中...</p>
      </div>
    );
  }

  // 未認証は何も表示しない（useEffectでリダイレクト済み）
  if (status === 'unauthenticated') {
    return null;
  }

  // エラー表示
  if (error) {
    return (
      <div style={styles.errorPage}>
        <div style={styles.errorContent}>
          <p style={styles.errorText}>{error}</p>
          <button
            type="button"
            onClick={handleBack}
            style={styles.backButton}
          >
            本棚に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    // DRM保護: drm-viewer クラスで印刷時に非表示
    <div className="drm-viewer" style={styles.pageWrapper}>
      {/* ===== ヘッダー ===== */}
      <header style={styles.header}>
        {/* 戻るボタン */}
        <button
          type="button"
          onClick={handleBack}
          style={styles.backButton}
          aria-label="本棚に戻る"
        >
          &#8592; 本棚に戻る
        </button>

        {/* 書籍タイトル */}
        <h1 style={styles.bookTitle}>
          {bookInfo?.title || '読み込み中...'}
        </h1>

        {/* 形式バッジ */}
        {bookInfo?.format && (
          <span style={{
            ...styles.formatBadge,
            backgroundColor: bookInfo.format === 'pdf' ? '#e53e3e' : '#3182ce',
          }}>
            {bookInfo.format.toUpperCase()}
          </span>
        )}
      </header>

      {/* ===== ビューアー ===== */}
      <main style={styles.viewerContainer}>
        {signedUrl && bookInfo ? (
          bookInfo.format === 'pdf' ? (
            <PdfViewer
              url={signedUrl}
              title={bookInfo.title}
            />
          ) : (
            <EpubViewer
              url={signedUrl}
              title={bookInfo.title}
            />
          )
        ) : (
          <div style={styles.loadingViewer}>
            <p style={styles.loadingText}>ビューアーを起動中...</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  // ===== ローディング・エラーページ =====
  loadingPage: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
  },
  errorPage: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f9fafb',
  },
  errorContent: {
    textAlign: 'center',
    padding: '2rem',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '1rem',
    marginBottom: '1.5rem',
  },
  loadingText: {
    color: '#cccccc',
    fontSize: '1rem',
  },

  // ===== メインレイアウト =====
  pageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },

  // ===== ヘッダー =====
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1.25rem',
    backgroundColor: '#111111',
    color: '#ffffff',
    borderBottom: '1px solid #333333',
    flexShrink: 0,
    minHeight: '52px',
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#aaaaaa',
    border: '1px solid #555555',
    borderRadius: '6px',
    padding: '0.4rem 0.8rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  bookTitle: {
    fontSize: 'clamp(0.875rem, 2vw, 1.125rem)',
    fontWeight: '600',
    color: '#ffffff',
    margin: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  formatBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 0,
  },

  // ===== ビューアーエリア =====
  viewerContainer: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  loadingViewer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    backgroundColor: '#525659',
  },
};
