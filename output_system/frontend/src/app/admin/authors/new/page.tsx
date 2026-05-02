/**
 * @file admin/authors/new/page.tsx
 * @description 著者アカウント新規作成画面
 *
 * 管理者が新しい著者アカウントを作成するフォーム画面。
 *
 * 機能:
 * - メールアドレス・名前・初期パスワードの入力フォーム
 * - フロントエンドバリデーション（必須チェック・メール形式・パスワード長）
 * - 作成成功後に著者一覧画面にリダイレクト
 * - API エラー（メール重複等）のインライン表示
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, apiGetMe, apiCreateAuthor, ApiError } from '../../../../lib/api';
import Sidebar from '../../../../components/layout/Sidebar';

/**
 * フォーム入力値の型定義
 */
interface FormData {
  email: string;
  name: string;
  password: string;
  passwordConfirm: string;
}

/**
 * フォームバリデーションエラーの型定義
 */
interface FormErrors {
  email?: string;
  name?: string;
  password?: string;
  passwordConfirm?: string;
}

/**
 * 著者アカウント新規作成画面コンポーネント
 *
 * @returns {JSX.Element} 著者作成フォーム画面
 */
export default function NewAuthorPage() {
  const router = useRouter();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    email: '',
    name: '',
    password: '',
    passwordConfirm: '',
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // 認証状態確認
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        const meResult = await apiGetMe();
        if (meResult.user.role !== 'admin') {
          router.push('/admin/login');
          return;
        }
      } catch {
        router.push('/admin/login');
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  /**
   * フォーム入力値を変更するハンドラー
   *
   * @param field - 変更するフィールド名
   * @param value - 新しい値
   */
  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 入力時にそのフィールドのエラーをクリア
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    setApiError(null);
  }

  /**
   * フォームのバリデーションを実行する
   *
   * @returns バリデーションが通った場合は true
   */
  function validate(): boolean {
    const errors: FormErrors = {};

    // メールアドレス検証
    if (!formData.email.trim()) {
      errors.email = 'メールアドレスは必須です';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '有効なメールアドレスを入力してください';
    }

    // 名前検証
    if (!formData.name.trim()) {
      errors.name = '名前は必須です';
    } else if (formData.name.trim().length > 100) {
      errors.name = '名前は 100 文字以内で入力してください';
    }

    // パスワード検証
    if (!formData.password) {
      errors.password = 'パスワードは必須です';
    } else if (formData.password.length < 8) {
      errors.password = 'パスワードは 8 文字以上で入力してください';
    }

    // パスワード確認検証
    if (!formData.passwordConfirm) {
      errors.passwordConfirm = 'パスワード確認は必須です';
    } else if (formData.password !== formData.passwordConfirm) {
      errors.passwordConfirm = 'パスワードが一致しません';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /**
   * フォーム送信ハンドラー
   * バリデーション後に著者アカウント作成 API を呼び出す
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    try {
      await apiCreateAuthor(formData.email.trim(), formData.name.trim(), formData.password);
      // 作成成功: 著者一覧画面にリダイレクト
      router.push('/admin/authors');
    } catch (err) {
      const apiErr = err as ApiError;
      setApiError(apiErr.message || '著者アカウントの作成に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthChecking) {
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
        {/* パンくずナビゲーション */}
        <nav style={{ marginBottom: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <Link href="/admin/authors" style={{ color: '#2563eb', textDecoration: 'none' }}>
            著者管理
          </Link>
          <span style={{ margin: '0 0.5rem' }}>/</span>
          <span>新規著者を追加</span>
        </nav>

        {/* ページヘッダー */}
        <h1 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
          新規著者を追加
        </h1>

        {/* 作成フォームカード */}
        <div
          style={{
            maxWidth: '520px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          {/* API エラーメッセージ */}
          {apiError && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
              }}
            >
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* メールアドレス入力 */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                メールアドレス <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="author@example.com"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: `1px solid ${formErrors.email ? '#fca5a5' : '#d1d5db'}`,
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.email && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {formErrors.email}
                </p>
              )}
            </div>

            {/* 名前入力 */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="name"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                名前 <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="山田 太郎"
                maxLength={100}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: `1px solid ${formErrors.name ? '#fca5a5' : '#d1d5db'}`,
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.name && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {formErrors.name}
                </p>
              )}
            </div>

            {/* パスワード入力 */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                初期パスワード <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="8文字以上"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: `1px solid ${formErrors.password ? '#fca5a5' : '#d1d5db'}`,
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.password && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {formErrors.password}
                </p>
              )}
            </div>

            {/* パスワード確認入力 */}
            <div style={{ marginBottom: '1.75rem' }}>
              <label
                htmlFor="passwordConfirm"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.375rem',
                }}
              >
                パスワード確認 <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="passwordConfirm"
                type="password"
                value={formData.passwordConfirm}
                onChange={(e) => handleChange('passwordConfirm', e.target.value)}
                placeholder="パスワードを再入力"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  border: `1px solid ${formErrors.passwordConfirm ? '#fca5a5' : '#d1d5db'}`,
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.passwordConfirm && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {formErrors.passwordConfirm}
                </p>
              )}
            </div>

            {/* フォーム操作ボタン */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {/* 作成ボタン */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: isSubmitting ? '#93c5fd' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '作成中...' : '著者アカウントを作成'}
              </button>
              {/* キャンセルボタン */}
              <Link
                href="/admin/authors"
                style={{
                  display: 'block',
                  padding: '0.75rem 1.25rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  color: '#374151',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                キャンセル
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
