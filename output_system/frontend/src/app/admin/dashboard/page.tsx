/**
 * @file admin/dashboard/page.tsx
 * @description 管理者ダッシュボード
 *
 * ログイン後の管理者向けトップ画面。
 * 管理機能へのナビゲーションとサマリー情報を提供する。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, apiGetMe, apiLogout, AuthUser } from '../../../lib/api';
import Sidebar from '../../../components/layout/Sidebar';

/**
 * 管理者ダッシュボードコンポーネント
 *
 * @returns {JSX.Element} ダッシュボード画面
 */
export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // マウント時に認証状態を確認する
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        const result = await apiGetMe();
        if (result.user.role !== 'admin') {
          // adminロール以外はアクセス不可
          router.push('/admin/login');
          return;
        }
        setUser(result.user);
      } catch {
        router.push('/admin/login');
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <div style={{ width: '240px', backgroundColor: '#1e293b' }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#6b7280' }}>読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* サイドバーナビゲーション */}
      <Sidebar />

      {/* メインコンテンツ */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {/* ページヘッダー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              管理ダッシュボード
            </h1>
            <p style={{ color: '#6b7280', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              ようこそ、{user?.name} さん
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #dc2626',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ログアウト
          </button>
        </div>

        {/* クイックアクション */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* 著者管理カード */}
          <Link
            href="/admin/authors"
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👤</div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
                著者管理
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                著者アカウントの作成・編集・無効化
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
