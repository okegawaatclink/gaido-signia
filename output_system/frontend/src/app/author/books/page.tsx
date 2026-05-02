/**
 * @file author/books/page.tsx
 * @description 著者向け書籍一覧画面（A2）
 *
 * 著者が登録した書籍の一覧をカード形式で表示する画面。
 * 書籍の登録・詳細閲覧・削除操作へのエントリポイント。
 *
 * 機能:
 * - 書籍一覧のカードグリッド表示（表紙サムネイル・タイトル・ステータス）
 * - 新規書籍登録ページへのリンク
 * - 書籍詳細・編集ページへのナビゲーション
 * - 書籍削除（確認ダイアログ付き）
 * - ログアウト
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, apiGetMe, apiLogout, apiGetBooks, apiDeleteBook, AuthUser, Book, ApiError } from '../../../lib/api';
import { BookList } from '../../../components/book/BookList';

/**
 * 著者向け書籍一覧コンポーネント（A2: 書籍一覧）
 *
 * ログイン状態を確認して著者ロール以外のアクセスをリダイレクトする。
 * BookList コンポーネントを使用してカードグリッドで書籍を表示する。
 *
 * @returns {JSX.Element} 書籍一覧画面
 */
export default function AuthorBooks() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 削除処理中の書籍ID（nullは処理なし）
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // マウント時に認証状態と書籍一覧を取得する
  useEffect(() => {
    async function loadData() {
      const token = getToken();
      if (!token) {
        // 未ログインはログイン画面にリダイレクト
        router.push('/admin/login');
        return;
      }

      try {
        const [meResult, booksResult] = await Promise.all([
          apiGetMe(),
          apiGetBooks(),
        ]);

        // authorロール以外はアクセス不可（RBAC）
        if (meResult.user.role !== 'author') {
          router.push('/admin/login');
          return;
        }

        setUser(meResult.user);
        setBooks(booksResult.books);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          // 認証エラーはログイン画面へ
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
   * JWTトークンを削除してログイン画面にリダイレクトする
   */
  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

  /**
   * 書籍削除処理
   * 確認ダイアログを表示してから削除を実行する
   * 削除後は一覧からリアクティブに除去する
   *
   * @param book - 削除する書籍オブジェクト
   */
  async function handleDeleteBook(book: Book) {
    // 復元不可のため確認ダイアログを必ず表示する
    if (!window.confirm(`「${book.title}」を削除しますか？\n\nこの操作は取り消せません。\nS3に保存されたファイルも同時に削除されます。`)) {
      return;
    }

    setDeletingId(book.id);
    try {
      await apiDeleteBook(book.id);
      // 削除成功後、一覧からリアクティブに除去
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    } catch (err) {
      const apiError = err as ApiError;
      alert(`削除に失敗しました: ${apiError.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  /**
   * 書籍詳細・編集画面へ遷移する
   *
   * @param bookId - 遷移先の書籍ID
   */
  function handleViewDetail(bookId: string) {
    router.push(`/author/books/${bookId}`);
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
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
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
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* 書籍リスト（BookListコンポーネント） */}
        <BookList
          books={books}
          onViewDetail={handleViewDetail}
          onDelete={handleDeleteBook}
          deletingId={deletingId}
          onCreateNew={() => router.push('/author/books/new')}
        />
      </main>
    </div>
  );
}
