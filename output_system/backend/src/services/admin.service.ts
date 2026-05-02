/**
 * @file admin.service.ts
 * @description 管理者向けビジネスロジックサービス
 *
 * 著者アカウントの CRUD 操作に関するビジネスロジックを提供する。
 * - 著者アカウント作成（初期パスワードのハッシュ化・author ロール設定）
 * - 著者一覧取得
 * - 著者詳細取得（登録書籍一覧含む）
 * - 著者情報編集（名前・メール・有効/無効フラグ）
 * - 著者アカウント無効化（is_active フラグ変更: 論理削除）
 *
 * セキュリティ:
 * - このサービスは admin ロールのユーザーのみ呼び出し可能
 * - 著者作成時のパスワードは bcrypt でハッシュ化する
 * - 無効化された著者はログインできない（auth.service.ts の is_active チェックによる）
 */

import { db } from '../config/database';
import { hashPassword } from '../utils/crypto';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

// ===== 型定義 =====

/**
 * 著者情報型（API レスポンス用、パスワードハッシュを含まない）
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
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * 著者詳細型（登録書籍一覧を含む）
 */
export interface AuthorDetail extends AuthorInfo {
  /** 著者が登録した書籍の一覧 */
  books: AuthorBook[];
}

/**
 * 著者の書籍情報型（著者詳細画面用）
 */
export interface AuthorBook {
  /** 書籍 ID（UUID） */
  id: string;
  /** 書籍タイトル */
  title: string;
  /** 書籍のステータス */
  status: 'draft' | 'published' | 'archived';
  /** ファイル形式（pdf/epub） */
  format: string | null;
  /** 作成日時 */
  createdAt: Date;
}

/**
 * 著者アカウント作成パラメータ
 */
export interface CreateAuthorParams {
  /** メールアドレス（必須、一意） */
  email: string;
  /** 表示名（必須） */
  name: string;
  /** 初期パスワード（必須、ハッシュ化して保存） */
  password: string;
}

/**
 * 著者情報更新パラメータ
 */
export interface UpdateAuthorParams {
  /** 表示名（オプション） */
  name?: string;
  /** メールアドレス（オプション、重複チェックあり） */
  email?: string;
  /** アカウント有効フラグ（オプション） */
  isActive?: boolean;
}

// ===== ヘルパー関数 =====

/**
 * DB 行データを AuthorInfo 型にマッピングする
 * snake_case（DB 列名）から camelCase（TypeScript）への変換を行う
 *
 * @param row - DB から取得した行データ
 * @returns AuthorInfo 型のオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToAuthorInfo(row: Record<string, any>): AuthorInfo {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: 'author',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===== サービス関数 =====

/**
 * 著者アカウントを新規作成する
 *
 * - メールアドレスの重複チェック
 * - パスワードを bcrypt でハッシュ化
 * - author ロールで users テーブルに INSERT
 *
 * @param params - 著者作成パラメータ
 * @returns 作成した著者情報（パスワードハッシュなし）
 * @throws {ConflictError} 指定メールアドレスが既に使用されている場合
 *
 * @example
 * const author = await createAuthor({
 *   email: 'newauthor@example.com',
 *   name: '新規著者',
 *   password: 'SecurePassword123',
 * });
 */
export async function createAuthor(params: CreateAuthorParams): Promise<AuthorInfo> {
  const { email, name, password } = params;

  // メールアドレスの重複チェック（DB レベルでも UNIQUE 制約があるが、先にチェックして分かりやすいエラーを返す）
  const existingUser = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM users WHERE email = $1',
    [email]
  );
  if (parseInt(existingUser.rows[0].count, 10) > 0) {
    logger.warn('Author creation failed: email already exists', { email });
    throw new ConflictError('このメールアドレスは既に使用されています');
  }

  // パスワードをハッシュ化（bcrypt salt rounds 12）
  const passwordHash = await hashPassword(password);

  // 著者アカウントを DB に挿入
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO users (email, name, role, password_hash, is_active)
     VALUES ($1, $2, 'author', $3, true)
     RETURNING id, email, name, role, is_active, created_at, updated_at`,
    [email, name, passwordHash]
  );

  const author = mapRowToAuthorInfo(result.rows[0]);
  logger.info('Author account created', { authorId: author.id, email: author.email });

  return author;
}

/**
 * 著者一覧を取得する
 *
 * role = 'author' のユーザーを全件取得する。
 * パスワードハッシュは含まない。
 *
 * @returns 著者情報の配列（作成日時降順）
 *
 * @example
 * const authors = await getAuthors();
 */
export async function getAuthors(): Promise<AuthorInfo[]> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, is_active, created_at, updated_at
     FROM users
     WHERE role = 'author'
     ORDER BY created_at DESC`
  );

  return result.rows.map(mapRowToAuthorInfo);
}

/**
 * 著者詳細を取得する（登録書籍一覧含む）
 *
 * 指定 ID のユーザーが author ロールの場合、著者情報と登録書籍の一覧を返す。
 *
 * @param authorId - 著者の ID（UUID）
 * @returns 著者詳細情報（登録書籍一覧含む）
 * @throws {NotFoundError} 指定 ID の著者が存在しない場合
 *
 * @example
 * const detail = await getAuthorById('author-uuid-here');
 */
export async function getAuthorById(authorId: string): Promise<AuthorDetail> {
  // 著者情報を取得
  const userResult = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, is_active, created_at, updated_at
     FROM users
     WHERE id = $1 AND role = 'author'`,
    [authorId]
  );

  if (userResult.rows.length === 0) {
    logger.warn('Author not found', { authorId });
    throw new NotFoundError('著者が見つかりません');
  }

  const author = mapRowToAuthorInfo(userResult.rows[0]);

  // 登録書籍一覧を取得（読み取り専用、作成日時降順）
  const booksResult = await db.query<Record<string, unknown>>(
    `SELECT id, title, status, format, created_at
     FROM books
     WHERE author_id = $1
     ORDER BY created_at DESC`,
    [authorId]
  );

  const books: AuthorBook[] = booksResult.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    status: row.status as 'draft' | 'published' | 'archived',
    format: row.format as string | null,
    createdAt: row.created_at as Date,
  }));

  return { ...author, books };
}

/**
 * 著者情報を更新する
 *
 * 名前・メールアドレス・有効/無効フラグを更新可能。
 * メールアドレスを変更する場合は重複チェックを行う。
 *
 * @param authorId - 更新対象の著者 ID（UUID）
 * @param params - 更新パラメータ（未指定のフィールドは変更しない）
 * @returns 更新後の著者情報
 * @throws {NotFoundError} 指定 ID の著者が存在しない場合
 * @throws {ConflictError} 変更後のメールアドレスが既に使用されている場合
 *
 * @example
 * const updated = await updateAuthor('author-uuid', { name: '新しい名前' });
 */
export async function updateAuthor(
  authorId: string,
  params: UpdateAuthorParams
): Promise<AuthorInfo> {
  // 著者の存在確認
  const existingResult = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, is_active, created_at, updated_at
     FROM users
     WHERE id = $1 AND role = 'author'`,
    [authorId]
  );

  if (existingResult.rows.length === 0) {
    logger.warn('Author update failed: not found', { authorId });
    throw new NotFoundError('著者が見つかりません');
  }

  const existing = mapRowToAuthorInfo(existingResult.rows[0]);

  // メールアドレスを変更する場合は重複チェック
  if (params.email && params.email !== existing.email) {
    const emailCheck = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE email = $1 AND id != $2',
      [params.email, authorId]
    );
    if (parseInt(emailCheck.rows[0].count, 10) > 0) {
      logger.warn('Author update failed: email already exists', {
        authorId,
        newEmail: params.email,
      });
      throw new ConflictError('このメールアドレスは既に使用されています');
    }
  }

  // 動的 SET 句を構築（変更されたフィールドのみ更新）
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.name !== undefined) {
    setClauses.push(`name = $${paramIndex}`);
    values.push(params.name);
    paramIndex++;
  }

  if (params.email !== undefined) {
    setClauses.push(`email = $${paramIndex}`);
    values.push(params.email);
    paramIndex++;
  }

  if (params.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex}`);
    values.push(params.isActive);
    paramIndex++;
  }

  // 更新するフィールドがない場合は現在の情報をそのまま返す
  if (setClauses.length === 0) {
    return existing;
  }

  // updated_at も更新する
  setClauses.push(`updated_at = NOW()`);
  values.push(authorId);

  const updateResult = await db.query<Record<string, unknown>>(
    `UPDATE users SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND role = 'author'
     RETURNING id, email, name, is_active, created_at, updated_at`,
    values
  );

  const updated = mapRowToAuthorInfo(updateResult.rows[0]);
  logger.info('Author account updated', { authorId, params });

  return updated;
}

/**
 * 著者アカウントを無効化する（論理削除）
 *
 * is_active フラグを false に変更する。
 * 物理削除は行わず、無効化された著者はログインできなくなる。
 * （auth.service.ts の is_active チェックによりログイン拒否される）
 *
 * @param authorId - 無効化する著者の ID（UUID）
 * @returns 無効化後の著者情報
 * @throws {NotFoundError} 指定 ID の著者が存在しない場合
 *
 * @example
 * const deactivated = await deactivateAuthor('author-uuid-here');
 */
export async function deactivateAuthor(authorId: string): Promise<AuthorInfo> {
  // 著者の存在確認
  const existingResult = await db.query<Record<string, unknown>>(
    `SELECT id FROM users WHERE id = $1 AND role = 'author'`,
    [authorId]
  );

  if (existingResult.rows.length === 0) {
    logger.warn('Author deactivation failed: not found', { authorId });
    throw new NotFoundError('著者が見つかりません');
  }

  // is_active を false に更新（論理削除）
  const result = await db.query<Record<string, unknown>>(
    `UPDATE users SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND role = 'author'
     RETURNING id, email, name, is_active, created_at, updated_at`,
    [authorId]
  );

  const deactivated = mapRowToAuthorInfo(result.rows[0]);
  logger.info('Author account deactivated', { authorId });

  return deactivated;
}

/**
 * adminService オブジェクト（名前空間として公開）
 */
export const adminService = {
  createAuthor,
  getAuthors,
  getAuthorById,
  updateAuthor,
  deactivateAuthor,
};
