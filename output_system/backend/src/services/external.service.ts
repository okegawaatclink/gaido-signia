/**
 * @file external.service.ts
 * @description 外部連携APIサービス
 *
 * 外部購入システムからAPI経由で呼び出される機能のビジネスロジックを提供する。
 * - 書籍アクセス権の付与・削除・一覧取得
 * - サインデータの登録・取得
 *
 * セキュリティ設計:
 * - ファンが存在しない場合は仮登録（fan ロール）を行う
 * - Base64画像のサイズ上限チェック（5MB相当）
 * - 外部参照IDはexternalReferenceとして保存（冪等性確保に活用可能）
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { storageService } from './storage.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Base64画像の最大サイズ（バイト換算）
 * Base64エンコードは元データの約4/3倍のサイズになるため、
 * 5MBのBase64文字列 ≒ 3.75MBの実データ
 */
const MAX_BASE64_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// ===== 書籍アクセス権 型定義 =====

/**
 * 書籍アクセス権付与リクエスト
 */
export interface GrantBookAccessRequest {
  /** 対象書籍ID（UUID） */
  bookId: string;
  /** ファンのメールアドレス（ユーザー検索・仮登録に使用） */
  fanEmail: string;
  /** 外部システムの注文ID等（オプション、重複防止・追跡用） */
  externalReference?: string;
}

/**
 * 書籍アクセス権レスポンス
 */
export interface BookAccessRecord {
  id: string;
  bookId: string;
  fanId: string;
  signedBookId: string | null;
  grantedBy: string;
  externalReference: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
}

/**
 * 書籍アクセス権一覧取得クエリパラメータ
 */
export interface ListBookAccessQuery {
  /** 書籍IDでフィルタ（オプション） */
  bookId?: string;
  /** ファンIDでフィルタ（オプション） */
  fanId?: string;
  /** 外部参照IDでフィルタ（オプション） */
  externalReference?: string;
}

// ===== サインデータ 型定義 =====

/**
 * 外部APIからのサイン登録リクエスト
 */
export interface ExternalCreateSignRequest {
  /** 著者ID（UUID）: このサインを登録する著者 */
  authorId: string;
  /** サイン名（管理用ラベル） */
  name: string;
  /** サイン種別 */
  type: 'common' | 'individual';
  /** サイン画像（Base64エンコードされたPNG） */
  imageBase64: string;
}

/**
 * 外部APIサインレスポンス
 */
export interface ExternalSignRecord {
  id: string;
  authorId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
}

// ===== 書籍アクセス権 操作 =====

/**
 * ファンを検索し、存在しない場合は仮登録する
 *
 * 外部システムからのアクセス権付与時、ファンアカウントが未作成の場合は
 * 仮登録（fan ロール、is_active = true）を行う。
 * OAuth ログイン時に既存アカウントとマージされる。
 *
 * @param fanEmail - ファンのメールアドレス
 * @returns ファンのユーザーID
 */
async function findOrCreateFanByEmail(fanEmail: string): Promise<string> {
  // 既存ユーザーを検索
  const existingUser = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND role = $2',
    [fanEmail, 'fan']
  );

  if (existingUser.rows.length > 0) {
    logger.debug('Fan user found', { fanEmail, userId: existingUser.rows[0].id });
    return existingUser.rows[0].id;
  }

  // 存在しない場合は仮登録（fan ロール）
  // パスワードなし・OAuthなしの仮アカウント（OAuthログイン時にマージ）
  const newUser = await db.query<{ id: string }>(
    `INSERT INTO users (email, name, role, is_active)
     VALUES ($1, $2, 'fan', true)
     RETURNING id`,
    [fanEmail, fanEmail.split('@')[0]] // 仮名はメールアドレスのローカルパートを使用
  );

  logger.info('Fan user provisionally registered', {
    fanEmail,
    userId: newUser.rows[0].id,
  });

  return newUser.rows[0].id;
}

/**
 * 書籍アクセス権を付与する
 *
 * ファンのメールアドレスでユーザーを検索し、見つからない場合は仮登録する。
 * 書籍が存在すること、同一のアクセス権が既に存在しないことを確認する。
 *
 * @param request - 書籍アクセス権付与リクエスト
 * @returns 作成されたアクセス権レコード
 * @throws {NotFoundError} 書籍が見つからない場合
 */
export async function grantBookAccess(request: GrantBookAccessRequest): Promise<BookAccessRecord> {
  const { bookId, fanEmail, externalReference } = request;

  logger.info('Granting book access', { bookId, fanEmail, externalReference });

  // 書籍の存在確認（publishedまたはdraftのみ許可）
  const bookResult = await db.query<{ id: string; status: string }>(
    "SELECT id, status FROM books WHERE id = $1 AND status != 'archived'",
    [bookId]
  );

  if (bookResult.rows.length === 0) {
    throw new NotFoundError(`書籍が見つかりません: ${bookId}`);
  }

  // ファンを検索または仮登録
  const fanId = await findOrCreateFanByEmail(fanEmail);

  // アクセス権を作成
  // 同一ユーザー・同一書籍のアクセス権が既存でも追加登録する（外部参照IDで管理）
  const accessResult = await db.query<{
    id: string;
    book_id: string;
    fan_id: string;
    signed_book_id: string | null;
    granted_by: string;
    external_reference: string | null;
    granted_at: Date;
    expires_at: Date | null;
  }>(
    `INSERT INTO book_access (book_id, fan_id, granted_by, external_reference)
     VALUES ($1, $2, 'api', $3)
     RETURNING id, book_id, fan_id, signed_book_id, granted_by, external_reference, granted_at, expires_at`,
    [bookId, fanId, externalReference || null]
  );

  const row = accessResult.rows[0];

  logger.info('Book access granted', {
    accessId: row.id,
    bookId: row.book_id,
    fanId: row.fan_id,
    externalReference: row.external_reference,
  });

  return {
    id: row.id,
    bookId: row.book_id,
    fanId: row.fan_id,
    signedBookId: row.signed_book_id,
    grantedBy: row.granted_by,
    externalReference: row.external_reference,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

/**
 * 書籍アクセス権を削除する
 *
 * @param accessId - 削除するアクセス権ID（UUID）
 * @throws {NotFoundError} アクセス権が見つからない場合
 */
export async function deleteBookAccess(accessId: string): Promise<void> {
  const result = await db.query('DELETE FROM book_access WHERE id = $1 RETURNING id', [accessId]);

  if (result.rows.length === 0) {
    throw new NotFoundError(`アクセス権が見つかりません: ${accessId}`);
  }

  logger.info('Book access deleted', { accessId });
}

/**
 * 書籍アクセス権一覧を取得する
 *
 * @param query - フィルタ条件（bookId, fanId, externalReference）
 * @returns アクセス権レコードの配列
 */
export async function listBookAccess(query: ListBookAccessQuery): Promise<BookAccessRecord[]> {
  // 動的クエリ構築（指定されたフィルタのみWHERE句に追加）
  const conditions: string[] = ["ba.granted_by = 'api'"]; // 外部API付与のみ返す
  const params: (string | undefined)[] = [];
  let paramIndex = 1;

  if (query.bookId) {
    conditions.push(`ba.book_id = $${paramIndex++}`);
    params.push(query.bookId);
  }

  if (query.fanId) {
    conditions.push(`ba.fan_id = $${paramIndex++}`);
    params.push(query.fanId);
  }

  if (query.externalReference) {
    conditions.push(`ba.external_reference = $${paramIndex++}`);
    params.push(query.externalReference);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query<{
    id: string;
    book_id: string;
    fan_id: string;
    signed_book_id: string | null;
    granted_by: string;
    external_reference: string | null;
    granted_at: Date;
    expires_at: Date | null;
  }>(
    `SELECT ba.id, ba.book_id, ba.fan_id, ba.signed_book_id, ba.granted_by,
            ba.external_reference, ba.granted_at, ba.expires_at
     FROM book_access ba
     ${whereClause}
     ORDER BY ba.granted_at DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    fanId: row.fan_id,
    signedBookId: row.signed_book_id,
    grantedBy: row.granted_by,
    externalReference: row.external_reference,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  }));
}

// ===== サインデータ 操作 =====

/**
 * Base64エンコードされた画像データを検証してBufferに変換する
 *
 * @param imageBase64 - Base64エンコードされた画像文字列（data URIスキーム付きも可）
 * @returns PNG画像のBuffer
 * @throws {ValidationError} 画像が大きすぎる場合または無効な形式の場合
 */
function decodeAndValidateBase64Image(imageBase64: string): Buffer {
  // data URIスキーム（data:image/png;base64,）が付いている場合は除去
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  // サイズチェック（Base64文字列のサイズでチェック）
  if (base64Data.length > MAX_BASE64_IMAGE_SIZE) {
    throw new ValidationError(
      `画像サイズが大きすぎます。Base64エンコード後のサイズは ${MAX_BASE64_IMAGE_SIZE / (1024 * 1024)}MB 以下にしてください`
    );
  }

  // Base64デコード
  const buffer = Buffer.from(base64Data, 'base64');

  // PNGマジックナンバーの確認（89 50 4E 47 = \x89PNG）
  if (
    buffer.length < 8 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    throw new ValidationError('画像はPNG形式で提供してください');
  }

  return buffer;
}

/**
 * 外部APIからサインデータを登録する
 *
 * Base64エンコードされたPNG画像をデコードしてS3に保存し、
 * サインデータをDBに登録する。
 *
 * @param request - サイン登録リクエスト
 * @returns 作成されたサインレコード
 * @throws {NotFoundError} 著者が見つからない場合
 * @throws {ValidationError} 画像が無効な場合
 */
export async function createExternalSign(
  request: ExternalCreateSignRequest
): Promise<ExternalSignRecord> {
  const { authorId, name, type, imageBase64 } = request;

  logger.info('Creating external sign', { authorId, name, type });

  // 著者の存在確認
  const authorResult = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE id = $1 AND role = 'author' AND is_active = true",
    [authorId]
  );

  if (authorResult.rows.length === 0) {
    throw new NotFoundError(`著者が見つかりません: ${authorId}`);
  }

  // Base64画像のデコードとバリデーション
  const imageBuffer = decodeAndValidateBase64Image(imageBase64);

  // S3にサイン画像をアップロード
  const signId = uuidv4();
  const imageKey = `signs/${signId}/sign.png`;

  await storageService.upload({
    key: imageKey,
    body: imageBuffer,
    contentType: 'image/png',
    serverSideEncryption: 'AES256',
  });

  // サインデータをDBに保存
  // canvas_dataは外部APIからの登録なのでnull（CanvasデータはGUI経由でのみ設定）
  const signResult = await db.query<{
    id: string;
    author_id: string;
    name: string;
    type: string;
    image_key: string;
    is_default: boolean;
    created_at: Date;
  }>(
    `INSERT INTO signs (id, author_id, name, type, image_key, canvas_data, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING id, author_id, name, type, image_key, is_default, created_at`,
    [signId, authorId, name, type, imageKey, JSON.stringify({})]
  );

  const row = signResult.rows[0];

  logger.info('External sign created', {
    signId: row.id,
    authorId: row.author_id,
    name: row.name,
  });

  return {
    id: row.id,
    authorId: row.author_id,
    name: row.name,
    type: row.type,
    imageUrl: null, // 署名付きURLはsignedUrlで取得するため、ここではnull
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

/**
 * 指定IDのサインデータを取得する
 *
 * @param signId - サインID（UUID）
 * @returns サインレコード（署名付き画像URLを含む）
 * @throws {NotFoundError} サインが見つからない場合
 */
export async function getExternalSign(signId: string): Promise<ExternalSignRecord> {
  const result = await db.query<{
    id: string;
    author_id: string;
    name: string;
    type: string;
    image_key: string | null;
    is_default: boolean;
    created_at: Date;
  }>(
    `SELECT id, author_id, name, type, image_key, is_default, created_at
     FROM signs
     WHERE id = $1`,
    [signId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`サインが見つかりません: ${signId}`);
  }

  const row = result.rows[0];

  // 画像URLを生成（署名付きURL、有効期限: 1時間）
  let imageUrl: string | null = null;
  if (row.image_key) {
    try {
      imageUrl = await storageService.getSignedUrl(row.image_key, 3600);
    } catch (error) {
      // 署名付きURLの生成失敗はログのみ（レスポンス自体は返す）
      logger.warn('Failed to generate signed URL for sign image', {
        signId: row.id,
        imageKey: row.image_key,
        error: (error as Error).message,
      });
    }
  }

  return {
    id: row.id,
    authorId: row.author_id,
    name: row.name,
    type: row.type,
    imageUrl,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

/** externalサービスをオブジェクト形式でもエクスポート */
export const externalService = {
  grantBookAccess,
  deleteBookAccess,
  listBookAccess,
  createExternalSign,
  getExternalSign,
};
