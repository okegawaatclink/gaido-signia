/**
 * @file Sidebar.tsx
 * @description 管理者向けサイドバーナビゲーションコンポーネント
 *
 * 管理者ダッシュボード・著者管理などの管理機能へのナビゲーションリンクを提供する。
 * 現在のパスに基づいてアクティブなメニュー項目をハイライトする。
 *
 * 使用箇所:
 * - 管理者向け各ページのレイアウト
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * サイドバーのメニュー項目型定義
 */
interface NavItem {
  /** メニューラベル */
  label: string;
  /** リンク先パス */
  href: string;
  /** アイコン文字（絵文字） */
  icon: string;
}

/** 管理者向けナビゲーション項目 */
const NAV_ITEMS: NavItem[] = [
  {
    label: 'ダッシュボード',
    href: '/admin/dashboard',
    icon: '🏠',
  },
  {
    label: '著者管理',
    href: '/admin/authors',
    icon: '👤',
  },
];

/**
 * 管理者向けサイドバーコンポーネント
 *
 * @returns サイドバーナビゲーション JSX 要素
 */
export default function Sidebar() {
  // 現在のパスを取得してアクティブ状態の判定に使用する
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '240px',
        minHeight: '100vh',
        backgroundColor: '#1e293b',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* サイドバーヘッダー */}
      <div
        style={{
          padding: '1.5rem 1rem',
          borderBottom: '1px solid #334155',
          marginBottom: '0.5rem',
        }}
      >
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: '700',
            color: '#f1f5f9',
            letterSpacing: '0.05em',
          }}
        >
          📚 Signia
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#94a3b8',
            marginTop: '0.25rem',
          }}
        >
          管理者コンソール
        </div>
      </div>

      {/* ナビゲーションリスト */}
      <nav style={{ padding: '0 0.5rem', flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          // パスが一致する場合またはサブパスの場合はアクティブとみなす
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '6px',
                marginBottom: '0.25rem',
                textDecoration: 'none',
                color: isActive ? '#f1f5f9' : '#94a3b8',
                backgroundColor: isActive ? '#2563eb' : 'transparent',
                fontWeight: isActive ? '600' : '400',
                fontSize: '0.9rem',
                transition: 'background-color 0.15s, color 0.15s',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* サイドバーフッター（バージョン情報等） */}
      <div
        style={{
          padding: '1rem',
          borderTop: '1px solid #334155',
          fontSize: '0.75rem',
          color: '#475569',
          textAlign: 'center',
        }}
      >
        Signia Admin v1.0
      </div>
    </aside>
  );
}
