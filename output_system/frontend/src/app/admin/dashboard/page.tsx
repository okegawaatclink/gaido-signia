/**
 * @file admin/dashboard/page.tsx
 * @description 管理者ダッシュボード画面
 *
 * ログイン後の管理者向けトップ画面。
 * 統計情報（著者数・書籍数・ファン数・サイン合成数）と最近の操作履歴を表示する。
 *
 * 画面要件（S1: 管理ダッシュボード）:
 * - 統計カード: 著者数・書籍数・ファン数・サイン合成数（アイコン付き）
 * - 操作履歴: 最近の操作を時系列テーブルで表示
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  apiGetMe,
  apiLogout,
  apiGetStats,
  AuthUser,
  DashboardStats,
  AuditLogEntry,
} from '../../../lib/api';
import Sidebar from '../../../components/layout/Sidebar';

/**
 * 統計カードコンポーネント
 * アイコン・タイトル・件数を表示する
 */
function StatCard({
  icon,
  title,
  count,
  href,
  color,
}: {
  icon: string;
  title: string;
  count: number | null;
  href?: string;
  color: string;
}) {
  const cardContent = (
    <div
      style={{
        backgroundColor: '#fff',
        border: `2px solid ${color}20`,
        borderRadius: '12px',
        padding: '1.5rem',
        cursor: href ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {/* アイコン */}
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: '10px',
          backgroundColor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      {/* テキスト */}
      <div>
        <p
          style={{
            fontSize: '0.8rem',
            color: '#6b7280',
            margin: 0,
            marginBottom: '0.25rem',
            fontWeight: '500',
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: '1.75rem',
            fontWeight: '700',
            color: color,
            margin: 0,
            lineHeight: 1,
          }}
        >
          {count === null ? '...' : count.toLocaleString()}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {cardContent}
      </Link>
    );
  }
  return cardContent;
}

/**
 * 操作種別を日本語ラベルに変換する
 *
 * @param action - 操作種別文字列
 * @returns 日本語ラベル
 */
function getActionLabel(action: string): string {
  const actionLabels: Record<string, string> = {
    LOGIN: 'ログイン',
    LOGOUT: 'ログアウト',
    CREATE_BOOK: '書籍作成',
    UPDATE_BOOK: '書籍更新',
    DELETE_BOOK: '書籍削除',
    CREATE_SIGN: 'サイン作成',
    UPDATE_SIGN: 'サイン更新',
    DELETE_SIGN: 'サイン削除',
    COMPOSE_SIGN: 'サイン合成',
    CREATE_AUTHOR: '著者作成',
    UPDATE_AUTHOR: '著者更新',
    DEACTIVATE_AUTHOR: '著者無効化',
    CREATE_API_KEY: 'APIキー作成',
    DEACTIVATE_API_KEY: 'APIキー無効化',
    GRANT_BOOK_ACCESS: 'アクセス権付与',
  };
  return actionLabels[action] || action;
}

/**
 * リソース種別を日本語ラベルに変換する
 *
 * @param resourceType - リソース種別
 * @returns 日本語ラベル
 */
function getResourceTypeLabel(resourceType: string): string {
  const resourceLabels: Record<string, string> = {
    book: '書籍',
    sign: 'サイン',
    user: 'ユーザー',
    signed_book: '合成書籍',
    api_key: 'APIキー',
    book_access: 'アクセス権',
  };
  return resourceLabels[resourceType] || resourceType;
}

/**
 * 管理者ダッシュボードコンポーネント
 *
 * @returns ダッシュボード画面 JSX 要素
 */
export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

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
        return;
      } finally {
        setIsLoading(false);
      }

      // 認証確認後に統計情報を取得する
      await loadStats();
    }

    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /**
   * 統計情報と監査ログを取得する
   */
  async function loadStats() {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await apiGetStats();
      setStats(data.stats);
      setRecentLogs(data.recentLogs);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStatsError('統計情報の取得に失敗しました');
    } finally {
      setStatsLoading(false);
    }
  }

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

        {/* エラーメッセージ */}
        {statsError && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              color: '#dc2626',
              fontSize: '0.875rem',
            }}
          >
            {statsError}
            <button
              onClick={loadStats}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                border: '1px solid #dc2626',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              再読み込み
            </button>
          </div>
        )}

        {/* 統計情報カード */}
        <section style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '1rem',
              marginTop: 0,
            }}
          >
            システム統計
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* 著者アカウント数 */}
            <StatCard
              icon="👤"
              title="著者アカウント数"
              count={statsLoading ? null : (stats?.authorCount ?? 0)}
              href="/admin/authors"
              color="#2563eb"
            />
            {/* 書籍登録数 */}
            <StatCard
              icon="📖"
              title="書籍登録数"
              count={statsLoading ? null : (stats?.bookCount ?? 0)}
              href="/admin/books"
              color="#059669"
            />
            {/* ファンアカウント数 */}
            <StatCard
              icon="🎉"
              title="ファンアカウント数"
              count={statsLoading ? null : (stats?.fanCount ?? 0)}
              color="#d97706"
            />
            {/* サイン合成数 */}
            <StatCard
              icon="✍️"
              title="サイン合成数"
              count={statsLoading ? null : (stats?.signedBookCount ?? 0)}
              color="#7c3aed"
            />
          </div>
        </section>

        {/* 最近の操作履歴 */}
        <section>
          <h2
            style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '1rem',
              marginTop: 0,
            }}
          >
            最近の操作履歴
          </h2>

          {statsLoading ? (
            /* 読み込み中プレースホルダー */
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              読み込み中...
            </div>
          ) : recentLogs.length === 0 ? (
            /* 空状態 */
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              操作履歴はまだありません
            </div>
          ) : (
            /* 操作履歴テーブル */
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <th
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                      }}
                    >
                      日時
                    </th>
                    <th
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                      }}
                    >
                      操作者
                    </th>
                    <th
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                      }}
                    >
                      操作内容
                    </th>
                    <th
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                      }}
                    >
                      対象リソース
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log, index) => (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom:
                          index < recentLogs.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      {/* 日時 */}
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          color: '#6b7280',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(log.createdAt).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      {/* 操作者 */}
                      <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>
                        {log.userName ? (
                          <span>
                            {log.userName}
                            <span
                              style={{
                                marginLeft: '0.375rem',
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                              }}
                            >
                              ({log.userRole})
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>削除済みユーザー</span>
                        )}
                      </td>
                      {/* 操作内容 */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            backgroundColor: '#eff6ff',
                            color: '#2563eb',
                          }}
                        >
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      {/* 対象リソース */}
                      <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>
                        <span>{getResourceTypeLabel(log.resourceType)}</span>
                        {log.resourceId && (
                          <span
                            style={{
                              marginLeft: '0.375rem',
                              fontSize: '0.7rem',
                              color: '#9ca3af',
                              fontFamily: 'monospace',
                            }}
                          >
                            {log.resourceId.slice(0, 8)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
