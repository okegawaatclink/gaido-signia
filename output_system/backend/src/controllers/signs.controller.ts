/**
 * @file signs.controller.ts
 * @description サインコントローラー
 *
 * サインCRUD操作のHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET    /api/signs        : サイン一覧取得（著者自身のサインのみ）
 * - POST   /api/signs        : サイン作成（PNG画像+Canvas JSON+メタデータ）
 * - GET    /api/signs/:id    : サイン詳細取得
 * - PUT    /api/signs/:id    : サイン更新
 * - DELETE /api/signs/:id    : サイン削除（S3画像も削除）
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { signsService } from '../services/signs.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/signs
 * サイン一覧を取得する
 * 著者は自分のサインのみ取得できる
 *
 * レスポンス (200):
 * - signs: サインの配列
 * - count: サイン数
 *
 * @param req - Expressリクエストオブジェクト（req.user に認証済みユーザー情報）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getSigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;

    const signs = await signsService.getSigns(userId);

    res.status(200).json({
      signs,
      count: signs.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/signs
 * サインを新規作成する（PNG画像アップロード + Canvas JSON保存）
 *
 * リクエスト (multipart/form-data):
 * - signImage: サイン画像ファイル（PNG、必須）
 * - name: サイン名（必須）
 * - type: サイン種別（common または individual、必須）
 * - canvasData: Canvas描画データ（JSON文字列、必須）
 * - isDefault: デフォルトサインフラグ（オプション、boolean文字列）
 *
 * レスポンス (201):
 * - sign: 作成したサインオブジェクト
 *
 * @param req - Expressリクエストオブジェクト（req.file にアップロードファイル）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createSign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
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

    const userId = req.user!.userId;

    // multerのsingle()を使用するためreq.fileはオブジェクト形式
    const imageFile = req.file;

    // サイン画像は必須
    if (!imageFile) {
      throw new ValidationError('サイン画像ファイル（signImage）は必須です');
    }

    // canvasDataフィールドはJSON文字列またはオブジェクトとしてパース
    if (!req.body.canvasData) {
      throw new ValidationError('canvasDataは必須です');
    }

    let canvasData: Record<string, unknown>;
    try {
      canvasData = typeof req.body.canvasData === 'string'
        ? JSON.parse(req.body.canvasData)
        : req.body.canvasData;
    } catch {
      throw new ValidationError('canvasDataは有効なJSON形式で指定してください');
    }

    // isDefaultフラグは文字列 "true"/"false" としてPOSTされることがある
    const isDefault = req.body.isDefault === 'true' || req.body.isDefault === true;

    const sign = await signsService.createSign(userId, {
      name: req.body.name as string,
      type: req.body.type as 'common' | 'individual',
      imageFile,
      canvasData,
      isDefault,
    });

    logger.info('Sign created via API', { signId: sign.id, authorId: userId });

    res.status(201).json({ sign });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/signs/:id
 * サイン詳細を取得する
 * 著者は自分のサインのみ取得できる
 *
 * パスパラメータ:
 * - id: サインID（UUID）
 *
 * レスポンス (200):
 * - sign: サインオブジェクト
 *
 * @param req - Expressリクエストオブジェクト（req.params.id にサインID）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getSign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const sign = await signsService.getSign(id, userId);

    res.status(200).json({ sign });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/signs/:id
 * サイン情報を更新する
 * 著者は自分のサインのみ更新可能
 *
 * パスパラメータ:
 * - id: サインID（UUID）
 *
 * リクエスト (multipart/form-data):
 * - signImage: 新しいサイン画像ファイル（PNG、オプション）
 * - name: サイン名（オプション）
 * - type: サイン種別（オプション）
 * - canvasData: Canvas描画データ（JSON文字列、オプション）
 * - isDefault: デフォルトサインフラグ（オプション）
 *
 * レスポンス (200):
 * - sign: 更新後のサインオブジェクト
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function updateSign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
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

    const { id } = req.params;
    const userId = req.user!.userId;

    // multerのsingle()を使用するためreq.fileはオブジェクト形式
    const imageFile = req.file;

    // canvasDataフィールドが指定された場合はJSON文字列としてパース
    let canvasData: Record<string, unknown> | undefined;
    if (req.body.canvasData) {
      try {
        canvasData = typeof req.body.canvasData === 'string'
          ? JSON.parse(req.body.canvasData)
          : req.body.canvasData;
      } catch {
        throw new ValidationError('canvasDataは有効なJSON形式で指定してください');
      }
    }

    // isDefaultフラグは文字列 "true"/"false" としてPOSTされることがある
    let isDefault: boolean | undefined;
    if (req.body.isDefault !== undefined) {
      isDefault = req.body.isDefault === 'true' || req.body.isDefault === true;
    }

    const sign = await signsService.updateSign(id, userId, {
      name: req.body.name as string | undefined,
      type: req.body.type as 'common' | 'individual' | undefined,
      imageFile,
      canvasData,
      isDefault,
    });

    logger.info('Sign updated via API', { signId: id, authorId: userId });

    res.status(200).json({ sign });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/signs/:id
 * サインを削除する（S3画像も削除）
 * 著者は自分のサインのみ削除可能
 *
 * パスパラメータ:
 * - id: サインID（UUID）
 *
 * レスポンス (204): No Content
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function deleteSign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    await signsService.deleteSign(id, userId);

    logger.info('Sign deleted via API', { signId: id, userId });

    // 204 No Content（削除成功時はボディなし）
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
