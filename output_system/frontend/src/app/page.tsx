/**
 * @file page.tsx
 * @description トップページ（ランディングページ）
 *
 * Signiaシステムのトップページ。
 * 動作確認用の最小限の実装。
 * 認証状態に応じてログインページまたはダッシュボードへリダイレクトする想定。
 */

/**
 * トップページコンポーネント
 *
 * @returns {JSX.Element} トップページのUI
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <h1
        style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#0070f3',
        }}
      >
        Signia
      </h1>
      <p
        style={{
          fontSize: '1.25rem',
          color: '#666',
          marginBottom: '2rem',
          textAlign: 'center',
        }}
      >
        電子書籍サイン合成システム
      </p>
      <p
        style={{
          fontSize: '0.875rem',
          color: '#999',
        }}
      >
        開発環境が正常に起動しています ✓
      </p>
    </main>
  );
}
