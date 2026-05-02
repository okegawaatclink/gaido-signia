/**
 * @file admin/authors/page.tsx
 * @description 著者一覧画面
 *
 * 管理者が著者アカウントの一覧を確認し、
 * 著者の詳細・編集・無効化を行うエントリーポイント。
 *
 * 機能:
 * - 著者一覧をテーブル形式で表示（名前・メール・有効/無効・登録日）
 * - 新規著者作成ボタン
 * - 著者詳細ページへのリンク
 * - 著者アカウントの無効化（確認ダイアログ付き）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  apiGetMe,
  apiGetAuthors,
  apiDeactivateAuthor,
  AuthorInfo,
  ApiError,
} from '../../../lib/api';
import Sidebar from '../../../components/layout/Sidebar';

/**
 * 著者一覧画面コンポーネント
 *
 * @returns {JSX.Element} 著者一覧画面
 */
export default function AuthorsPage() {
  const router = useRouter();
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  // マウント時に認証状態確認と著者一覧を取得する
  useEffect(() => {
    async function init() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        // 認証状態と admin ロール確認
        const meResult = await apiGetMe();
        if (meResult.user.role !== 'admin') {
          router.push('/admin/login');
          return;
        }

        // 著者一覧取得
        const result = await apiGetAuthors();
        setAuthors(result.authors);
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.statusCode === 401 || apiErr.statusCode === 403) {
          router.push('/admin/login');
        } else {
          setError('著者一覧の取得に失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  /**
   * 著者アカウント無効化ハンドラー
   * 確認ダイアログを表示し、確認後に無効化 API を呼び出す
   *
   * @param authorId - 無効化する著者の ID
   * @param authorName - 著者名（確認ダイアログ用）
   */
  async function handleDeactivate(authorId: string, authorName: string) {
    // 確認ダイアログを表示（誤操作防止）
    const confirmed = window.confirm(
      `「${authorName}」のアカウントを無効化しますか？\n無効化すると、この著者はログインできなくなります。`
    );
    if (!confirmed) return;

    setDeactivatingId(authorId);
    try {
      await apiDeactivateAuthor(authorId);
      // 無効化成功: 一覧を更新
      setAuthors((prev) =>
        prev.map((a) => (a.id === authorId ? { ...a, isActive: false } : a))
      );
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || '無効化に失敗しました');
    } finally {
      setDeactivatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#6b7280' }}>読み込み中...</p>
        </main>
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
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              著者管理
            </h1>
            <p style={{ color: '#6b7280', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              著者アカウントの作成・編集・無効化を行います
            </p>
          </div>
          {/* 新規著者作成ボタン */}
          <Link
            href="/admin/authors/new"
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '0.9rem',
            }}
          >
            + 新規著者を追加
          </Link>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        {/* 著者一覧テーブル */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {authors.length === 0 ? (
            // 著者が存在しない場合の空状態
            <div
              style={{
                padding: '3rem',
                textAlign: 'center',
                color: '#9ca3af',
              }}
            >
              <p style={{ fontSize: '1rem' }}>著者アカウントがまだありません</p>
              <Link
                href="/admin/authors/new"
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                最初の著者を追加
              </Link>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th
                    style={{
                      padding: '0.875rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    名前
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    メールアドレス
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1rem',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ステータス
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    登録日
                  </th>
                  <th
                    style={{
                      padding: '0.875rem 1rem',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {authors.map((author, index) => (
                  <tr
                    key={author.id}
                    style={{
                      borderBottom:
                        index < authors.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* 名前（著者詳細へのリンク） */}
                    <td style={{ padding: '1rem' }}>
                      <Link
                        href={`/admin/authors/${author.id}`}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: '500',
                        }}
                      >
                        {author.name}
                      </Link>
                    </td>
                    {/* メールアドレス */}
                    <td style={{ padding: '1rem', color: '#374151', fontSize: '0.9rem' }}>
                      {author.email}
                    </td>
                    {/* ステータスバッジ */}
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.625rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          backgroundColor: author.isActive ? '#dcfce7' : '#fee2e2',
                          color: author.isActive ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {author.isActive ? '有効' : '無効'}
                      </span>
                    </td>
                    {/* 登録日 */}
                    <td style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                      {new Date(author.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    {/* 操作ボタン */}
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {/* 詳細・編集ボタン */}
                        <Link
                          href={`/admin/authors/${author.id}`}
                          style={{
                            padding: '0.375rem 0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: '#fff',
                            color: '#374151',
                            textDecoration: 'none',
                            fontSize: '0.8rem',
                          }}
                        >
                          詳細
                        </Link>
                        {/* 無効化ボタン（有効な著者のみ表示） */}
                        {author.isActive && (
                          <button
                            onClick={() => handleDeactivate(author.id, author.name)}
                            disabled={deactivatingId === author.id}
                            style={{
                              padding: '0.375rem 0.75rem',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              backgroundColor: '#fff',
                              color: '#dc2626',
                              cursor: deactivatingId === author.id ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              opacity: deactivatingId === author.id ? 0.6 : 1,
                            }}
                          >
                            {deactivatingId === author.id ? '処理中...' : '無効化'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 著者数サマリー */}
        {authors.length > 0 && (
          <p style={{ marginTop: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
            合計 {authors.length} 件（有効: {authors.filter((a) => a.isActive).length} 件、
            無効: {authors.filter((a) => !a.isActive).length} 件）
          </p>
        )}
      </main>
    </div>
  );
}
