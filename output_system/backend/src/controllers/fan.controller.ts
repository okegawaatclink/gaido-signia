/**
 * @file fan.controller.ts
 * @description ファン向けAPIコントローラー
 *
 * ファンが使用するエンドポイントのHTTPリクエスト処理を担当する。
 * リクエスト検証、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET /api/fan/bookshelf        : 本棚（自分のサイン入り書籍一覧）
 * - GET /api/fan/books/:id/read   : 書籍閲覧URL取得（署名付きURL）
 *
 * 認証・認可:
 * - 全エンドポイントにJWT認証が必要（authenticate）
 * - fanロールのみアクセス可能（fanOnly）
 */

import { Request, Response, NextFunction } from 'express';
import { param } from 'express-validator';
import { validationResult } from 'express-validator';
import { fanService } from '../services/fan.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/fan/bookshelf
 * ファンの本棚（サイン入り書籍一覧）を取得する
 *
 * 認証済みファン自身の書籍一覧のみを返す。
 * 他のファンの書籍は絶対に返されない。
 *
 * レスポンス (200):
 * - items: 本棚アイテムの配列（書籍がない場合は空配列）
 * - count: 書籍数
 *
 * 各アイテムは以下を含む:
 * - book: 書籍情報（表紙画像の署名付きURL含む）
 * - signedBook: サイン入り書籍情報（未合成の場合はnull）
 * - access: アクセス権情報
 *
 * @param req - Expressリクエストオブジェクト（req.user に認証済みファン情報）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getBookshelf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // req.userはauthenticate + fanOnlyミドルウェアで設定済みのため非null
    const fanId = req.user!.userId;

    const items = await fanService.getBookshelf(fanId);

    logger.info('Bookshelf retrieved', { fanId, count: items.length });

    res.status(200).json({
      items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/fan/books/:id/read
 * 書籍閲覧用の署名付きURLを取得する
 *
 * ファンが所有する書籍のみアクセス可能。
 * サイン合成済みの場合はそのファイルを、未合成の場合は元書籍ファイルを提供する。
 * 署名付きURLの有効期限は15分。
 *
 * パスパラメータ:
 * - id: 書籍ID（UUID）
 *
 * レスポンス (200):
 * - url: 署名付きURL（15分有効）
 * - expiresAt: URLの有効期限（ISO 8601形式）
 *
 * レスポンス (403): アクセス権がない場合
 *
 * @param req - Expressリクエストオブジェクト（req.params.id に書籍ID）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getBookReadUrl(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
    const fanId = req.user!.userId;

    const result = await fanService.getBookReadUrl(fanId, id);

    logger.info('Book read URL retrieved', { fanId, bookId: id });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * 書籍ID（UUID）のバリデーションルール
 * パスパラメータ :id の検証に使用する
 */
export const bookIdValidation = [
  param('id').isUUID().withMessage('書籍IDはUUID形式で指定してください'),
];
