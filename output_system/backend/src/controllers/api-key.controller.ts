/**
 * @file api-key.controller.ts
 * @description API Key管理コントローラー
 *
 * Admin向けAPIキー管理エンドポイントのHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET    /api/admin/api-keys       : APIキー一覧取得
 * - POST   /api/admin/api-keys       : APIキー発行
 * - GET    /api/admin/api-keys/:id   : APIキー詳細取得
 * - DELETE /api/admin/api-keys/:id   : APIキー無効化
 *
 * 認証・認可:
 * - 全エンドポイントに JWT 認証が必要（authenticate）
 * - admin ロールのみアクセス可能（adminOnly）
 *
 * セキュリティ注意事項:
 * - APIキーの平文は POST レスポンスで一度だけ返す
 * - 以降のレスポンスにはハッシュも平文も含まない
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { apiKeyService } from '../services/api-key.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/admin/api-keys
 * APIキー一覧を取得する
 *
 * レスポンス (200):
 * - apiKeys: APIキー情報の配列（key_hashは含まない）
 * - count: APIキー数
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function listApiKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('GET /api/admin/api-keys called', { adminId: req.user?.userId });

    const apiKeys = await apiKeyService.listApiKeys();

    res.status(200).json({
      apiKeys,
      count: apiKeys.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/api-keys
 * 新しいAPIキーを発行する
 *
 * リクエスト (application/json):
 * - name: キー名（必須、1〜100文字）
 * - description: 説明（オプション）
 * - permissions: 許可する操作リスト（オプション、デフォルト: 全操作許可）
 * - expiresAt: 有効期限（オプション、省略時は無期限）
 *
 * レスポンス (201):
 * - apiKey: 作成したAPIキー情報
 * - plainKey: 平文のAPIキー（この一度だけ返される）
 *
 * 重要: plainKey はこのレスポンスでのみ取得可能。
 * サーバー側は平文を保存しないため、紛失した場合は再発行が必要。
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('POST /api/admin/api-keys called', { adminId: req.user?.userId });

    // バリデーションエラーチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors
          .array()
          .map((e) => e.msg)
          .join(', ')
      );
    }

    const { name, description, permissions, expiresAt } = req.body;

    const result = await apiKeyService.createApiKey({
      name,
      description,
      permissions,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // 201 Created でAPIキー情報と平文キーを返す
    // 平文キー（plainKey）はこのレスポンスで一度のみ提供される
    res.status(201).json({
      apiKey: result.apiKey,
      plainKey: result.plainKey,
      message:
        'APIキーが発行されました。この画面のplainKeyは再表示できません。安全な場所に保管してください。',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/api-keys/:id
 * 指定IDのAPIキー詳細を取得する
 *
 * レスポンス (200):
 * - apiKey: APIキー情報（key_hashは含まない）
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('GET /api/admin/api-keys/:id called', {
      adminId: req.user?.userId,
      keyId: req.params.id,
    });

    const apiKey = await apiKeyService.getApiKey(req.params.id);

    res.status(200).json({ apiKey });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/api-keys/:id
 * APIキーを無効化する（論理削除）
 *
 * is_active = false に設定してAPIキーを使用不可にする。
 * レコード自体は保持するため、監査ログとの紐付けが可能。
 *
 * レスポンス (200):
 * - apiKey: 無効化後のAPIキー情報
 * - message: 完了メッセージ
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function deactivateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('DELETE /api/admin/api-keys/:id called', {
      adminId: req.user?.userId,
      keyId: req.params.id,
    });

    const apiKey = await apiKeyService.deactivateApiKey(req.params.id);

    res.status(200).json({
      apiKey,
      message: 'APIキーを無効化しました',
    });
  } catch (error) {
    next(error);
  }
}
