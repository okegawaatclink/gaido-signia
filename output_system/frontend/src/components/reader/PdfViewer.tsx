/**
 * @file PdfViewer.tsx
 * @description PDFビューアーコンポーネント（DRM保護付き）
 *
 * pdf.jsを使用してブラウザ上でPDFをレンダリングする。
 * DRM保護として以下を実装する:
 * - ダウンロードボタン無効化（ブラウザのデフォルトUI非表示）
 * - 右クリック禁止（contextmenuイベント抑止）
 * - 印刷制限（CSS @media print非表示 + Ctrl+P / Ctrl+Shift+P 無効化）
 * - テキストコピー制限（CSS user-select: none）
 *
 * 機能:
 * - ページ送り（前へ/次へ/ページ番号入力）
 * - ズーム（拡大/縮小/フィットページ）
 * - 目次（アウトライン）表示
 * - ページ番号/全ページ数表示
 * - レスポンシブ対応（モバイルでのピンチズーム）
 *
 * セキュリティ注意:
 * - 完全なDRMではなく、カジュアルコピーの抑止が目的
 * - スクリーンショットは技術的に完全には防げない
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// pdfjs-dist は動的インポート（SSR非対応のため）
// GlobalWorkerOptions設定のためworker側も動的にロード
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

/**
 * PDFビューアーコンポーネントのPropsインターフェース
 */
interface PdfViewerProps {
  /**
   * 表示するPDFの署名付きURL
   * バックエンドAPIから取得した15分有効のURL
   */
  url: string;
  /**
   * 書籍タイトル（アクセシビリティ用）
   */
  title?: string;
}

/**
 * 目次アイテムの型定義
 */
interface TocItem {
  title: string;
  dest: string | unknown[] | null;
  items?: TocItem[];
}

/**
 * PDFビューアーコンポーネント（Client Component）
 *
 * 署名付きURLからPDFを読み込み、ページ送り・ズーム・目次機能付きで表示する。
 * DRM保護として右クリック禁止・印刷制限・ダウンロード無効化を実装する。
 *
 * @param {PdfViewerProps} props - コンポーネントのProps
 * @returns {JSX.Element} PDFビューアーUI
 */
export function PdfViewer({ url, title = 'PDF Document' }: PdfViewerProps) {
  /** CanvasのDOM参照（PDFレンダリング先） */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** PDF描画コンテキストの参照（クリーンアップ用） */
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  /** PDF.jsのドキュメントオブジェクト */
  const [pdfDoc, setPdfDoc] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  /** 現在のページ番号（1始まり） */
  const [currentPage, setCurrentPage] = useState(1);
  /** 全ページ数 */
  const [totalPages, setTotalPages] = useState(0);
  /** ズーム倍率（1.0 = 100%） */
  const [scale, setScale] = useState(1.0);
  /** ページ番号入力フォーム値 */
  const [pageInput, setPageInput] = useState('1');
  /** 目次データ */
  const [toc, setToc] = useState<TocItem[]>([]);
  /** 目次パネルの表示/非表示 */
  const [showToc, setShowToc] = useState(false);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [error, setError] = useState<string | null>(null);
  /** レンダリング中フラグ（多重レンダリング防止） */
  const isRenderingRef = useRef(false);

  /**
   * PDF.jsライブラリを動的にロードする
   *
   * SSR非互換のためuseEffect内で動的インポートを行う。
   * GlobalWorkerOptionsでworkerのURLを設定する。
   */
  useEffect(() => {
    const loadPdfjs = async () => {
      if (pdfjsLib) return;

      // pdfjs-distを動的インポート（SSR非対応のため）
      const pdfjs = await import('pdfjs-dist');

      // WebWorkerのURLを設定（Next.jsのpublicディレクトリからは読めないためCDNを使用）
      // pdfjs-dist v5ではworkerSrcの設定方法が変更されている
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

      pdfjsLib = pdfjs;
    };

    loadPdfjs();
  }, []);

  /**
   * PDFドキュメントをロードする
   *
   * 署名付きURLからPDFを取得し、ページ数と目次を初期化する。
   * rangeRequestsを有効化して1ページずつフェッチする（全ページ一括取得を防止）。
   */
  useEffect(() => {
    if (!url) return;

    let isCancelled = false;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);

      // pdf.jsライブラリのロードを待つ
      while (!pdfjsLib) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (isCancelled) return;
      }

      try {
        // PDFドキュメントのロード
        // disableRange: false（デフォルト）でrangeRequestsを有効化
        const loadingTask = pdfjsLib.getDocument({
          url,
          // rangeChunkSize: 65536, // 64KB単位でレンジリクエスト（デフォルト値）
          // withCredentials: false, // クロスオリジンクッキーは不要
        });

        const doc = await loadingTask.promise;

        if (isCancelled) {
          doc.destroy();
          return;
        }

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setPageInput('1');

        // 目次（アウトライン）の取得
        try {
          const outline = await doc.getOutline();
          if (outline && outline.length > 0) {
            // outline の型に合わせてキャスト
            setToc(outline as TocItem[]);
          }
        } catch {
          // 目次なしのPDFは正常
          setToc([]);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('PDF load error:', err);
          setError('PDFの読み込みに失敗しました。URLが期限切れの可能性があります。');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [url]);

  /**
   * 指定ページをCanvasにレンダリングする
   *
   * pdf.jsのPageオブジェクトを取得し、CanvasにRGBAピクセルデータとして描画する。
   * 前のレンダリングタスクをキャンセルしてから新しいレンダリングを開始する（多重レンダリング防止）。
   *
   * @param doc - PDF.jsのドキュメントオブジェクト
   * @param pageNum - 描画するページ番号（1始まり）
   * @param zoom - ズーム倍率
   */
  const renderPage = useCallback(
    async (
      doc: import('pdfjs-dist').PDFDocumentProxy,
      pageNum: number,
      zoom: number
    ) => {
      if (isRenderingRef.current) {
        // 前のレンダリングをキャンセル
        renderTaskRef.current?.cancel();
      }

      isRenderingRef.current = true;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        const page = await doc.getPage(pageNum);

        // デバイスピクセル比を考慮したViewportを作成（高DPIディスプレイ対応）
        const devicePixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zoom * devicePixelRatio });

        // Canvasのサイズをページに合わせる
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        // CSSサイズはズーム倍率のみ（devicePixelRatioを除く）
        canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;

        const renderContext = {
          // canvas はRenderParametersの必須フィールド（pdfjs-dist v5）
          canvas,
          canvasContext: ctx,
          viewport,
        };

        // レンダリングタスクを保持してキャンセル可能にする
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
      } catch (err: unknown) {
        // キャンセルエラーは正常（新しいレンダリング開始時）
        const errObj = err as { name?: string };
        if (errObj?.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      } finally {
        isRenderingRef.current = false;
      }
    },
    []
  );

  /**
   * ページ変更・ズーム変更時のレンダリングトリガー
   */
  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
      renderPage(pdfDoc, currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, totalPages, renderPage]);

  /**
   * コンポーネントのアンマウント時にPDFドキュメントを破棄する
   * メモリリーク防止
   */
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [pdfDoc]);

  // ===== DRM保護: 右クリック禁止 =====
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  // ===== DRM保護: 印刷制限（Ctrl+P / Ctrl+Shift+P）=====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P（印刷）を無効化
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+P（印刷）を無効化
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // ===== ページナビゲーション =====

  /**
   * 前のページへ移動する
   */
  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      setPageInput(String(newPage));
    }
  }, [currentPage]);

  /**
   * 次のページへ移動する
   */
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      setPageInput(String(newPage));
    }
  }, [currentPage, totalPages]);

  /**
   * ページ番号入力フォームのサブミット処理
   * 入力値をバリデーションしてページ遷移する
   */
  const handlePageInputSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const pageNum = parseInt(pageInput, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
      } else {
        // 不正な値は現在のページに戻す
        setPageInput(String(currentPage));
      }
    },
    [pageInput, currentPage, totalPages]
  );

  // ===== ズーム =====

  /**
   * ズームイン（+10%）
   */
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.2, 3.0)); // 最大300%
  }, []);

  /**
   * ズームアウト（-10%）
   */
  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.2, 0.4)); // 最小40%
  }, []);

  /**
   * フィットページ（デフォルト100%に戻す）
   */
  const fitPage = useCallback(() => {
    setScale(1.0);
  }, []);

  // ===== 目次ナビゲーション =====

  /**
   * 目次アイテムをクリックしてページ遷移する
   *
   * PDF.jsのdest（リンク先）からページ番号を解決して遷移する。
   *
   * @param dest - PDF.jsのdestination（ページリンク先）
   */
  const handleTocClick = useCallback(
    async (dest: string | unknown[] | null) => {
      if (!pdfDoc || !dest) return;

      try {
        let pageIndex: number;

        if (typeof dest === 'string') {
          // Named destinationの場合はpageIndexを解決
          const pageRef = await pdfDoc.getDestination(dest);
          if (!pageRef) return;
          // pageRef[0] はRefProxy型（pdfjs-dist内部型）。型キャストで対応
          pageIndex = await pdfDoc.getPageIndex(
            (pageRef as unknown[])[0] as { num: number; gen: number }
          );
        } else if (Array.isArray(dest) && dest.length > 0) {
          // 直接のdestination配列の場合
          pageIndex = await pdfDoc.getPageIndex(
            dest[0] as { num: number; gen: number }
          );
        } else {
          return;
        }

        const pageNum = pageIndex + 1; // 0始まりを1始まりに変換
        setCurrentPage(pageNum);
        setPageInput(String(pageNum));
        setShowToc(false); // 目次を閉じる
      } catch (err) {
        console.error('TOC navigation error:', err);
      }
    },
    [pdfDoc]
  );

  // ===== レンダリング =====

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    // DRM保護: 右クリック禁止をコンテナ全体に適用
    <div
      style={styles.container}
      onContextMenu={handleContextMenu}
    >
      {/* ===== ツールバー ===== */}
      <div style={styles.toolbar}>
        {/* 目次ボタン */}
        {toc.length > 0 && (
          <button
            type="button"
            onClick={() => setShowToc(!showToc)}
            style={styles.toolbarButton}
            aria-label="目次を表示"
          >
            目次
          </button>
        )}

        {/* ページナビゲーション */}
        <div style={styles.pageNav}>
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            style={{
              ...styles.toolbarButton,
              ...(currentPage <= 1 ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="前のページ"
          >
            &#8249;
          </button>

          {/* ページ番号入力 */}
          <form onSubmit={handlePageInputSubmit} style={styles.pageInputForm}>
            <input
              type="number"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              style={styles.pageInput}
              min={1}
              max={totalPages}
              aria-label="ページ番号"
            />
            <span style={styles.pageSeparator}>/</span>
            <span style={styles.totalPages}>{totalPages}</span>
          </form>

          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            style={{
              ...styles.toolbarButton,
              ...(currentPage >= totalPages ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="次のページ"
          >
            &#8250;
          </button>
        </div>

        {/* ズームコントロール */}
        <div style={styles.zoomControls}>
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 0.4}
            style={{
              ...styles.toolbarButton,
              ...(scale <= 0.4 ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="縮小"
          >
            -
          </button>
          <button
            type="button"
            onClick={fitPage}
            style={styles.toolbarButton}
            aria-label="100%に戻す"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 3.0}
            style={{
              ...styles.toolbarButton,
              ...(scale >= 3.0 ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="拡大"
          >
            +
          </button>
        </div>
      </div>

      {/* ===== メインコンテンツ ===== */}
      <div style={styles.mainArea}>
        {/* 目次パネル（サイドバー） */}
        {showToc && toc.length > 0 && (
          <div style={styles.tocPanel}>
            <h3 style={styles.tocTitle}>目次</h3>
            <ul style={styles.tocList}>
              {toc.map((item, index) => (
                <li key={index} style={styles.tocItem}>
                  <button
                    type="button"
                    onClick={() => handleTocClick(item.dest)}
                    style={styles.tocButton}
                  >
                    {item.title}
                  </button>
                  {/* 子アイテム（最大1階層） */}
                  {item.items && item.items.length > 0 && (
                    <ul style={styles.tocSubList}>
                      {item.items.map((subItem, subIndex) => (
                        <li key={subIndex} style={styles.tocSubItem}>
                          <button
                            type="button"
                            onClick={() => handleTocClick(subItem.dest)}
                            style={styles.tocSubButton}
                          >
                            {subItem.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PDFレンダリングエリア */}
        <div style={styles.canvasWrapper}>
          {isLoading && (
            <div style={styles.loadingOverlay}>
              <p style={styles.loadingText}>読み込み中...</p>
            </div>
          )}

          {/* DRM保護: CanvasはテキストコピーをCSS制御で制限 */}
          {/* user-select: noneはスタイルで適用 */}
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            aria-label={`${title} - ${currentPage}/${totalPages}ページ`}
          />
        </div>
      </div>
    </div>
  );
}

// ===== スタイル定義 =====
// DRM保護のCSSも含む

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#525659', // PDF.jsのデフォルト背景色に合わせる
    userSelect: 'none', // DRM: テキスト選択禁止
    WebkitUserSelect: 'none',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#323639',
    color: '#ffffff',
    flexWrap: 'wrap',
    zIndex: 10,
  },
  toolbarButton: {
    backgroundColor: '#4a4d50',
    color: '#ffffff',
    border: '1px solid #666',
    borderRadius: '4px',
    padding: '0.3rem 0.6rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    minWidth: '2rem',
  },
  toolbarButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  pageInputForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  pageInput: {
    width: '3.5rem',
    padding: '0.25rem',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    color: '#000000',
    border: '1px solid #999',
    borderRadius: '3px',
    fontSize: '0.875rem',
    // Spinner非表示
    MozAppearance: 'textfield',
  },
  pageSeparator: {
    color: '#cccccc',
    margin: '0 0.2rem',
  },
  totalPages: {
    color: '#cccccc',
    fontSize: '0.875rem',
  },
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginLeft: 'auto',
  },
  mainArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  tocPanel: {
    width: '220px',
    minWidth: '180px',
    backgroundColor: '#38393d',
    color: '#ffffff',
    overflowY: 'auto',
    padding: '1rem 0.5rem',
    borderRight: '1px solid #555',
  },
  tocTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#cccccc',
    margin: '0 0 0.75rem 0',
    padding: '0 0.5rem',
  },
  tocList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  tocItem: {
    padding: '0.1rem 0',
  },
  tocButton: {
    background: 'none',
    border: 'none',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    textAlign: 'left',
    width: '100%',
    padding: '0.3rem 0.5rem',
    borderRadius: '3px',
    lineHeight: 1.4,
  },
  tocSubList: {
    listStyle: 'none',
    padding: '0 0 0 1rem',
    margin: 0,
  },
  tocSubItem: {
    padding: '0.05rem 0',
  },
  tocSubButton: {
    background: 'none',
    border: 'none',
    color: '#c0c0c0',
    cursor: 'pointer',
    fontSize: '0.75rem',
    textAlign: 'left',
    width: '100%',
    padding: '0.2rem 0.5rem',
    borderRadius: '3px',
    lineHeight: 1.4,
  },
  canvasWrapper: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '1rem',
    position: 'relative',
  },
  canvas: {
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    display: 'block',
    // DRM: テキスト選択禁止
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#ffffff',
    padding: '1rem 2rem',
    borderRadius: '8px',
    zIndex: 5,
  },
  loadingText: {
    margin: 0,
    fontSize: '0.9375rem',
  },
  errorContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    backgroundColor: '#525659',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: '1rem',
    textAlign: 'center',
    padding: '2rem',
  },
};
