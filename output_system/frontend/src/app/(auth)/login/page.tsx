/**
 * @file (auth)/login/page.tsx
 * @description 管理側ログイン画面
 *
 * 著者・管理者がメールアドレスとパスワードでログインする画面。
 * ログイン成功後、ロールに応じてリダイレクトする:
 * - admin: /admin/dashboard
 * - author: /author/books
 *
 * 機能:
 * - メールアドレス入力（フォーマット検証）
 * - パスワード入力（表示/非表示トグル）
 * - バリデーション（クライアントサイド）
 * - エラーメッセージ表示
 * - ロールに応じたリダイレクト
 * - ログイン状態をlocalStorageで管理
 */

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiLogin, saveToken, ApiError } from '../../../lib/api';

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
 * @returns {JSX.Element} ログインフォームUI
 */
export default function LoginPage() {
  const router = useRouter();

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
   * ログインフォームの送信処理
   *
   * バリデーション → APIコール → トークン保存 → リダイレクト の順に処理する
   *
   * @param event - フォームサブミットイベント
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
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
      } else {
        // 想定外のロール（fanはこの画面を使わない）
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h1 style={styles.title}>Signia</h1>
          <p style={styles.subtitle}>管理者・著者ログイン</p>
        </div>

        {/* ログインフォーム */}
        <form onSubmit={handleSubmit} noValidate style={styles.form}>
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
    maxWidth: '420px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#0070f3',
    margin: '0 0 0.5rem 0',
  },
  subtitle: {
    color: '#666',
    fontSize: '0.9rem',
    margin: '0',
  },
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
