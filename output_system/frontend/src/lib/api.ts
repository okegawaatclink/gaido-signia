/**
 * @file api.ts
 * @description APIクライアント（fetch wrapper）
 *
 * バックエンドAPIへのリクエストを処理するユーティリティ。
 * JWTトークンの自動付与、エラーハンドリング、レスポンス型付きの取得を提供する。
 *
 * バックエンドURL:
 * - ブラウザからのアクセス: NEXT_PUBLIC_API_URL 環境変数（デフォルト: /api）
 *   - Next.jsのリバースプロキシ経由でバックエンドにルーティングされる
 */

/** APIのベースURL（環境変数から取得、デフォルトは/api） */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * ローカルストレージのキー定数
 * JWTトークンの保存に使用する
 */
const TOKEN_STORAGE_KEY = 'signia_auth_token';

/**
 * APIエラーの型定義
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * API呼び出し結果の型定義
 */
export type ApiResult<T> = {
  data: T;
  error: null;
} | {
  data: null;
  error: ApiError;
};

// ===== トークン管理 =====

/**
 * JWTトークンをローカルストレージに保存する
 *
 * @param token - 保存するJWTトークン文字列
 */
export function saveToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

/**
 * ローカルストレージからJWTトークンを取得する
 *
 * @returns JWTトークン文字列、またはnull（未保存の場合）
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * ローカルストレージのJWTトークンを削除する（ログアウト時に使用）
 */
export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

// ===== HTTPリクエスト =====

/**
 * APIリクエストのオプション型定義
 */
export interface FetchOptions {
  /** HTTPメソッド（デフォルト: GET） */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** リクエストボディ（POST/PUT時に使用） */
  body?: unknown;
  /** JWTトークンを付与するか（デフォルト: true） */
  auth?: boolean;
  /** 追加のHTTPヘッダー */
  headers?: Record<string, string>;
}

/**
 * バックエンドAPIにHTTPリクエストを送信する
 *
 * 機能:
 * - 自動的にJWTトークンをAuthorizationヘッダーに付与する
 * - Content-TypeをJSONに設定する
 * - HTTPステータスコードに応じてエラーをthrowする
 *
 * @template T - レスポンスデータの型
 * @param path - APIパス（例: '/auth/login'）
 * @param options - リクエストオプション
 * @returns レスポンスデータ
 * @throws {ApiError} APIエラーが発生した場合
 *
 * @example
 * const data = await apiRequest<{ token: string }>('/auth/login', {
 *   method: 'POST',
 *   body: { email, password },
 *   auth: false, // ログイン時はトークン不要
 * });
 */
export async function apiRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // 認証が必要な場合はJWTトークンをヘッダーに付与
  if (auth) {
    const token = getToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // レスポンスのパース
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // JSON以外のレスポンス（204 No Content等）
    data = null;
  }

  // エラーレスポンスの処理
  if (!response.ok) {
    const errorData = data as Partial<ApiError>;
    throw {
      error: errorData?.error || 'UNKNOWN_ERROR',
      message: errorData?.message || `HTTPエラー: ${response.status}`,
      statusCode: response.status,
    } as ApiError;
  }

  return data as T;
}

// ===== 認証API =====

/**
 * ユーザー型定義
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'author' | 'fan';
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * ログインAPIを呼び出す
 *
 * @param email - メールアドレス
 * @param password - パスワード
 * @returns JWTトークンとユーザー情報
 * @throws {ApiError} 認証失敗時
 */
export async function apiLogin(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false, // ログイン時はJWT不要
  });
}

/**
 * ログアウトAPIを呼び出す
 */
export async function apiLogout(): Promise<void> {
  await apiRequest('/auth/logout', {
    method: 'POST',
  });
  removeToken();
}

/**
 * 現在のユーザー情報を取得する
 *
 * @returns ユーザー情報
 * @throws {ApiError} 認証失敗時
 */
export async function apiGetMe(): Promise<{ user: AuthUser }> {
  return apiRequest('/auth/me');
}
