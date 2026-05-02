/**
 * @file EpubViewer.tsx
 * @description EPUBビューアーコンポーネント（DRM保護付き）
 *
 * epub.jsを使用してブラウザ上でEPUBをレンダリングする。
 * DRM保護として以下を実装する:
 * - テキスト選択禁止（CSS user-select: none）
 * - 右クリック禁止（contextmenuイベント抑止）
 * - 印刷制限（CSS @media print非表示 + Ctrl+P 無効化）
 *
 * 機能:
 * - ページ送り（前へ/次へ）
 * - フォントサイズ変更
 * - 目次表示
 * - レスポンシブ対応
 *
 * セキュリティ注意:
 * - 完全なDRMではなく、カジュアルコピーの抑止が目的
 *
 * epub.jsはSSRに非対応のため、dynamic importで使用する。
 * epub.jsドキュメント: https://github.com/futurepress/epub.js
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * epub.jsのRenditionオブジェクトの型定義（epub.jsのoverrideインターフェース）
 * epub.jsの実際のRendition型にはdisplay()が文字列/数値の別overloadになっているため、
 * このインターフェースでunion型として統合する
 */
interface EpubRendition {
  display: (target?: string) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  destroy: () => void;
  resize: (width: number, height: number) => void;
  on: (event: string, handler: (data: unknown) => void) => void;
  themes: {
    register: (name: string, styles: Record<string, Record<string, string>>) => void;
    select: (name: string) => void;
    fontSize: (size: string) => void;
  };
}

/**
 * epub.jsのBookオブジェクトの型定義
 */
interface EpubBook {
  renderTo: (element: HTMLElement, options: Record<string, unknown>) => EpubRendition;
  destroy: () => void;
  loaded: {
    navigation: Promise<{ toc: TocItem[] }>;
  };
}

/**
 * epub.jsのロケーション情報型定義
 * relocatedイベントで渡されるデータ
 */
interface EpubLocation {
  atStart: boolean;
  atEnd: boolean;
}

/**
 * EPUBビューアーコンポーネントのPropsインターフェース
 */
interface EpubViewerProps {
  /**
   * 表示するEPUBの署名付きURL
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
 * epub.jsのNavItemに対応する
 */
interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

/**
 * EPUBビューアーコンポーネント（Client Component）
 *
 * 署名付きURLからEPUBを読み込み、ページ送り・フォントサイズ変更・目次機能付きで表示する。
 * DRM保護として右クリック禁止・印刷制限・テキスト選択禁止を実装する。
 *
 * epub.jsのRenditionオブジェクトを使用してiframeに埋め込みレンダリングを行う。
 *
 * @param {EpubViewerProps} props - コンポーネントのProps
 * @returns {JSX.Element} EPUBビューアーUI
 */
export function EpubViewer({ url, title = 'EPUB Document' }: EpubViewerProps) {
  /** レンダリング先のDOMコンテナ参照 */
  const containerRef = useRef<HTMLDivElement>(null);

  /** epub.jsのRenditionオブジェクト（ページナビゲーションに使用） */
  const renditionRef = useRef<EpubRendition | null>(null);

  /** epub.jsのBookオブジェクト */
  const bookRef = useRef<EpubBook | null>(null);

  /** フォントサイズ（px単位） */
  const [fontSize, setFontSize] = useState(16);
  /** 目次データ */
  const [toc, setToc] = useState<TocItem[]>([]);
  /** 目次パネルの表示/非表示 */
  const [showToc, setShowToc] = useState(false);
  /** ローディング状態 */
  const [isLoading, setIsLoading] = useState(true);
  /** エラーメッセージ */
  const [error, setError] = useState<string | null>(null);
  /** 前ページナビゲーション可能フラグ */
  const [canPrev, setCanPrev] = useState(false);
  /** 次ページナビゲーション可能フラグ */
  const [canNext, setCanNext] = useState(true);

  /**
   * EPUBを読み込んでレンダリングする
   *
   * epub.jsはSSRに非対応のため動的インポートを使用する。
   * Renditionオブジェクトにthemeを設定してDRM保護のCSSを適用する。
   */
  useEffect(() => {
    if (!url || !containerRef.current) return;

    let isCancelled = false;

    const loadEpub = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // epub.jsを動的インポート（SSR非対応のため）
        const ePub = (await import('epubjs')).default;

        if (isCancelled) return;

        // 既存のBookを破棄（URL変更時のクリーンアップ）
        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
        }
        if (renditionRef.current) {
          renditionRef.current.destroy();
          renditionRef.current = null;
        }
        // コンテナ内のiframeをクリア
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // EPUBブックのインスタンス作成
        // 署名付きURLから直接ロード
        // epub.jsのBook型はEpubBookインターフェースと互換性があるためキャスト
        const book = ePub(url) as unknown as EpubBook;
        bookRef.current = book;

        // コンテナのサイズを取得
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = containerRef.current?.clientHeight || 600;

        // Renditionを作成してコンテナにマウント
        // flow: "paginated" でページ送りモード
        const rendition = book.renderTo(containerRef.current!, {
          width: containerWidth,
          height: containerHeight,
          flow: 'paginated',
        });
        renditionRef.current = rendition;

        // DRM保護: テキスト選択禁止・右クリック禁止のCSSテーマを適用
        // epub.jsのRenditionにカスタムCSSを注入する
        rendition.themes.register('drm-protection', {
          body: {
            // テキスト選択禁止
            'user-select': 'none',
            '-webkit-user-select': 'none',
            '-moz-user-select': 'none',
            '-ms-user-select': 'none',
          },
          // 印刷時は非表示（CSS @media print相当）
          // epub.jsのthemeではmedia queryは直接指定できないため
          // グローバルCSSで対応する
        });
        rendition.themes.select('drm-protection');

        // フォントサイズを適用
        rendition.themes.fontSize(`${fontSize}px`);

        // EPUBを最初のページから表示
        await rendition.display();

        if (isCancelled) {
          book.destroy();
          return;
        }

        setIsLoading(false);

        // 目次（TOC）の取得
        // book.loaded.navigationはPromiseを返す
        book.loaded.navigation.then((nav: { toc: TocItem[] }) => {
          if (!isCancelled && nav.toc) {
            setToc(nav.toc);
          }
        }).catch(() => {
          // 目次なしは正常
        });

        // ページ移動イベント: 前後ページの可否を更新
        rendition.on('relocated', (location: unknown) => {
          const loc = location as EpubLocation;
          setCanPrev(!loc.atStart);
          setCanNext(!loc.atEnd);
        });

        // DRM保護: iframe内の右クリック禁止
        // renditionのcontentsイベントでiframe内DOMにアクセス
        rendition.on('rendered', () => {
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe?.contentDocument) {
            iframe.contentDocument.addEventListener('contextmenu', (e: Event) => {
              e.preventDefault();
            });
          }
        });

      } catch (err) {
        if (!isCancelled) {
          console.error('EPUB load error:', err);
          setError('EPUBの読み込みに失敗しました。URLが期限切れの可能性があります。');
          setIsLoading(false);
        }
      }
    };

    loadEpub();

    return () => {
      isCancelled = true;
      // コンポーネントアンマウント時のリソース解放
      if (bookRef.current) {
        try {
          bookRef.current.destroy();
        } catch {
          // 破棄エラーは無視
        }
        bookRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]); // urlが変わったときのみ再マウント（fontSizeは後で動的適用）

  /**
   * フォントサイズ変更時にRenditionに適用する
   *
   * epub.jsのRenditionはDOMを再レンダリングせずにCSSを動的変更できる。
   */
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}px`);
    }
  }, [fontSize]);

  /**
   * コンテナサイズ変更時のリサイズ処理
   * ResizeObserverでコンテナサイズを監視し、Renditionに反映する
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (renditionRef.current && containerRef.current) {
        renditionRef.current.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // ===== DRM保護: 右クリック禁止（コンテナ全体） =====
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  // ===== DRM保護: 印刷制限（Ctrl+P / Ctrl+Shift+P）=====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
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
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  }, []);

  /**
   * 次のページへ移動する
   */
  const goToNextPage = useCallback(() => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  }, []);

  // ===== フォントサイズ =====

  /**
   * フォントサイズを大きくする
   */
  const increaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.min(prev + 2, 32)); // 最大32px
  }, []);

  /**
   * フォントサイズを小さくする
   */
  const decreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.max(prev - 2, 10)); // 最小10px
  }, []);

  /**
   * フォントサイズをデフォルトに戻す
   */
  const resetFontSize = useCallback(() => {
    setFontSize(16);
  }, []);

  // ===== 目次ナビゲーション =====

  /**
   * 目次アイテムをクリックしてページ遷移する
   *
   * epub.jsのRendition.display()にhrefを渡してページ遷移する。
   *
   * @param href - 目次アイテムのhref（EPUBのファイルパス）
   */
  const handleTocClick = useCallback((href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
      setShowToc(false); // 目次を閉じる
    }
  }, []);

  // ===== レンダリング =====

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    // DRM保護: 右クリック禁止・テキスト選択禁止をコンテナ全体に適用
    <div
      style={styles.wrapper}
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
        <div style={styles.navButtons}>
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={!canPrev}
            style={{
              ...styles.toolbarButton,
              ...(!canPrev ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="前のページ"
          >
            &#8249; 前へ
          </button>

          <button
            type="button"
            onClick={goToNextPage}
            disabled={!canNext}
            style={{
              ...styles.toolbarButton,
              ...(!canNext ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="次のページ"
          >
            次へ &#8250;
          </button>
        </div>

        {/* フォントサイズコントロール */}
        <div style={styles.fontControls}>
          <span style={styles.fontLabel}>文字サイズ</span>
          <button
            type="button"
            onClick={decreaseFontSize}
            disabled={fontSize <= 10}
            style={{
              ...styles.toolbarButton,
              ...(fontSize <= 10 ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="文字を小さく"
          >
            A-
          </button>
          <button
            type="button"
            onClick={resetFontSize}
            style={styles.toolbarButton}
            aria-label="文字サイズをリセット"
          >
            {fontSize}px
          </button>
          <button
            type="button"
            onClick={increaseFontSize}
            disabled={fontSize >= 32}
            style={{
              ...styles.toolbarButton,
              ...(fontSize >= 32 ? styles.toolbarButtonDisabled : {}),
            }}
            aria-label="文字を大きく"
          >
            A+
          </button>
        </div>
      </div>

      {/* ===== メインコンテンツ ===== */}
      <div style={styles.mainArea}>
        {/* 目次パネル */}
        {showToc && toc.length > 0 && (
          <div style={styles.tocPanel}>
            <h3 style={styles.tocTitle}>目次</h3>
            <ul style={styles.tocList}>
              {toc.map((item, index) => (
                <li key={item.id || index} style={styles.tocItem}>
                  <button
                    type="button"
                    onClick={() => handleTocClick(item.href)}
                    style={styles.tocButton}
                  >
                    {item.label}
                  </button>
                  {/* サブアイテム（1階層） */}
                  {item.subitems && item.subitems.length > 0 && (
                    <ul style={styles.tocSubList}>
                      {item.subitems.map((sub, subIndex) => (
                        <li key={sub.id || subIndex} style={styles.tocSubItem}>
                          <button
                            type="button"
                            onClick={() => handleTocClick(sub.href)}
                            style={styles.tocSubButton}
                          >
                            {sub.label}
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

        {/* EPUBレンダリングコンテナ */}
        <div style={styles.viewerArea}>
          {isLoading && (
            <div style={styles.loadingOverlay}>
              <p style={styles.loadingText}>読み込み中...</p>
            </div>
          )}

          {/* epub.jsはこのdivにiframeを注入する */}
          {/* DRM保護: user-select: noneはthemeで適用済み */}
          <div
            ref={containerRef}
            style={styles.epubContainer}
            aria-label={title}
          />
        </div>
      </div>
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#fafaf8',
    // DRM: テキスト選択禁止
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#2c2c2c',
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
  },
  toolbarButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  navButtons: {
    display: 'flex',
    gap: '0.5rem',
    margin: '0 auto',
  },
  fontControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginLeft: 'auto',
  },
  fontLabel: {
    color: '#cccccc',
    fontSize: '0.8125rem',
    marginRight: '0.25rem',
  },
  mainArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  tocPanel: {
    width: '220px',
    minWidth: '180px',
    backgroundColor: '#f5f5f0',
    color: '#333333',
    overflowY: 'auto',
    padding: '1rem 0.5rem',
    borderRight: '1px solid #ddd',
  },
  tocTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#555555',
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
    color: '#333333',
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
    color: '#666666',
    cursor: 'pointer',
    fontSize: '0.75rem',
    textAlign: 'left',
    width: '100%',
    padding: '0.2rem 0.5rem',
    borderRadius: '3px',
    lineHeight: 1.4,
  },
  viewerArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  epubContainer: {
    width: '100%',
    height: '100%',
    // DRM: テキスト選択禁止（iframe内はthemeで対応）
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
    backgroundColor: '#fafaf8',
  },
  errorText: {
    color: '#cc0000',
    fontSize: '1rem',
    textAlign: 'center',
    padding: '2rem',
  },
};
