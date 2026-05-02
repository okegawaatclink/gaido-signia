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
 * ログアウトAPIを呼び出す（メール+パスワード認証ユーザー向け）
 * OAuth認証ユーザーはNextAuth.jsのsignOut()を使用すること
 */
export async function apiLogout(): Promise<void> {
  await apiRequest('/auth/logout', {
    method: 'POST',
  });
  removeToken();
}

/**
 * NextAuth.jsセッションのバックエンドトークンをローカルストレージに保存する
 * ソーシャルログイン後、バックエンドAPIへのリクエストに使用するトークンを保存する
 *
 * @param backendToken - NextAuth.jsセッションから取得したバックエンドJWTトークン
 */
export function saveOAuthToken(backendToken: string): void {
  saveToken(backendToken);
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

// ===== 書籍API =====

/**
 * 書籍エンティティ型定義
 * バックエンドの Book 型に対応する
 */
export interface Book {
  id: string;
  authorId: string;
  title: string;
  description: string | null;
  format: 'pdf' | 'epub';
  fileKey: string | null;
  coverImageKey: string | null;
  fileSize: number | null;
  pageCount: number | null;
  status: 'draft' | 'published' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * multipart/form-data でファイルをアップロードする汎用APIリクエスト関数
 * `apiRequest()` はJSON送信専用のため、ファイルアップロード時はこちらを使用する
 *
 * @param path - APIパス（例: '/books'）
 * @param formData - アップロードするFormDataオブジェクト
 * @param method - HTTPメソッド（デフォルト: POST）
 * @returns レスポンスデータ
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiUploadRequest<T>(
  path: string,
  formData: FormData,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};

  // JWTトークンを付与（Content-Typeはmultipart/form-dataにするためヘッダーに含めない）
  // fetch APIがFormData渡し時に自動的にContent-Typeを設定するため、手動設定不要
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: formData,
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

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

/**
 * 書籍一覧を取得する
 *
 * @returns 書籍の配列と件数
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetBooks(): Promise<{ books: Book[]; count: number }> {
  return apiRequest('/books');
}

/**
 * 書籍を新規登録する（ファイルアップロード）
 *
 * @param formData - 書籍データ（bookFile, title, description, coverImage, metadata）
 * @param onProgress - アップロード進捗コールバック（0-100の数値）
 * @returns 作成した書籍オブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiCreateBook(formData: FormData): Promise<{ book: Book }> {
  return apiUploadRequest<{ book: Book }>('/books', formData, 'POST');
}

/**
 * 書籍詳細を取得する
 *
 * @param bookId - 書籍ID
 * @returns 書籍オブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetBook(bookId: string): Promise<{ book: Book }> {
  return apiRequest(`/books/${bookId}`);
}

/**
 * 書籍情報を更新する
 *
 * @param bookId - 書籍ID
 * @param formData - 更新データ（bookFile, title, description, coverImage, status）
 * @returns 更新後の書籍オブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiUpdateBook(bookId: string, formData: FormData): Promise<{ book: Book }> {
  return apiUploadRequest<{ book: Book }>(`/books/${bookId}`, formData, 'PUT');
}

/**
 * 書籍のステータスをJSONで更新する（ファイルアップロード不要の場合）
 * タイトル・説明・ステータスのみを更新する際に使用する
 *
 * @param bookId - 書籍ID
 * @param data - 更新データ（title, description, status）
 * @returns 更新後の書籍オブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiUpdateBookMetadata(
  bookId: string,
  data: { title?: string; description?: string; status?: Book['status'] }
): Promise<{ book: Book }> {
  // multipart/form-dataで送信（バックエンドがmulterでパースするため）
  const formData = new FormData();
  if (data.title !== undefined) formData.append('title', data.title);
  if (data.description !== undefined) formData.append('description', data.description);
  if (data.status !== undefined) formData.append('status', data.status);
  return apiUploadRequest<{ book: Book }>(`/books/${bookId}`, formData, 'PUT');
}

/**
 * 書籍を削除する
 *
 * @param bookId - 書籍ID
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiDeleteBook(bookId: string): Promise<void> {
  return apiRequest(`/books/${bookId}`, { method: 'DELETE' });
}

// ===== サインAPI =====

/**
 * サインエンティティ型定義
 * バックエンドの Sign 型に対応する
 */
export interface Sign {
  id: string;
  authorId: string;
  name: string;
  type: 'common' | 'individual';
  imageKey: string | null;
  canvasData: Record<string, unknown> | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * サイン一覧を取得する
 * 著者自身のサインのみ返される
 *
 * @returns サインの配列と件数
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetSigns(): Promise<{ signs: Sign[]; count: number }> {
  return apiRequest('/signs');
}

/**
 * サインを新規作成する
 * PNG画像とCanvas描画データをサーバーに送信する
 *
 * @param formData - サインデータ（signImage, name, type, canvasData, isDefault）
 * @returns 作成したサインオブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiCreateSign(formData: FormData): Promise<{ sign: Sign }> {
  return apiUploadRequest<{ sign: Sign }>('/signs', formData, 'POST');
}

/**
 * サイン詳細を取得する
 *
 * @param signId - サインID
 * @returns サインオブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetSign(signId: string): Promise<{ sign: Sign }> {
  return apiRequest(`/signs/${signId}`);
}

/**
 * サインを更新する
 *
 * @param signId - サインID
 * @param formData - 更新データ（signImage, name, type, canvasData, isDefault）
 * @returns 更新後のサインオブジェクト
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiUpdateSign(signId: string, formData: FormData): Promise<{ sign: Sign }> {
  return apiUploadRequest<{ sign: Sign }>(`/signs/${signId}`, formData, 'PUT');
}

/**
 * サインを削除する
 *
 * @param signId - サインID
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiDeleteSign(signId: string): Promise<void> {
  return apiRequest(`/signs/${signId}`, { method: 'DELETE' });
}

// ===== ファンAPI =====

/**
 * ファンエンティティ型定義（書籍アクセス権を持つファン）
 */
export interface Fan {
  id: string;
  name: string;
  email: string;
}

/**
 * 書籍にアクセス権があるファン一覧を取得する
 * サイン合成画面のファン選択に使用する
 *
 * @param bookId - 書籍ID
 * @returns ファンの配列と件数
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetBookFans(bookId: string): Promise<{ fans: Fan[]; count: number }> {
  return apiRequest(`/books/${bookId}/fans`);
}

// ===== 合成API =====

/**
 * 合成結果エンティティ型定義（ファン1名分）
 */
export interface ComposeResult {
  signedBookId: string;
  fanId: string;
  status: 'completed' | 'error';
  errorMessage?: string;
}

/**
 * 合成ジョブ結果型定義
 */
export interface ComposeJobResult {
  bookId: string;
  signId: string;
  results: ComposeResult[];
  successCount: number;
  errorCount: number;
}

/**
 * サイン入り書籍エンティティ型定義
 */
export interface SignedBook {
  id: string;
  bookId: string;
  signId: string;
  fanId: string;
  recipientName: string | null;
  signedFileKey: string | null;
  status: 'processing' | 'completed' | 'error';
  composedAt: string | null;
  createdAt: string;
}

/**
 * サイン合成を実行する
 *
 * @param bookId - 合成対象の書籍ID
 * @param signId - 使用するサインID
 * @param fanIds - 対象ファンIDの配列
 * @param recipientNames - 個別サイン宛名マップ（fanIdをキーとした宛名の辞書）
 * @returns 合成ジョブ結果
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiCompose(
  bookId: string,
  signId: string,
  fanIds: string[],
  recipientNames?: Record<string, string>
): Promise<ComposeJobResult> {
  return apiRequest('/compose', {
    method: 'POST',
    body: { bookId, signId, fanIds, recipientNames },
  });
}

/**
 * 合成結果を取得する
 *
 * @param signedBookId - サイン入り書籍ID
 * @returns サイン入り書籍の詳細情報
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetSignedBook(signedBookId: string): Promise<{ signedBook: SignedBook }> {
  return apiRequest(`/compose/${signedBookId}`);
}

// ===== ファン向け本棚API =====

/**
 * 本棚アイテム型定義
 * バックエンドの BookshelfItem 型に対応する
 */
export interface BookshelfItem {
  /** 書籍基本情報 */
  book: {
    id: string;
    title: string;
    description: string | null;
    format: 'pdf' | 'epub';
    /** 表紙画像の署名付きURL（15分有効）。未設定の場合はnull */
    coverImageUrl: string | null;
    fileSize: number | null;
    pageCount: number | null;
    status: 'draft' | 'published' | 'archived';
    createdAt: string;
  };
  /** サイン入り書籍情報（サイン合成済みの場合のみ。未合成の場合はnull） */
  signedBook: {
    id: string;
    signType: string | null;
    recipientName: string | null;
    status: 'processing' | 'completed' | 'error';
    composedAt: string | null;
  } | null;
  /** アクセス権情報 */
  access: {
    id: string;
    grantedBy: 'api' | 'manual';
    grantedAt: string;
  };
}

/**
 * ファンの本棚（サイン入り書籍一覧）を取得する
 *
 * @returns 本棚アイテムの配列と件数
 * @throws {ApiError} APIエラーが発生した場合
 */
export async function apiGetBookshelf(): Promise<{ items: BookshelfItem[]; count: number }> {
  return apiRequest('/fan/bookshelf');
}

/**
 * 書籍閲覧URL取得結果型定義
 */
export interface BookReadUrlResult {
  /** 署名付きURL（15分有効） */
  url: string;
  /** URLの有効期限（ISO 8601形式） */
  expiresAt: string;
}

/**
 * 書籍閲覧用の署名付きURLを取得する
 *
 * @param bookId - 書籍ID
 * @returns 署名付きURLと有効期限
 * @throws {ApiError} アクセス権がない場合など
 */
export async function apiGetBookReadUrl(bookId: string): Promise<BookReadUrlResult> {
  return apiRequest(`/fan/books/${bookId}/read`);
}

// ===== 管理者向け著者管理API =====

/**
 * 著者情報型定義（管理者向け）
 * バックエンドの AuthorInfo 型に対応する
 */
export interface AuthorInfo {
  /** ユーザー ID（UUID） */
  id: string;
  /** メールアドレス */
  email: string;
  /** 表示名 */
  name: string;
  /** ロール（常に 'author'） */
  role: 'author';
  /** アカウント有効フラグ */
  isActive: boolean;
  /** 作成日時（ISO 8601形式） */
  createdAt: string;
  /** 更新日時（ISO 8601形式） */
  updatedAt: string;
}

/**
 * 著者の登録書籍情報型定義
 */
export interface AuthorBook {
  /** 書籍 ID */
  id: string;
  /** 書籍タイトル */
  title: string;
  /** 書籍ステータス */
  status: 'draft' | 'published' | 'archived';
  /** ファイル形式 */
  format: string | null;
  /** 作成日時（ISO 8601形式） */
  createdAt: string;
}

/**
 * 著者詳細型定義（登録書籍一覧含む）
 */
export interface AuthorDetail extends AuthorInfo {
  /** 著者が登録した書籍の一覧 */
  books: AuthorBook[];
}

/**
 * 著者一覧を取得する（admin ロール専用）
 *
 * @returns 著者の配列と件数
 * @throws {ApiError} 認証・認可エラー時
 */
export async function apiGetAuthors(): Promise<{ authors: AuthorInfo[]; count: number }> {
  return apiRequest('/admin/authors');
}

/**
 * 著者アカウントを作成する（admin ロール専用）
 *
 * @param email - メールアドレス
 * @param name - 表示名
 * @param password - 初期パスワード
 * @returns 作成した著者情報
 * @throws {ApiError} バリデーションエラー・メール重複時など
 */
export async function apiCreateAuthor(
  email: string,
  name: string,
  password: string
): Promise<{ author: AuthorInfo }> {
  return apiRequest('/admin/authors', {
    method: 'POST',
    body: { email, name, password },
  });
}

/**
 * 著者詳細を取得する（admin ロール専用）
 *
 * @param authorId - 著者 ID（UUID）
 * @returns 著者詳細情報（登録書籍一覧含む）
 * @throws {ApiError} 著者が見つからない場合など
 */
export async function apiGetAuthor(authorId: string): Promise<{ author: AuthorDetail }> {
  return apiRequest(`/admin/authors/${authorId}`);
}

/**
 * 著者情報を更新する（admin ロール専用）
 *
 * @param authorId - 著者 ID（UUID）
 * @param data - 更新データ（name, email, isActive）
 * @returns 更新後の著者情報
 * @throws {ApiError} バリデーションエラー・メール重複時など
 */
export async function apiUpdateAuthor(
  authorId: string,
  data: { name?: string; email?: string; isActive?: boolean }
): Promise<{ author: AuthorInfo }> {
  return apiRequest(`/admin/authors/${authorId}`, {
    method: 'PUT',
    body: data,
  });
}

/**
 * 著者アカウントを無効化する（admin ロール専用、論理削除）
 *
 * @param authorId - 著者 ID（UUID）
 * @returns 無効化後の著者情報
 * @throws {ApiError} 著者が見つからない場合など
 */
export async function apiDeactivateAuthor(authorId: string): Promise<{ author: AuthorInfo; message: string }> {
  return apiRequest(`/admin/authors/${authorId}`, {
    method: 'DELETE',
  });
}

// ===== 統計情報・ダッシュボード API =====

/**
 * ダッシュボード統計情報型定義
 */
export interface DashboardStats {
  /** 著者アカウント数（is_active=trueのみ） */
  authorCount: number;
  /** 書籍登録数（全ステータス合計） */
  bookCount: number;
  /** ファンアカウント数（is_active=trueのみ） */
  fanCount: number;
  /** サイン合成済み書籍数 */
  signedBookCount: number;
}

/**
 * 監査ログエントリ型定義（ダッシュボード表示用）
 */
export interface AuditLogEntry {
  /** ログID */
  id: string;
  /** 操作ユーザーID */
  userId: string | null;
  /** 操作ユーザー名 */
  userName: string | null;
  /** 操作ユーザーのロール */
  userRole: string | null;
  /** 操作種別 */
  action: string;
  /** 対象リソース種別 */
  resourceType: string;
  /** 対象リソースID */
  resourceId: string | null;
  /** 詳細情報 */
  details: Record<string, unknown>;
  /** クライアントIPアドレス */
  ipAddress: string | null;
  /** 記録日時 */
  createdAt: string;
}

/**
 * 管理者向け書籍情報型定義（著者情報含む）
 */
export interface AdminBookInfo {
  /** 書籍ID */
  id: string;
  /** 書籍タイトル */
  title: string;
  /** 書籍説明 */
  description: string | null;
  /** ファイル形式: pdf または epub */
  format: string;
  /** ステータス */
  status: 'draft' | 'published' | 'archived';
  /** ファイルサイズ（bytes） */
  fileSize: number | null;
  /** ページ数 */
  pageCount: number | null;
  /** メタデータ */
  metadata: Record<string, unknown>;
  /** 著者ID */
  authorId: string;
  /** 著者名 */
  authorName: string;
  /** 著者メールアドレス */
  authorEmail: string;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * 管理者向け書籍詳細型定義（ファンアクセス数含む）
 */
export interface AdminBookDetail extends AdminBookInfo {
  /** ファンアクセス数 */
  fanAccessCount: number;
}

/**
 * 管理者向け書籍一覧レスポンス型定義
 */
export interface AdminBooksResult {
  /** 書籍情報の配列 */
  books: AdminBookInfo[];
  /** 総件数 */
  total: number;
  /** 現在のページ番号 */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
}

/**
 * ダッシュボード統計情報を取得する（admin ロール専用）
 *
 * 著者数・書籍数・ファン数・サイン合成数と最近の操作履歴を返す。
 *
 * @returns 統計情報と最近の操作履歴
 * @throws {ApiError} 認証・認可エラー時
 */
export async function apiGetStats(): Promise<{
  stats: DashboardStats;
  recentLogs: AuditLogEntry[];
}> {
  return apiRequest('/admin/stats');
}

/**
 * 全書籍一覧を取得する（admin ロール専用）
 *
 * タイトルのILIKE部分一致検索とステータスフィルタ、ページネーションに対応。
 *
 * @param params - 検索・フィルタ・ページネーションパラメータ
 * @returns 書籍一覧と総件数
 * @throws {ApiError} 認証・認可エラー時
 */
export async function apiGetAdminBooks(params?: {
  search?: string;
  status?: 'draft' | 'published' | 'archived';
  page?: number;
  limit?: number;
}): Promise<AdminBooksResult> {
  // クエリパラメータを組み立てる
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append('search', params.search);
  if (params?.status) searchParams.append('status', params.status);
  if (params?.page) searchParams.append('page', String(params.page));
  if (params?.limit) searchParams.append('limit', String(params.limit));

  const query = searchParams.toString();
  return apiRequest(`/admin/books${query ? `?${query}` : ''}`);
}

/**
 * 書籍詳細を取得する（admin ロール専用）
 *
 * @param bookId - 書籍ID（UUID）
 * @returns 書籍詳細情報（著者情報・ファンアクセス数含む）
 * @throws {ApiError} 書籍が見つからない場合など
 */
export async function apiGetAdminBook(bookId: string): Promise<{ book: AdminBookDetail }> {
  return apiRequest(`/admin/books/${bookId}`);
}
