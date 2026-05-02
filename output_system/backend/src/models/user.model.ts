/**
 * @file user.model.ts
 * @description ユーザーモデル
 *
 * usersテーブルのデータアクセスロジックを提供する。
 * DBクエリのラッパーとして機能し、型安全なデータ取得を行う。
 *
 * ロール定義:
 * - admin: システム管理者（全機能アクセス可）
 * - author: 著者（書籍・サイン管理）
 * - fan: ファン（本棚・閲覧のみ）
 */

import { db } from '../config/database';

/**
 * ユーザーエンティティ型
 * usersテーブルの行データに対応する
 */
export interface User {
  /** ユーザーID（UUID） */
  id: string;
  /** メールアドレス（一意） */
  email: string;
  /** 表示名 */
  name: string;
  /** ロール */
  role: 'admin' | 'author' | 'fan';
  /** パスワードハッシュ（管理側ユーザーのみ） */
  passwordHash: string | null;
  /** OAuthプロバイダー（fanユーザーのみ: google/apple） */
  oauthProvider: string | null;
  /** OAuthプロバイダーID */
  oauthProviderId: string | null;
  /** アバターURL */
  avatarUrl: string | null;
  /** アカウント有効フラグ */
  isActive: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * パスワードハッシュを除いたユーザー型
 * APIレスポンスやログ出力時など、パスワードハッシュを含めたくない場合に使用する
 */
export type UserWithoutPassword = Omit<User, 'passwordHash'>;

/**
 * DBの行データをUser型にマッピングするヘルパー関数
 * snake_case（DB列名）からcamelCase（TypeScript）への変換を行う
 *
 * @param row - DBから取得した行データ
 * @returns User型のオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToUser(row: Record<string, any>): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
    oauthProvider: row.oauth_provider,
    oauthProviderId: row.oauth_provider_id,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * メールアドレスでユーザーを検索する
 *
 * @param email - 検索するメールアドレス
 * @returns ユーザー（パスワードハッシュ含む）またはnull（見つからない場合）
 *
 * @example
 * const user = await UserModel.findByEmail('user@example.com');
 */
export async function findByEmail(email: string): Promise<User | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, role, password_hash, oauth_provider, oauth_provider_id,
            avatar_url, is_active, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToUser(result.rows[0]);
}

/**
 * ユーザーIDでユーザーを検索する
 *
 * @param id - ユーザーID（UUID）
 * @returns ユーザー（パスワードハッシュ含む）またはnull（見つからない場合）
 */
export async function findById(id: string): Promise<User | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, role, password_hash, oauth_provider, oauth_provider_id,
            avatar_url, is_active, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToUser(result.rows[0]);
}

/**
 * ユーザーをパスワードハッシュなしで取得する
 * APIレスポンス用に使用する
 *
 * @param id - ユーザーID（UUID）
 * @returns ユーザー（パスワードハッシュなし）またはnull（見つからない場合）
 */
export async function findByIdWithoutPassword(id: string): Promise<UserWithoutPassword | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, role, oauth_provider, oauth_provider_id,
            avatar_url, is_active, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as 'admin' | 'author' | 'fan',
    oauthProvider: row.oauth_provider as string | null,
    oauthProviderId: row.oauth_provider_id as string | null,
    avatarUrl: row.avatar_url as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * UserModelオブジェクト（名前空間として公開）
 */
export const UserModel = {
  findByEmail,
  findById,
  findByIdWithoutPassword,
};
