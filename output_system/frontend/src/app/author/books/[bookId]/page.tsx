/**
 * @file author/books/[bookId]/page.tsx
 * @description 著者向け書籍詳細・編集画面（A4）
 *
 * 特定の書籍の詳細情報を表示し、以下の操作を提供する。
 *
 * 機能:
 * - 書籍情報の表示（タイトル・説明・形式・ファイルサイズ・登録日・更新日）
 * - タイトル・説明・ステータスの編集・保存
 * - 書籍削除（確認ダイアログ付き）
 * - 一覧画面への戻るボタン
 *
 * セキュリティ:
 * - authorロールのみアクセス可能
 * - 他の著者の書籍はバックエンドRBACで禁止（403 Forbidden）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getToken,
  apiGetMe,
  apiGetBook,
  apiUpdateBookMetadata,
  apiDeleteBook,
  AuthUser,
  Book,
  ApiError,
} from '../../../../lib/api';
import { getStatusStyle, formatFileSize } from '../../../../components/book/BookCard';

/**
 * フォームの入力値を管理するインターフェース
 */
interface EditFormValues {
  /** 書籍タイトル */
  title: string;
  /** 書籍説明 */
  description: string;
  /** ステータス */
  status: Book['status'];
}

/**
 * 著者向け書籍詳細・編集画面コンポーネント（A4: 書籍詳細・編集）
 *
 * URLパラメータから書籍IDを取得し、書籍情報を表示・編集する。
 * 保存時はPUT /api/books/:idを呼び出してメタデータを更新する。
 *
 * @returns {JSX.Element} 書籍詳細・編集画面
 */
export default function BookDetailPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.bookId as string;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 編集フォームの状態
  const [formValues, setFormValues] = useState<EditFormValues>({
    title: '',
    description: '',
    status: 'draft',
  });

  // 保存処理中フラグ
  const [isSaving, setIsSaving] = useState(false);
  // 削除処理中フラグ
  const [isDeleting, setIsDeleting] = useState(false);
  // 保存成功メッセージ
  const [saveSuccess, setSaveSuccess] = useState(false);

  // マウント時に認証状態と書籍詳細を取得する
  useEffect(() => {
    async function loadData() {
      const token = getToken();
      if (!token) {
        // 未ログインはログイン画面にリダイレクト
        router.push('/admin/login');
        return;
      }

      try {
        const [meResult, bookResult] = await Promise.all([
          apiGetMe(),
          apiGetBook(bookId),
        ]);

        // authorロール以外はアクセス不可
        if (meResult.user.role !== 'author') {
          router.push('/admin/login');
          return;
        }

        setUser(meResult.user);
        setBook(bookResult.book);

        // フォームの初期値を書籍情報でセット
        setFormValues({
          title: bookResult.book.title,
          description: bookResult.book.description || '',
          status: bookResult.book.status,
        });
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/admin/login');
        } else if (apiError.statusCode === 403) {
          // 他の著者の書籍にアクセスしようとした場合
          setError('この書籍にアクセスする権限がありません');
          setIsLoading(false);
        } else if (apiError.statusCode === 404) {
          setError('書籍が見つかりません');
          setIsLoading(false);
        } else {
          setError('データの読み込みに失敗しました');
          setIsLoading(false);
        }
        return;
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [router, bookId]);

  /**
   * フォーム送信処理（書籍情報の更新）
   * タイトル・説明・ステータスをバックエンドAPIで更新する
   *
   * @param e - フォームのsubmitイベント
   */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!formValues.title.trim()) {
      setError('タイトルは必須です');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const result = await apiUpdateBookMetadata(bookId, {
        title: formValues.title,
        description: formValues.description || undefined,
        status: formValues.status,
      });

      // 保存成功後は表示データを更新
      setBook(result.book);
      setSaveSuccess(true);

      // 3秒後に成功メッセージを非表示にする
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const apiError = err as ApiError;
      setError(`保存に失敗しました: ${apiError.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * 書籍削除処理
   * 確認ダイアログを表示してから削除を実行する
   * 削除後は一覧画面に戻る
   */
  async function handleDelete() {
    if (!book) return;

    // 復元不可のため確認ダイアログを必ず表示する
    if (!window.confirm(
      `「${book.title}」を削除しますか？\n\nこの操作は取り消せません。\nS3に保存されたファイルも同時に削除されます。`
    )) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiDeleteBook(bookId);
      // 削除成功後は一覧画面に戻る
      router.push('/author/books');
    } catch (err) {
      const apiError = err as ApiError;
      setError(`削除に失敗しました: ${apiError.message}`);
      setIsDeleting(false);
    }
  }

  /**
   * ログアウト処理
   */
  async function handleLogout() {
    const { apiLogout } = await import('../../../../lib/api');
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

  // エラー状態（書籍が見つからない等）
  if (error && !book) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <header
          style={{
            backgroundColor: '#fff',
            borderBottom: '1px solid #e5e7eb',
            padding: '1rem 2rem',
          }}
        >
          <button
            onClick={() => router.push('/author/books')}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            ← 書籍一覧に戻る
          </button>
        </header>
        <main style={{ maxWidth: '800px', margin: '4rem auto', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <p style={{ color: '#374151', fontSize: '1rem' }}>{error}</p>
        </main>
      </div>
    );
  }

  const statusStyle = book ? getStatusStyle(book.status) : null;

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
        {/* 戻るボタン */}
        <button
          onClick={() => router.push('/author/books')}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          ← 書籍一覧に戻る
        </button>

        {/* ユーザー情報・ログアウト */}
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
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        {/* ページタイトル */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            書籍詳細・編集
          </h1>
          {book && (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              書籍ID: {book.id}
            </p>
          )}
        </div>

        {/* 書籍メタ情報（読み取り専用） */}
        {book && (
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: '1.5rem',
            }}
          >
            <h2
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              書籍情報
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* ファイル形式 */}
              <div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  ファイル形式
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>
                    {book.format === 'pdf' ? '📕' : '📗'}
                  </span>
                  <span style={{ fontWeight: '600', color: '#111827' }}>
                    {book.format.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* ファイルサイズ */}
              <div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  ファイルサイズ
                </p>
                <p style={{ fontWeight: '500', color: '#111827' }}>
                  {formatFileSize(book.fileSize)}
                </p>
              </div>

              {/* 現在のステータス（バッジ表示） */}
              <div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  現在のステータス
                </p>
                {statusStyle && (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: '600',
                      color: statusStyle.color,
                      backgroundColor: statusStyle.bg,
                      padding: '0.125rem 0.625rem',
                      borderRadius: '4px',
                    }}
                  >
                    {statusStyle.label}
                  </span>
                )}
              </div>

              {/* 登録日 */}
              <div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  登録日
                </p>
                <p style={{ fontWeight: '500', color: '#111827' }}>
                  {new Date(book.createdAt).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* 最終更新日 */}
              <div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  最終更新日
                </p>
                <p style={{ fontWeight: '500', color: '#111827' }}>
                  {new Date(book.updatedAt).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 編集フォーム */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '1.5rem',
          }}
        >
          <h2
            style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '1.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            編集
          </h2>

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

          {/* 保存成功メッセージ */}
          {saveSuccess && (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                color: '#166534',
                fontSize: '0.875rem',
              }}
            >
              保存しました
            </div>
          )}

          <form onSubmit={handleSave}>
            {/* タイトル入力 */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="book-title"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                タイトル <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="book-title"
                type="text"
                value={formValues.title}
                onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="書籍タイトルを入力"
                maxLength={200}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  color: '#111827',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563eb';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* 説明入力 */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="book-description"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                説明
              </label>
              <textarea
                id="book-description"
                value={formValues.description}
                onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="書籍の説明を入力（オプション）"
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  color: '#111827',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563eb';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* ステータス変更 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                ステータス
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* 下書き */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    border: `2px solid ${formValues.status === 'draft' ? '#d97706' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formValues.status === 'draft' ? '#fffbeb' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value="draft"
                    checked={formValues.status === 'draft'}
                    onChange={() => setFormValues((prev) => ({ ...prev, status: 'draft' }))}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: '1rem' }}>✏️</span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: formValues.status === 'draft' ? '600' : '400',
                      color: formValues.status === 'draft' ? '#92400e' : '#374151',
                    }}
                  >
                    下書き
                  </span>
                </label>

                {/* 公開中 */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    border: `2px solid ${formValues.status === 'published' ? '#059669' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formValues.status === 'published' ? '#f0fdf4' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value="published"
                    checked={formValues.status === 'published'}
                    onChange={() => setFormValues((prev) => ({ ...prev, status: 'published' }))}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: '1rem' }}>🌐</span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: formValues.status === 'published' ? '600' : '400',
                      color: formValues.status === 'published' ? '#065f46' : '#374151',
                    }}
                  >
                    公開中
                  </span>
                </label>

                {/* アーカイブ */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    border: `2px solid ${formValues.status === 'archived' ? '#6b7280' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formValues.status === 'archived' ? '#f3f4f6' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value="archived"
                    checked={formValues.status === 'archived'}
                    onChange={() => setFormValues((prev) => ({ ...prev, status: 'archived' }))}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: '1rem' }}>📦</span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: formValues.status === 'archived' ? '600' : '400',
                      color: formValues.status === 'archived' ? '#374151' : '#374151',
                    }}
                  >
                    アーカイブ
                  </span>
                </label>
              </div>
            </div>

            {/* 保存ボタン */}
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: isSaving ? '#93c5fd' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '0.9375rem',
                fontWeight: '500',
              }}
            >
              {isSaving ? '保存中...' : '変更を保存'}
            </button>
          </form>
        </div>

        {/* 危険ゾーン（削除） */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #fecaca',
          }}
        >
          <h2
            style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#dc2626',
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            危険ゾーン
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            書籍を削除すると、S3に保存されたファイルも同時に削除されます。この操作は取り消せません。
          </p>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: isDeleting ? '#f3f4f6' : '#fff',
              color: '#dc2626',
              border: '1px solid #dc2626',
              borderRadius: '8px',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? '削除中...' : 'この書籍を削除する'}
          </button>
        </div>
      </main>
    </div>
  );
}
