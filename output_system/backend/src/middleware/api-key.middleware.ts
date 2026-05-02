/**
 * @file api-key.middleware.ts
 * @description API Key認証ミドルウェア
 *
 * 外部システム連携API用のAPI Key認証を提供する。
 * X-API-Keyヘッダーから取得したキーをSHA-256でハッシュ化し、
 * api_keysテーブルのkey_hashと照合して認証を行う。
 *
 * セキュリティ設計:
 * - APIキーは平文をDBに保存しない（SHA-256ハッシュのみ保存）
 * - 無効化されたキー（is_active = false）はアクセス拒否
 * - 有効期限切れのキーはアクセス拒否
 * - 最終使用日時を非同期で更新してパフォーマンスを維持
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../config/database';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * API Key情報の型定義
 * api_keysテーブルから取得したレコードを表す
 */
export interface ApiKeyInfo {
  /** APIキーID */
  id: string;
  /** キー名（管理用） */
  name: string;
  /** 許可されたAPI操作のリスト */
  permissions: string[];
  /** 有効フラグ */
  isActive: boolean;
  /** 有効期限（nullは無期限） */
  expiresAt: Date | null;
}

/**
 * Express RequestオブジェクトへのAPI Key情報プロパティのType拡張
 * API Key認証後のリクエストでreq.apiKeyにアクセス可能にする
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 認証済みAPI Key情報（API Key検証後にセットされる） */
      apiKey?: ApiKeyInfo;
    }
  }
}

/**
 * API KeyをSHA-256でハッシュ化する
 *
 * @param apiKey - ハッシュ化するAPI Key文字列
 * @returns SHA-256ハッシュ文字列（16進数）
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * API Key認証ミドルウェア
 *
 * X-API-Keyヘッダーに有効なAPIキーが含まれている場合のみ処理を許可する。
 * 認証成功時はreq.apiKeyにAPIキー情報をセットする。
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 *
 * @example
 * router.post('/book-access', authenticateApiKey, externalController.grantBookAccess);
 */
export async function authenticateApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // X-API-KeyヘッダーからAPIキーを取得
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedError('X-API-Keyヘッダーが必要です');
    }

    // APIキーをSHA-256でハッシュ化してDBと照合
    const keyHash = hashApiKey(apiKey);

    const result = await db.query<{
      id: string;
      name: string;
      permissions: string[];
      is_active: boolean;
      expires_at: Date | null;
    }>(
      `SELECT id, name, permissions, is_active, expires_at
       FROM api_keys
       WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      // キーが見つからない場合も「不正なAPIキー」として返す（情報漏洩防止）
      logger.warn('API Key authentication failed: key not found', {
        ip: req.socket?.remoteAddress,
      });
      throw new UnauthorizedError('不正なAPIキーです');
    }

    const keyRecord = result.rows[0];

    // 無効化されたキーのチェック
    if (!keyRecord.is_active) {
      logger.warn('API Key authentication failed: key is inactive', {
        keyId: keyRecord.id,
        keyName: keyRecord.name,
      });
      throw new UnauthorizedError('このAPIキーは無効化されています');
    }

    // 有効期限チェック（expires_at が null の場合は無期限）
    if (keyRecord.expires_at && new Date() > keyRecord.expires_at) {
      logger.warn('API Key authentication failed: key is expired', {
        keyId: keyRecord.id,
        keyName: keyRecord.name,
        expiresAt: keyRecord.expires_at,
      });
      throw new UnauthorizedError('このAPIキーは有効期限が切れています');
    }

    // req.apiKey に認証済みAPIキー情報をセット
    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      permissions: keyRecord.permissions || [],
      isActive: keyRecord.is_active,
      expiresAt: keyRecord.expires_at,
    };

    logger.debug('API Key authentication successful', {
      keyId: keyRecord.id,
      keyName: keyRecord.name,
    });

    // last_used_at を非同期で更新（認証フローをブロックしない）
    db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyRecord.id]).catch(
      (err) => {
        logger.error('Failed to update api_key last_used_at', {
          error: (err as Error).message,
          keyId: keyRecord.id,
        });
      }
    );

    next();
  } catch (error) {
    next(error);
  }
}
