/**
 * @file external.controller.ts
 * @description 外部連携APIコントローラー
 *
 * 外部購入システムからのAPI呼び出しを処理するコントローラー。
 * リクエストバリデーション、サービス呼び出し、監査ログ記録、レスポンス整形を行う。
 *
 * エンドポイント:
 * - POST   /api/external/book-access     : 書籍アクセス権付与
 * - DELETE /api/external/book-access/:id : アクセス権削除
 * - GET    /api/external/book-access     : アクセス権一覧取得
 * - POST   /api/external/signs           : サインデータ登録
 * - GET    /api/external/signs/:id       : サインデータ取得
 *
 * 認証・認可:
 * - 全エンドポイントに API Key 認証が必要（authenticateApiKey）
 * - レート制限適用（externalApiRateLimit）
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { externalService } from '../services/external.service';
import { ValidationError } from '../utils/errors';
import { recordAuditLog, getClientIpAddress } from '../middleware/audit.middleware';
import { logger } from '../utils/logger';

/**
 * POST /api/external/book-access
 * ファンに書籍アクセス権を付与する
 *
 * リクエスト (application/json):
 * - bookId: 書籍ID（必須、UUID形式）
 * - fanEmail: ファンのメールアドレス（必須）
 * - externalReference: 外部システムの参照ID（オプション）
 *
 * レスポンス (201):
 * - 作成されたアクセス権情報
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function grantBookAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('POST /api/external/book-access called', {
      apiKeyId: req.apiKey?.id,
      apiKeyName: req.apiKey?.name,
    });

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

    const { bookId, fanEmail, externalReference } = req.body;

    const accessRecord = await externalService.grantBookAccess({
      bookId,
      fanEmail,
      externalReference,
    });

    // 監査ログ記録（外部APIによる書籍アクセス権付与）
    await recordAuditLog({
      userId: null, // 外部API呼び出しはユーザーIDなし
      action: 'external_book_access_grant',
      resourceType: 'book_access',
      resourceId: accessRecord.id,
      details: {
        apiKeyId: req.apiKey?.id,
        apiKeyName: req.apiKey?.name,
        bookId,
        fanEmail,
        externalReference,
      },
      result: 'success',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json(accessRecord);
  } catch (error) {
    // 失敗時も監査ログを記録
    await recordAuditLog({
      userId: null,
      action: 'external_book_access_grant',
      resourceType: 'book_access',
      details: {
        apiKeyId: req.apiKey?.id,
        bookId: req.body?.bookId,
        fanEmail: req.body?.fanEmail,
        error: (error as Error).message,
      },
      result: 'failed',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });
    next(error);
  }
}

/**
 * DELETE /api/external/book-access/:id
 * 書籍アクセス権を削除する
 *
 * レスポンス (200):
 * - message: 完了メッセージ
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function deleteBookAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('DELETE /api/external/book-access/:id called', {
      apiKeyId: req.apiKey?.id,
      accessId: req.params.id,
    });

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

    await externalService.deleteBookAccess(req.params.id);

    // 監査ログ記録（外部APIによる書籍アクセス権削除）
    await recordAuditLog({
      userId: null,
      action: 'external_book_access_delete',
      resourceType: 'book_access',
      resourceId: req.params.id,
      details: {
        apiKeyId: req.apiKey?.id,
        apiKeyName: req.apiKey?.name,
      },
      result: 'success',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ message: '書籍アクセス権を削除しました' });
  } catch (error) {
    await recordAuditLog({
      userId: null,
      action: 'external_book_access_delete',
      resourceType: 'book_access',
      resourceId: req.params.id,
      details: {
        apiKeyId: req.apiKey?.id,
        error: (error as Error).message,
      },
      result: 'failed',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });
    next(error);
  }
}

/**
 * GET /api/external/book-access
 * 書籍アクセス権一覧を取得する
 *
 * クエリパラメータ（すべてオプション）:
 * - bookId: 書籍IDでフィルタ
 * - fanId: ファンIDでフィルタ
 * - externalReference: 外部参照IDでフィルタ
 *
 * レスポンス (200):
 * - アクセス権レコードの配列と件数
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function listBookAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('GET /api/external/book-access called', {
      apiKeyId: req.apiKey?.id,
      query: req.query,
    });

    const { bookId, fanId, externalReference } = req.query as {
      bookId?: string;
      fanId?: string;
      externalReference?: string;
    };

    const accessList = await externalService.listBookAccess({
      bookId,
      fanId,
      externalReference,
    });

    res.status(200).json({
      bookAccess: accessList,
      count: accessList.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/external/signs
 * サインデータを登録する
 *
 * リクエスト (application/json):
 * - authorId: 著者ID（必須、UUID形式）
 * - name: サイン名（必須）
 * - type: サイン種別（必須: common / individual）
 * - imageBase64: Base64エンコードされたPNG画像（必須）
 *
 * レスポンス (201):
 * - 作成されたサインデータ
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createExternalSign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('POST /api/external/signs called', {
      apiKeyId: req.apiKey?.id,
      authorId: req.body?.authorId,
    });

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

    const { authorId, name, type, imageBase64 } = req.body;

    const signRecord = await externalService.createExternalSign({
      authorId,
      name,
      type,
      imageBase64,
    });

    // 監査ログ記録（外部APIによるサインデータ登録）
    await recordAuditLog({
      userId: null,
      action: 'external_sign_create',
      resourceType: 'sign',
      resourceId: signRecord.id,
      details: {
        apiKeyId: req.apiKey?.id,
        apiKeyName: req.apiKey?.name,
        authorId,
        signName: name,
        signType: type,
      },
      result: 'success',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json(signRecord);
  } catch (error) {
    await recordAuditLog({
      userId: null,
      action: 'external_sign_create',
      resourceType: 'sign',
      details: {
        apiKeyId: req.apiKey?.id,
        authorId: req.body?.authorId,
        error: (error as Error).message,
      },
      result: 'failed',
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers['user-agent'],
    });
    next(error);
  }
}

/**
 * GET /api/external/signs/:id
 * サインデータを取得する
 *
 * レスポンス (200):
 * - サインデータ（署名付き画像URLを含む）
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getExternalSign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('GET /api/external/signs/:id called', {
      apiKeyId: req.apiKey?.id,
      signId: req.params.id,
    });

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

    const signRecord = await externalService.getExternalSign(req.params.id);

    res.status(200).json(signRecord);
  } catch (error) {
    next(error);
  }
}
