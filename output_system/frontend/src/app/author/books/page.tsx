/**
 * @file author/books/page.tsx
 * @description 著者向け書籍一覧画面
 *
 * 著者が登録した書籍の一覧を表示する画面。
 * 書籍の登録・編集・削除操作へのエントリポイント。
 *
 * 機能:
 * - 書籍一覧の表示（タイトル・形式・ステータス・登録日）
 * - 新規書籍登録ページへのリンク
 * - ログアウト
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, apiGetMe, apiLogout, apiGetBooks, apiDeleteBook, AuthUser, Book, ApiError } from '../../../lib/api';

/**
 * ファイルサイズを人間が読みやすい形式に変換する
 *
 * @param bytes - バイト数（null可）
 * @returns フォーマットされたファイルサイズ文字列
 */
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 書籍ステータスの表示ラベルを返す
 *
 * @param status - 書籍ステータス
 * @returns 表示用ラベル
 */
function getStatusLabel(status: Book['status']): { label: string; color: string; bg: string } {
  switch (status) {
    case 'draft': return { label: '下書き', color: '#92400e', bg: '#fef3c7' };
    case 'published': return { label: '公開中', color: '#065f46', bg: '#d1fae5' };
    case 'archived': return { label: 'アーカイブ', color: '#374151', bg: '#f3f4f6' };
    default: return { label: status, color: '#374151', bg: '#f3f4f6' };
  }
}

/**
 * 著者向け書籍一覧コンポーネント
 *
 * @returns {JSX.Element} 書籍一覧画面
 */
export default function AuthorBooks() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // マウント時に認証状態と書籍一覧を取得する
  useEffect(() => {
    async function loadData() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        const [meResult, booksResult] = await Promise.all([
          apiGetMe(),
          apiGetBooks(),
        ]);

        if (meResult.user.role !== 'author') {
          // authorロール以外はアクセス不可
          router.push('/admin/login');
          return;
        }

        setUser(meResult.user);
        setBooks(booksResult.books);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/admin/login');
        } else {
          setError('データの読み込みに失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [router]);

  /**
   * ログアウト処理
   */
  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

  /**
   * 書籍削除処理
   * 確認ダイアログを表示してから削除を実行する
   *
   * @param book - 削除する書籍
   */
  async function handleDeleteBook(book: Book) {
    if (!window.confirm(`「${book.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setDeletingId(book.id);
    try {
      await apiDeleteBook(book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    } catch (err) {
      const apiError = err as ApiError;
      alert(`削除に失敗しました: ${apiError.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* ヘッダー */}
      <header style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>書籍管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {user?.name}（著者）
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #dc2626',
              borderRadius: '6px',
              background: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* アクションバー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {books.length}件の書籍
          </p>
          <button
            onClick={() => router.push('/author/books/new')}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            + 書籍を登録する
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {/* 書籍一覧 */}
        {books.length === 0 ? (
          /* 書籍がない場合の空状態 */
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '4rem 2rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
            <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
              まだ書籍が登録されていません
            </p>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              PDFまたはEPUBファイルをアップロードして書籍を登録しましょう
            </p>
            <button
              onClick={() => router.push('/author/books/new')}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
              }}
            >
              最初の書籍を登録する
            </button>
          </div>
        ) : (
          /* 書籍カードリスト */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {books.map((book) => {
              const statusInfo = getStatusLabel(book.status);
              return (
                <div
                  key={book.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    padding: '1.25rem 1.5rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                    {/* ファイル形式アイコン */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: book.format === 'pdf' ? '#fef3c7' : '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      flexShrink: 0,
                    }}>
                      {book.format === 'pdf' ? '📕' : '📗'}
                    </div>

                    {/* 書籍情報 */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                        color: '#111827',
                        marginBottom: '0.25rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {book.title}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {book.format.toUpperCase()} • {formatFileSize(book.fileSize)}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: statusInfo.color,
                          backgroundColor: statusInfo.bg,
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                        }}>
                          {statusInfo.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {new Date(book.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* アクションボタン */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleDeleteBook(book)}
                      disabled={deletingId === book.id}
                      style={{
                        padding: '0.375rem 0.875rem',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        backgroundColor: deletingId === book.id ? '#f3f4f6' : '#fff',
                        color: '#ef4444',
                        cursor: deletingId === book.id ? 'not-allowed' : 'pointer',
                        fontSize: '0.8125rem',
                        opacity: deletingId === book.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === book.id ? '削除中...' : '削除'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
