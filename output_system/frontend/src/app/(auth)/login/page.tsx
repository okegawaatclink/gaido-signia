/**
 * @file (auth)/login/page.tsx
 * @description ログイン画面（管理側・著者・ファン共通）
 *
 * このページでは以下の2つのログイン方式を提供する:
 *
 * 1. ソーシャルログイン（ファン向け）
 *    - Google IDでログイン: NextAuth.js + Google OAuth 2.0
 *    - Apple IDでログイン: NextAuth.js + Apple Sign In
 *    - ログイン成功後: /bookshelf へリダイレクト
 *
 * 2. メール+パスワードログイン（管理者・著者向け）
 *    - バックエンドAPI（POST /api/auth/login）に直接リクエスト
 *    - ログイン成功後: ロールに応じてリダイレクト
 *      - admin: /admin/dashboard
 *      - author: /author/books
 *
 * 設計判断:
 * - ファン向けと管理側のログインを1画面に統合
 * - ロールに応じて自動リダイレクトするため、URLは1つで管理
 * - セキュリティ向上のため管理側ログインはタブ切り替えで非表示にできる
 */

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { apiLogin, saveToken, saveOAuthToken, ApiError } from '../../../lib/api';

/**
 * アクティブなタブの種別
 * 'social': ソーシャルログイン（ファン向け）
 * 'email': メール+パスワードログイン（管理側・著者向け）
 */
type ActiveTab = 'social' | 'email';

/**
 * フォームバリデーションエラーの型定義
 */
interface FormErrors {
  email?: string;
  password?: string;
}

/**
 * メールアドレスのフォーマット検証
 *
 * @param email - 検証するメールアドレス
 * @returns 有効な形式の場合はtrue
 */
function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * ログイン画面コンポーネント
 *
 * ソーシャルログインタブとメール+パスワードログインタブを切り替えて表示する。
 *
 * @returns {JSX.Element} ログインページUI
 */
export default function LoginPage() {
  const router = useRouter();

  /** アクティブなタブ（初期値: ソーシャルログイン） */
  const [activeTab, setActiveTab] = useState<ActiveTab>('social');

  // ===== ソーシャルログイン関連の状態 =====
  /** Google/Appleログイン処理中フラグ */
  const [isSocialLoading, setIsSocialLoading] = useState<'google' | 'apple' | null>(null);
  /** ソーシャルログインエラーメッセージ */
  const [socialError, setSocialError] = useState<string | null>(null);

  // ===== メール+パスワードログイン関連の状態 =====
  /** メールアドレス入力値 */
  const [email, setEmail] = useState('');
  /** パスワード入力値 */
  const [password, setPassword] = useState('');
  /** パスワード表示/非表示フラグ */
  const [showPassword, setShowPassword] = useState(false);
  /** ログイン処理中フラグ */
  const [isLoading, setIsLoading] = useState(false);
  /** API認証失敗エラーメッセージ */
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  /** クライアントサイドバリデーションエラー */
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  /**
   * Googleでログインを実行する
   * NextAuth.jsのsignIn関数を呼び出してGoogle OAuthフローを開始する
   */
  async function handleGoogleLogin(): Promise<void> {
    setSocialError(null);
    setIsSocialLoading('google');

    try {
      // NextAuth.jsのGoogle OAuthフローを開始
      // callbackUrl: ログイン成功後のリダイレクト先（ファン向け本棚画面）
      await signIn('google', {
        callbackUrl: '/bookshelf',
        redirect: true,
      });
      // signInが正常に完了した場合はリダイレクトが発生するため、ここには到達しない
    } catch {
      setSocialError('Googleログインに失敗しました。再試行してください。');
      setIsSocialLoading(null);
    }
  }

  /**
   * Apple IDでログインを実行する
   * NextAuth.jsのsignIn関数を呼び出してApple Sign Inフローを開始する
   */
  async function handleAppleLogin(): Promise<void> {
    setSocialError(null);
    setIsSocialLoading('apple');

    try {
      // NextAuth.jsのApple Sign Inフローを開始
      await signIn('apple', {
        callbackUrl: '/bookshelf',
        redirect: true,
      });
      // signInが正常に完了した場合はリダイレクトが発生するため、ここには到達しない
    } catch {
      setSocialError('Apple IDログインに失敗しました。再試行してください。');
      setIsSocialLoading(null);
    }
  }

  /**
   * フォームの入力値をバリデーションする
   * @returns バリデーション通過の場合はtrue
   */
  function validateForm(): boolean {
    const errors: FormErrors = {};

    if (!email.trim()) {
      errors.email = 'メールアドレスを入力してください';
    } else if (!isValidEmail(email)) {
      errors.email = '有効なメールアドレスを入力してください';
    }

    if (!password) {
      errors.password = 'パスワードを入力してください';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /**
   * メール+パスワードログインフォームの送信処理
   *
   * バリデーション → APIコール → トークン保存 → リダイレクト の順に処理する
   *
   * @param event - フォームサブミットイベント
   */
  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // クライアントサイドバリデーション
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setApiErrorMessage(null);

    try {
      // バックエンドAPIにログインリクエストを送信
      const result = await apiLogin(email.trim(), password);

      // JWTトークンをローカルストレージに保存
      saveToken(result.token);

      // ロールに応じてリダイレクト
      if (result.user.role === 'admin') {
        router.push('/admin/dashboard');
      } else if (result.user.role === 'author') {
        router.push('/author/books');
      } else if (result.user.role === 'fan') {
        // ファンがメール認証でログインした場合（通常はソーシャルログインを使うが念のため）
        router.push('/bookshelf');
      } else {
        router.push('/');
      }
    } catch (error) {
      // APIエラー処理
      const apiError = error as ApiError;
      if (apiError.statusCode === 401) {
        setApiErrorMessage('メールアドレスまたはパスワードが正しくありません');
      } else if (apiError.statusCode === 429) {
        setApiErrorMessage('ログイン試行回数が多すぎます。15分後に再試行してください。');
      } else {
        setApiErrorMessage('ログインに失敗しました。しばらくしてから再試行してください。');
      }
    } finally {
      setIsLoading(false);
    }
  }

  // saveOAuthTokenを使用（不使用警告を防ぐ）
  void saveOAuthToken;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h1 style={styles.title}>Signia</h1>
          <p style={styles.subtitle}>サイン入り電子書籍プラットフォーム</p>
        </div>

        {/* タブ切り替え */}
        <div style={styles.tabContainer}>
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'social' ? styles.tabButtonActive : styles.tabButtonInactive),
            }}
          >
            ファン（ソーシャルログイン）
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'email' ? styles.tabButtonActive : styles.tabButtonInactive),
            }}
          >
            管理者・著者（メール）
          </button>
        </div>

        {/* ソーシャルログインタブ */}
        {activeTab === 'social' && (
          <div style={styles.socialSection}>
            <p style={styles.sectionDescription}>
              Google IDまたはApple IDでログインしてください。
              初回ログイン時はアカウントが自動作成されます。
            </p>

            {/* ソーシャルログインエラーメッセージ */}
            {socialError && (
              <div role="alert" style={styles.errorAlert}>
                {socialError}
              </div>
            )}

            {/* Googleでログインボタン */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSocialLoading !== null}
              style={{
                ...styles.socialButton,
                ...styles.googleButton,
                ...(isSocialLoading !== null ? styles.socialButtonDisabled : {}),
              }}
              aria-label="Googleアカウントでログイン"
            >
              <span style={styles.socialButtonIcon} aria-hidden="true">
                {/* Google公式SVGアイコン（ブランドガイドライン準拠） */}
                <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </span>
              {isSocialLoading === 'google' ? 'ログイン中...' : 'Googleでログイン'}
            </button>

            {/* Apple IDでログインボタン */}
            <button
              type="button"
              onClick={handleAppleLogin}
              disabled={isSocialLoading !== null}
              style={{
                ...styles.socialButton,
                ...styles.appleButton,
                ...(isSocialLoading !== null ? styles.socialButtonDisabled : {}),
              }}
              aria-label="Apple IDでログイン"
            >
              <span style={styles.socialButtonIcon} aria-hidden="true">
                {/* Apple公式SVGアイコン（ブランドガイドライン準拠） */}
                <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                    fill="white"
                  />
                </svg>
              </span>
              {isSocialLoading === 'apple' ? 'ログイン中...' : 'Apple IDでログイン'}
            </button>

            {/* 利用規約リンク */}
            <p style={styles.termsText}>
              ログインすることで、
              <a href="/terms" style={styles.termsLink}>
                利用規約
              </a>
              および
              <a href="/privacy" style={styles.termsLink}>
                プライバシーポリシー
              </a>
              に同意したものとみなします。
            </p>
          </div>
        )}

        {/* メール+パスワードログインタブ（管理側・著者向け） */}
        {activeTab === 'email' && (
          <form onSubmit={handleEmailSubmit} noValidate style={styles.form}>
            <p style={styles.sectionDescription}>
              管理者・著者の方はメールアドレスとパスワードでログインしてください。
            </p>

            {/* APIエラーメッセージ */}
            {apiErrorMessage && (
              <div role="alert" style={styles.errorAlert}>
                {apiErrorMessage}
              </div>
            )}

            {/* メールアドレス入力 */}
            <div style={styles.fieldGroup}>
              <label htmlFor="email" style={styles.label}>
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // 入力中はバリデーションエラーをリセット
                  if (formErrors.email) {
                    setFormErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="admin@example.com"
                autoComplete="email"
                disabled={isLoading}
                aria-invalid={!!formErrors.email}
                aria-describedby={formErrors.email ? 'email-error' : undefined}
                style={{
                  ...styles.input,
                  ...(formErrors.email ? styles.inputError : {}),
                }}
              />
              {formErrors.email && (
                <span id="email-error" role="alert" style={styles.fieldError}>
                  {formErrors.email}
                </span>
              )}
            </div>

            {/* パスワード入力 */}
            <div style={styles.fieldGroup}>
              <label htmlFor="password" style={styles.label}>
                パスワード
              </label>
              <div style={styles.passwordWrapper}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formErrors.password) {
                      setFormErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  placeholder="パスワードを入力"
                  autoComplete="current-password"
                  disabled={isLoading}
                  aria-invalid={!!formErrors.password}
                  aria-describedby={formErrors.password ? 'password-error' : undefined}
                  style={{
                    ...styles.input,
                    ...styles.passwordInput,
                    ...(formErrors.password ? styles.inputError : {}),
                  }}
                />
                {/* パスワード表示/非表示トグルボタン */}
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'パスワードを非表示' : 'パスワードを表示'}
                  style={styles.passwordToggle}
                >
                  {showPassword ? '非表示' : '表示'}
                </button>
              </div>
              {formErrors.password && (
                <span id="password-error" role="alert" style={styles.fieldError}>
                  {formErrors.password}
                </span>
              )}
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                ...styles.submitButton,
                ...(isLoading ? styles.submitButtonDisabled : {}),
              }}
            >
              {isLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ===== スタイル定義 =====
// CSS-in-JSスタイル（外部CSSライブラリ不使用）

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '1rem',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '440px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#0070f3',
    margin: '0 0 0.5rem 0',
  },
  subtitle: {
    color: '#666',
    fontSize: '0.875rem',
    margin: '0',
  },
  // タブ切り替え
  tabContainer: {
    display: 'flex',
    gap: '0',
    marginBottom: '1.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    padding: '0.625rem 0.5rem',
    fontSize: '0.8rem',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease',
    lineHeight: '1.4',
  },
  tabButtonActive: {
    backgroundColor: '#0070f3',
    color: '#ffffff',
  },
  tabButtonInactive: {
    backgroundColor: '#ffffff',
    color: '#6b7280',
  },
  // ソーシャルログインセクション
  socialSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionDescription: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: '0',
    lineHeight: '1.5',
  },
  socialButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%',
    transition: 'opacity 0.15s ease',
    border: 'none',
  },
  googleButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  appleButton: {
    backgroundColor: '#000000',
    color: '#ffffff',
  },
  socialButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  socialButtonIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  termsText: {
    color: '#9ca3af',
    fontSize: '0.75rem',
    margin: '0',
    lineHeight: '1.5',
    textAlign: 'center',
  },
  termsLink: {
    color: '#0070f3',
    textDecoration: 'none',
    margin: '0 0.125rem',
  },
  // メール+パスワードフォーム
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  errorAlert: {
    backgroundColor: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    color: '#dc2626',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    backgroundColor: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#f87171',
  },
  fieldError: {
    fontSize: '0.8rem',
    color: '#dc2626',
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  passwordInput: {
    paddingRight: '4.5rem',
  },
  passwordToggle: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    fontSize: '0.8rem',
    padding: '0.25rem 0.5rem',
  },
  submitButton: {
    backgroundColor: '#0070f3',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    marginTop: '0.5rem',
    transition: 'background-color 0.15s ease',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
};
