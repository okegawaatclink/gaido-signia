/**
 * @file admin/books/[bookId]/page.tsx
 * @description 書籍詳細画面（管理者向け）
 *
 * 指定された書籍の詳細情報を表示する（読み取り専用）。
 * 書籍情報・著者情報・ファンアクセス数を表示する。
 *
 * 画面要件（S5: 書籍詳細）:
 * - 書籍タイトル・説明・形式・ステータス
 * - ファイルサイズ・ページ数・メタデータ
 * - 著者名・メールアドレス
 * - ファンアクセス数（何人のファンがアクセス権を持つか）
 * - 書籍管理画面への戻るボタン
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  apiGetMe,
  apiLogout,
  apiGetAdminBook,
  AdminBookDetail,
} from '../../../../lib/api';
import Sidebar from '../../../../components/layout/Sidebar';

/**
 * 情報行コンポーネント
 * ラベルと値を横並びで表示する
 */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '0.75rem 0',
        borderBottom: '1px solid #f3f4f6',
        gap: '1rem',
      }}
    >
      <dt
        style={{
          width: '150px',
          flexShrink: 0,
          fontSize: '0.875rem',
          color: '#6b7280',
          fontWeight: '500',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          flex: 1,
          fontSize: '0.875rem',
          color: '#111827',
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * ステータスバッジコンポーネント
 */
function StatusBadge({ status }: { status: 'draft' | 'published' | 'archived' }) {
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
 * 書籍詳細画面コンポーネント
 *
 * @returns 書籍詳細画面 JSX 要素
 */
export default function AdminBookDetailPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.bookId as string;

  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [book, setBook] = useState<AdminBookDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 認証完了後に書籍詳細を取得する
  useEffect(() => {
    if (!isAuthLoading && bookId) {
      loadBook();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, bookId]);

  /**
   * 書籍詳細を取得する
   */
  async function loadBook() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiGetAdminBook(bookId);
      setBook(result.book);
    } catch (err) {
      console.error('Failed to load book:', err);
      setError('書籍情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

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
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            {/* パンくずリスト */}
            <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
              <Link href="/admin/dashboard" style={{ color: '#6b7280', textDecoration: 'none' }}>
                ダッシュボード
              </Link>
              <span>/</span>
              <Link href="/admin/books" style={{ color: '#6b7280', textDecoration: 'none' }}>
                書籍管理
              </Link>
              <span>/</span>
              <span style={{ color: '#374151' }}>書籍詳細</span>
            </nav>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              {isLoading ? '読み込み中...' : book?.title || '書籍詳細'}
            </h1>
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

        {/* 戻るボタン */}
        <Link
          href="/admin/books"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            color: '#2563eb',
            textDecoration: 'none',
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
          }}
        >
          ← 書籍管理に戻る
        </Link>

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

        {/* 読み込み中 */}
        {isLoading && (
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
        )}

        {/* 書籍詳細コンテンツ */}
        {!isLoading && book && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* 書籍情報カード */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#111827',
                  marginTop: 0,
                  marginBottom: '1rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                📖 書籍情報
              </h2>
              <dl style={{ margin: 0 }}>
                <InfoRow label="タイトル" value={book.title} />
                <InfoRow
                  label="説明"
                  value={book.description || <span style={{ color: '#9ca3af' }}>なし</span>}
                />
                <InfoRow
                  label="ステータス"
                  value={<StatusBadge status={book.status} />}
                />
                <InfoRow
                  label="ファイル形式"
                  value={
                    <span style={{ textTransform: 'uppercase', fontWeight: '600' }}>
                      {book.format}
                    </span>
                  }
                />
                <InfoRow
                  label="ファイルサイズ"
                  value={formatFileSize(book.fileSize)}
                />
                <InfoRow
                  label="ページ数"
                  value={book.pageCount !== null ? `${book.pageCount} ページ` : '-'}
                />
                <InfoRow
                  label="登録日"
                  value={new Date(book.createdAt).toLocaleString('ja-JP')}
                />
                <InfoRow
                  label="更新日"
                  value={new Date(book.updatedAt).toLocaleString('ja-JP')}
                />
              </dl>
            </div>

            {/* 著者情報・アクセス情報カード */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* 著者情報 */}
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                }}
              >
                <h2
                  style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginTop: 0,
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  👤 著者情報
                </h2>
                <dl style={{ margin: 0 }}>
                  <InfoRow label="著者名" value={book.authorName} />
                  <InfoRow label="メール" value={book.authorEmail} />
                  <InfoRow
                    label="著者ID"
                    value={
                      <Link
                        href={`/admin/authors/${book.authorId}`}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                        }}
                      >
                        {book.authorId}
                      </Link>
                    }
                  />
                </dl>
              </div>

              {/* アクセス情報 */}
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                }}
              >
                <h2
                  style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginTop: 0,
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  🎉 アクセス情報
                </h2>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color: '#7c3aed',
                    }}
                  >
                    {book.fanAccessCount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    人のファンがこの書籍に<br />アクセス権を持っています
                  </div>
                </div>
              </div>

              {/* メタデータ */}
              {Object.keys(book.metadata).length > 0 && (
                <div
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '1.5rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#111827',
                      marginTop: 0,
                      marginBottom: '1rem',
                      paddingBottom: '0.75rem',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    📋 メタデータ
                  </h2>
                  <dl style={{ margin: 0 }}>
                    {Object.entries(book.metadata).map(([key, value]) => (
                      <InfoRow
                        key={key}
                        label={key}
                        value={String(value)}
                      />
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
