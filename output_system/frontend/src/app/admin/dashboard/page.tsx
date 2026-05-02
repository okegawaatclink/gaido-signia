/**
 * @file admin/dashboard/page.tsx
 * @description 管理者ダッシュボード（プレースホルダー）
 *
 * ログイン後の管理者向け画面。
 * 後続のPBIで本実装を行う。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, apiGetMe, apiLogout, AuthUser } from '../../../lib/api';

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#111' }}>管理ダッシュボード</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#555' }}>{user?.name}（管理者）</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #dc2626',
              borderRadius: '6px',
              background: 'none',
              color: '#dc2626',
              cursor: 'pointer',
            }}
          >
            ログアウト
          </button>
        </div>
      </div>
      <p style={{ color: '#666' }}>管理ダッシュボードは後続のPBIで実装予定です。</p>
    </div>
  );
}
