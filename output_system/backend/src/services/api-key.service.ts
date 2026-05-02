/**
 * @file api-key.service.ts
 * @description API Key管理サービス
 *
 * APIキーの発行・一覧取得・無効化・削除を担当するサービス層。
 * データベース操作はここで行い、コントローラーはこのサービスを呼び出す。
 *
 * セキュリティ設計:
 * - APIキーは生成時に一度だけ平文を返す
 * - DBにはSHA-256ハッシュのみ保存（平文は永続化しない）
 * - randomBytesで暗号的に安全なキーを生成（32バイト = 256ビット）
 */

import crypto from 'crypto';
import { db } from '../config/database';
import { hashApiKey } from '../middleware/api-key.middleware';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * API Key作成リクエストの型定義
 */
export interface CreateApiKeyRequest {
  /** キー名（管理用の識別名） */
  name: string;
  /** 説明（使用目的・発行先等） */
  description?: string;
  /** 許可されたAPI操作のリスト */
  permissions?: string[];
  /** 有効期限（省略時は無期限） */
  expiresAt?: Date;
}

/**
 * API Key情報（一覧・詳細取得時に返すデータ）
 * key_hashは返さない（セキュリティ上の理由）
 */
export interface ApiKeyRecord {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * API Key作成結果（発行時のみ平文キーを含む）
 */
export interface CreateApiKeyResult {
  /** 作成したAPIキーの情報 */
  apiKey: ApiKeyRecord;
  /**
   * 平文のAPIキー文字列
   * 注意: この値はDBに保存されないため、この返却値が唯一の取得機会。
   * 利用者はこの値を安全に保管すること。
   */
  plainKey: string;
}

/**
 * APIキーを生成する
 * cryptographically secure な乱数から64文字の16進文字列を生成する
 *
 * @returns 平文のAPIキー文字列（64文字の16進数）
 */
function generateApiKey(): string {
  // 32バイト（256ビット）の乱数を生成して16進数文字列に変換
  // これにより64文字のAPIキーが生成される
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 新しいAPIキーを発行する
 *
 * @param request - APIキー作成リクエスト
 * @returns 作成されたAPIキー情報と平文キー（一度だけ返される）
 * @throws {ConflictError} 同名のAPIキーが既に存在する場合
 */
export async function createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResult> {
  const { name, description, permissions = [], expiresAt } = request;

  logger.info('Creating new API key', { name });

  // 暗号的に安全なAPIキーを生成
  const plainKey = generateApiKey();
  // SHA-256でハッシュ化してDBに保存（平文は保存しない）
  const keyHash = hashApiKey(plainKey);

  const result = await db.query<{
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
  }>(
    `INSERT INTO api_keys (key_hash, name, description, permissions, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, permissions, is_active, last_used_at, expires_at, created_at`,
    [keyHash, name, description || null, JSON.stringify(permissions), expiresAt || null]
  );

  const record = result.rows[0];

  logger.info('API key created successfully', { keyId: record.id, name: record.name });

  return {
    apiKey: {
      id: record.id,
      name: record.name,
      description: record.description,
      permissions: record.permissions,
      isActive: record.is_active,
      lastUsedAt: record.last_used_at,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
    },
    // 平文キーはこの返却時にのみ提供される
    // 呼び出し側（コントローラー）がレスポンスとしてクライアントに返す
    plainKey,
  };
}

/**
 * APIキー一覧を取得する
 *
 * @returns APIキー情報の配列（key_hashは含まない）
 */
export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const result = await db.query<{
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, name, description, permissions, is_active, last_used_at, expires_at, created_at
     FROM api_keys
     ORDER BY created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/**
 * 指定IDのAPIキーを取得する
 *
 * @param id - APIキーID（UUID）
 * @returns APIキー情報
 * @throws {NotFoundError} APIキーが見つからない場合
 */
export async function getApiKey(id: string): Promise<ApiKeyRecord> {
  const result = await db.query<{
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, name, description, permissions, is_active, last_used_at, expires_at, created_at
     FROM api_keys
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`APIキーが見つかりません: ${id}`);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * APIキーを無効化する（論理削除）
 *
 * is_active = false に設定することで、キーを使用不可にする。
 * キーのレコード自体は保持するため、監査ログとの連携が可能。
 *
 * @param id - 無効化するAPIキーID（UUID）
 * @throws {NotFoundError} APIキーが見つからない場合
 */
export async function deactivateApiKey(id: string): Promise<ApiKeyRecord> {
  const result = await db.query<{
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
  }>(
    `UPDATE api_keys
     SET is_active = false
     WHERE id = $1
     RETURNING id, name, description, permissions, is_active, last_used_at, expires_at, created_at`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`APIキーが見つかりません: ${id}`);
  }

  const row = result.rows[0];
  logger.info('API key deactivated', { keyId: row.id, name: row.name });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * APIキーを削除する（物理削除）
 *
 * 論理削除（deactivate）と異なり、レコードを完全に削除する。
 * 通常は deactivateApiKey を使用することを推奨。
 * 誤って発行したキーの完全削除時に使用する。
 *
 * @param id - 削除するAPIキーID（UUID）
 * @throws {NotFoundError} APIキーが見つからない場合
 */
export async function deleteApiKey(id: string): Promise<void> {
  const result = await db.query('DELETE FROM api_keys WHERE id = $1 RETURNING id, name', [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError(`APIキーが見つかりません: ${id}`);
  }

  logger.info('API key deleted', { keyId: result.rows[0].id, name: result.rows[0].name });
}

/** api-key.service をオブジェクト形式でもエクスポート（他ファイルからの利用を容易にする） */
export const apiKeyService = {
  createApiKey,
  listApiKeys,
  getApiKey,
  deactivateApiKey,
  deleteApiKey,
};
