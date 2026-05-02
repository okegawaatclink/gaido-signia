/**
 * @file Footer.tsx
 * @description フッターコンポーネント
 *
 * 利用規約・プライバシーポリシーへのリンクを含むフッター。
 * ファン向け画面・ランディングページ共通で使用する。
 *
 * ホバーエフェクト（onMouseEnter/onMouseLeave）を使用するためClient Component。
 */

'use client';

/**
 * フッターコンポーネント
 *
 * コピーライト表示・利用規約・プライバシーポリシーリンクを含む。
 *
 * @returns {JSX.Element} フッター
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={styles.footer}>
      <div style={styles.footerContent}>
        {/* コピーライト */}
        <p style={styles.copyright}>
          © {currentYear} Signia. All rights reserved.
        </p>

        {/* リンク */}
        <div style={styles.links}>
          {/* 利用規約 */}
          <a
            href="/terms"
            style={styles.link}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#0070f3'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            利用規約
          </a>

          <span style={styles.separator} aria-hidden="true">|</span>

          {/* プライバシーポリシー */}
          <a
            href="/privacy"
            style={styles.link}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#0070f3'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            プライバシーポリシー
          </a>
        </div>
      </div>
    </footer>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  footer: {
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #e5e7eb',
    marginTop: 'auto',
  },
  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.5rem',
  },
  copyright: {
    color: '#9ca3af',
    fontSize: '0.75rem',
    margin: 0,
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  link: {
    color: '#9ca3af',
    fontSize: '0.75rem',
    textDecoration: 'none',
    transition: 'color 0.15s ease',
  },
  separator: {
    color: '#d1d5db',
    fontSize: '0.75rem',
  },
};
