/**
 * @file admin/books/page.tsx
 * @description 全書籍管理画面（管理者向け）
 *
 * 全著者の書籍を一覧・検索・フィルタリングして表示する。
 * 書籍タイトルのクリックで詳細画面に遷移する。
 *
 * 画面要件（S4: 書籍管理）:
 * - 全書籍一覧の表示（著者情報含む）
 * - タイトルによる部分一致検索
 * - ステータスによるフィルタリング
 * - ページネーション
 * - 書籍詳細画面へのリンク
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  apiGetMe,
  apiLogout,
  apiGetAdminBooks,
  AdminBookInfo,
} from '../../../lib/api';
import Sidebar from '../../../components/layout/Sidebar';

/**
 * ステータスバッジコンポーネント
 * ステータスに応じた色のバッジを表示する
 */
function StatusBadge({ status }: { status: 'draft' | 'published' | 'archived' }) {
  /** ステータスに対応するスタイルを定義する */
  const styles: Record<typeof status, { bg: string; text: string; label: string }> = {
    draft: { bg: '#fef9c3', text: '#92400e', label: '下書き' },
    published: { bg: '#dcfce7', text: '#166534', label: '公開中' },
    archived: { bg: '#f1f5f9', text: '#475569', label: 'アーカイブ' },
  };
  const style = styles[status];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {style.label}
    </span>
  );
}

/**
 * ファイルサイズを人間が読みやすい形式に変換する
 *
 * @param bytes - バイト数（nullの場合は'-'を返す）
 * @returns 人間が読みやすいサイズ文字列
 */
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 全書籍管理画面コンポーネント
 *
 * @returns 書籍管理画面 JSX 要素
 */
export default function AdminBooksPage() {
  const router = useRouter();
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [books, setBooks] = useState<AdminBookInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 検索・フィルタ状態
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');

  // ページネーション状態
  const [page, setPage] = useState(1);
  const LIMIT = 20;

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
          router.push('/admin/login');
          return;
        }
      } catch {
        router.push('/admin/login');
        return;
      } finally {
        setIsAuthLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  /**
   * 書籍一覧を取得する
   * 検索・フィルタ・ページが変わるたびに再取得する
   */
  const loadBooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiGetAdminBooks({
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: LIMIT,
      });
      setBooks(result.books);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load books:', err);
      setError('書籍一覧の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, page]);

  // 認証完了後に書籍一覧を取得する
  useEffect(() => {
    if (!isAuthLoading) {
      loadBooks();
    }
  }, [isAuthLoading, loadBooks]);

  /**
   * 検索フォームのサブミット処理
   * 検索後はページを1に戻す
   */
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  /**
   * ステータスフィルタ変更処理
   * フィルタ変更後はページを1に戻す
   */
  function handleStatusChange(newStatus: typeof statusFilter) {
    setStatusFilter(newStatus);
    setPage(1);
  }

  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

  // 総ページ数を計算する
  const totalPages = Math.ceil(total / LIMIT);

  if (isAuthLoading) {
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
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              書籍管理
            </h1>
            <p style={{ color: '#6b7280', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              全著者の書籍を管理します
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

        {/* 検索・フィルタエリア */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* 検索フォーム */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="タイトルで検索..."
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap',
              }}
            >
              検索
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                クリア
              </button>
            )}
          </form>

          {/* ステータスフィルタ */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['all', 'draft', 'published', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: statusFilter === s ? '600' : '400',
                  backgroundColor: statusFilter === s ? '#2563eb' : '#fff',
                  color: statusFilter === s ? '#fff' : '#6b7280',
                  borderColor: statusFilter === s ? '#2563eb' : '#d1d5db',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'all' ? 'すべて' : s === 'draft' ? '下書き' : s === 'published' ? '公開中' : 'アーカイブ'}
              </button>
            ))}
          </div>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              color: '#dc2626',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* 件数表示 */}
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          {isLoading ? '読み込み中...' : `${total} 件の書籍`}
          {search && ` (「${search}」で検索)`}
        </p>

        {/* 書籍一覧テーブル */}
        {isLoading ? (
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            読み込み中...
          </div>
        ) : books.length === 0 ? (
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            書籍が見つかりません
          </div>
        ) : (
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
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    タイトル
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    著者
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    形式
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    ステータス
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    ファイルサイズ
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                    登録日
                  </th>
                </tr>
              </thead>
              <tbody>
                {books.map((book, index) => (
                  <tr
                    key={book.id}
                    style={{
                      borderBottom: index < books.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* タイトル（詳細画面へのリンク） */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        href={`/admin/books/${book.id}`}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: '500',
                        }}
                      >
                        {book.title}
                      </Link>
                    </td>
                    {/* 著者名 */}
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>
                      <span>{book.authorName}</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af' }}>
                        {book.authorEmail}
                      </span>
                    </td>
                    {/* ファイル形式 */}
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280', textTransform: 'uppercase' }}>
                      {book.format}
                    </td>
                    {/* ステータス */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <StatusBadge status={book.status} />
                    </td>
                    {/* ファイルサイズ */}
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>
                      {formatFileSize(book.fileSize)}
                    </td>
                    {/* 登録日 */}
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(book.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ページネーション */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '1.5rem',
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: '#fff',
                color: page === 1 ? '#9ca3af' : '#374151',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              前へ
            </button>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: '#fff',
                color: page === totalPages ? '#9ca3af' : '#374151',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              次へ
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
