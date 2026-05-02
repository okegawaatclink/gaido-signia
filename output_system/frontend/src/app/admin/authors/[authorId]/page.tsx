/**
 * @file admin/authors/[authorId]/page.tsx
 * @description 著者詳細・編集画面
 *
 * 管理者が著者の詳細情報を確認し、編集・無効化を行う画面。
 *
 * 機能:
 * - 著者情報の表示（名前・メール・有効/無効・登録日）
 * - 著者情報の編集（名前・メールアドレス・有効/無効フラグ）
 * - 著者アカウントの無効化（確認ダイアログ付き）
 * - 著者が登録した書籍一覧の表示（読み取り専用）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  apiGetMe,
  apiGetAuthor,
  apiUpdateAuthor,
  apiDeactivateAuthor,
  AuthorDetail,
  ApiError,
} from '../../../../lib/api';
import Sidebar from '../../../../components/layout/Sidebar';

/**
 * 著者詳細・編集画面コンポーネント
 *
 * @returns {JSX.Element} 著者詳細・編集画面
 */
export default function AuthorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const authorId = params.authorId as string;

  const [author, setAuthor] = useState<AuthorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 編集フォームの状態
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // マウント時に認証確認と著者詳細を取得する
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

        // 著者詳細取得
        const result = await apiGetAuthor(authorId);
        setAuthor(result.author);
        // 編集フォームの初期値を設定
        setEditName(result.author.name);
        setEditEmail(result.author.email);
        setEditIsActive(result.author.isActive);
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.statusCode === 401 || apiErr.statusCode === 403) {
          router.push('/admin/login');
        } else if (apiErr.statusCode === 404) {
          setError('著者が見つかりませんでした');
        } else {
          setError('著者詳細の取得に失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router, authorId]);

  /**
   * 編集モードを開始する
   * 現在の著者情報でフォームを初期化する
   */
  function startEditing() {
    if (!author) return;
    setEditName(author.name);
    setEditEmail(author.email);
    setEditIsActive(author.isActive);
    setIsEditing(true);
    setError(null);
    setSuccessMessage(null);
  }

  /**
   * 編集をキャンセルする
   */
  function cancelEditing() {
    setIsEditing(false);
    setError(null);
  }

  /**
   * 著者情報を保存するハンドラー
   * 変更されたフィールドのみ PUT リクエストを送信する
   */
  async function handleSave() {
    if (!author) return;

    // クライアントサイドバリデーション
    if (!editName.trim()) {
      setError('名前は必須です');
      return;
    }
    if (!editEmail.trim()) {
      setError('メールアドレスは必須です');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await apiUpdateAuthor(authorId, {
        name: editName.trim(),
        email: editEmail.trim(),
        isActive: editIsActive,
      });
      // 成功: 著者情報を更新して編集モードを終了
      setAuthor({ ...result.author, books: author.books });
      setIsEditing(false);
      setSuccessMessage('著者情報を更新しました');
      // 3 秒後に成功メッセージを消す
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || '更新に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * 著者アカウント無効化ハンドラー
   * 確認ダイアログを表示し、確認後に無効化 API を呼び出す
   */
  async function handleDeactivate() {
    if (!author) return;

    const confirmed = window.confirm(
      `「${author.name}」のアカウントを無効化しますか？\n無効化すると、この著者はログインできなくなります。`
    );
    if (!confirmed) return;

    setIsDeactivating(true);
    setError(null);

    try {
      const result = await apiDeactivateAuthor(authorId);
      setAuthor({ ...result.author, books: author.books });
      setSuccessMessage('著者アカウントを無効化しました');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || '無効化に失敗しました');
    } finally {
      setIsDeactivating(false);
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

  if (!author && error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '2rem' }}>
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
          <Link
            href="/admin/authors"
            style={{ display: 'inline-block', marginTop: '1rem', color: '#2563eb' }}
          >
            ← 著者一覧に戻る
          </Link>
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
        {/* パンくずナビゲーション */}
        <nav style={{ marginBottom: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <Link href="/admin/authors" style={{ color: '#2563eb', textDecoration: 'none' }}>
            著者管理
          </Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <span>{author?.name}</span>
        </nav>

        {/* ページヘッダー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', margin: 0 }}>
            著者詳細
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {/* 編集ボタン（編集モードでなく、著者が有効な場合のみ表示） */}
            {!isEditing && author?.isActive && (
              <button
                onClick={startEditing}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                編集
              </button>
            )}
            {/* 無効化ボタン（著者が有効な場合のみ表示） */}
            {author?.isActive && !isEditing && (
              <button
                onClick={handleDeactivate}
                disabled={isDeactivating}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  color: '#dc2626',
                  cursor: isDeactivating ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  opacity: isDeactivating ? 0.6 : 1,
                }}
              >
                {isDeactivating ? '処理中...' : '無効化'}
              </button>
            )}
          </div>
        </div>

        {/* 成功メッセージ */}
        {successMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px',
              color: '#16a34a',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {successMessage}
          </div>
        )}

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

        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
          {/* 著者情報カード */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#374151', marginBottom: '1.25rem' }}>
              著者情報
            </h2>

            {isEditing ? (
              // 編集フォーム
              <div>
                {/* 名前入力 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.375rem',
                    }}
                  >
                    名前
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* メールアドレス入力 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.375rem',
                    }}
                  >
                    メールアドレス
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* 有効/無効フラグ */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.9rem', color: '#374151' }}>アカウントを有効にする</span>
                  </label>
                </div>

                {/* 保存/キャンセルボタン */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: isSaving ? '#93c5fd' : '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                    }}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={isSaving}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      backgroundColor: '#fff',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              // 表示モード
              <dl style={{ margin: 0 }}>
                {/* 名前 */}
                <div style={{ marginBottom: '1rem' }}>
                  <dt
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}
                  >
                    名前
                  </dt>
                  <dd style={{ fontSize: '0.95rem', color: '#111827', margin: 0 }}>
                    {author?.name}
                  </dd>
                </div>
                {/* メールアドレス */}
                <div style={{ marginBottom: '1rem' }}>
                  <dt
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}
                  >
                    メールアドレス
                  </dt>
                  <dd style={{ fontSize: '0.95rem', color: '#111827', margin: 0 }}>
                    {author?.email}
                  </dd>
                </div>
                {/* ステータス */}
                <div style={{ marginBottom: '1rem' }}>
                  <dt
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}
                  >
                    ステータス
                  </dt>
                  <dd style={{ margin: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: author?.isActive ? '#dcfce7' : '#fee2e2',
                        color: author?.isActive ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {author?.isActive ? '有効' : '無効'}
                    </span>
                  </dd>
                </div>
                {/* 登録日 */}
                <div style={{ marginBottom: '1rem' }}>
                  <dt
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}
                  >
                    登録日
                  </dt>
                  <dd style={{ fontSize: '0.95rem', color: '#111827', margin: 0 }}>
                    {author?.createdAt
                      ? new Date(author.createdAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </dd>
                </div>
                {/* 更新日 */}
                <div>
                  <dt
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}
                  >
                    最終更新日
                  </dt>
                  <dd style={{ fontSize: '0.95rem', color: '#111827', margin: 0 }}>
                    {author?.updatedAt
                      ? new Date(author.updatedAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* 登録書籍一覧カード */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#374151', marginBottom: '1.25rem' }}>
              登録書籍 ({author?.books?.length ?? 0} 件)
            </h2>

            {!author?.books || author.books.length === 0 ? (
              // 書籍がない場合の空状態
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem 0' }}>
                登録された書籍はありません
              </p>
            ) : (
              <div>
                {author.books.map((book, index) => (
                  <div
                    key={book.id}
                    style={{
                      padding: '0.75rem 0',
                      borderBottom:
                        index < author.books.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* 書籍タイトルとステータス */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span style={{ fontSize: '0.9rem', color: '#111827', fontWeight: '500' }}>
                        {book.title}
                      </span>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          backgroundColor:
                            book.status === 'published'
                              ? '#dcfce7'
                              : book.status === 'draft'
                              ? '#fef3c7'
                              : '#f3f4f6',
                          color:
                            book.status === 'published'
                              ? '#16a34a'
                              : book.status === 'draft'
                              ? '#b45309'
                              : '#6b7280',
                          flexShrink: 0,
                          marginLeft: '0.5rem',
                        }}
                      >
                        {book.status === 'published'
                          ? '公開中'
                          : book.status === 'draft'
                          ? '下書き'
                          : 'アーカイブ'}
                      </span>
                    </div>
                    {/* 書籍メタ情報 */}
                    <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        形式: {book.format?.toUpperCase() ?? '-'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        登録: {new Date(book.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 著者一覧に戻るリンク */}
        <div style={{ marginTop: '1.5rem' }}>
          <Link
            href="/admin/authors"
            style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}
          >
            ← 著者一覧に戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
