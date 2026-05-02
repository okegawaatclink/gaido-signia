/**
 * @file layout.tsx
 * @description アプリケーションのルートレイアウト
 *
 * Next.js App Routerのルートレイアウト。
 * 全ページに共通するHTMLの基本構造、メタデータ、グローバルスタイルを定義する。
 */

import type { Metadata } from 'next';
import './globals.css';

/**
 * アプリケーションのメタデータ
 * SEOおよびブラウザタブ表示用の情報を定義する
 */
export const metadata: Metadata = {
  title: 'Signia - 電子書籍サイン合成システム',
  description: '著者が電子書籍にサインを合成し、ファンに配信するプラットフォーム',
};

/**
 * ルートレイアウトコンポーネント
 *
 * @param {Object} props - プロパティ
 * @param {React.ReactNode} props.children - 子コンポーネント（各ページ）
 * @returns {JSX.Element} HTMLドキュメントの基本構造
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
