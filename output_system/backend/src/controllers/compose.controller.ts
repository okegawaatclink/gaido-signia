/**
 * @file compose.controller.ts
 * @description サイン合成コントローラー
 *
 * サイン合成APIのHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - POST /api/compose     : 合成リクエスト受付（202 Accepted）
 * - GET  /api/compose/:id : 合成結果取得
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { composeService } from '../services/compose.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * POST /api/compose
 * サイン合成リクエストを受け付ける
 *
 * 処理フロー:
 * 1. バリデーション（bookId, signId, fanIds 必須チェック）
 * 2. ComposeService.execute で合成処理を同期実行
 * 3. 処理完了後に合成結果を返す（202 Accepted）
 *
 * 合成は数秒以内に完了するため非同期キューは使用しない（同期実行）。
 *
 * リクエストボディ (JSON):
 * - bookId: string (required) - 合成対象の書籍ID
 * - signId: string (required) - 使用するサインID
 * - fanIds: string[] (required) - 対象ファンIDの配列
 * - recipientNames: Record<string, string> (optional) - 個別サイン宛名マップ
 *
 * レスポンス (202):
 * - bookId: 書籍ID
 * - signId: サインID
 * - results: 各ファンの合成結果配列
 * - successCount: 成功件数
 * - errorCount: 失敗件数
 *
 * @param req - Expressリクエストオブジェクト（req.user に認証済みユーザー情報）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createCompose(
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

    const authorId = req.user!.userId;
    const { bookId, signId, fanIds, recipientNames } = req.body as {
      bookId: string;
      signId: string;
      fanIds: string[];
      recipientNames?: Record<string, string>;
    };

    logger.info('Compose request received', {
      authorId,
      bookId,
      signId,
      fanCount: fanIds.length,
    });

    // 合成処理を同期実行（数秒以内に完了する想定）
    const result = await composeService.execute(authorId, {
      bookId,
      signId,
      fanIds,
      recipientNames,
    });

    // 202 Accepted を返す
    // 全件エラーの場合でも202を返し、resultsで個別ステータスを確認できるようにする
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/compose/:id
 * 合成結果を取得する
 *
 * URLパラメータ:
 * - id: サイン入り書籍ID（signed_books テーブルのID）
 *
 * レスポンス (200):
 * - signedBook: サイン入り書籍の詳細情報
 *   - id: サイン入り書籍ID
 *   - bookId: 元書籍ID
 *   - signId: 使用サインID
 *   - fanId: 対象ファンID
 *   - recipientName: 宛名（個別サインの場合）
 *   - signedFileKey: 合成済みファイルS3キー（completed時のみ）
 *   - status: 'processing' | 'completed' | 'error'
 *   - composedAt: 合成完了日時
 *   - createdAt: 作成日時
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getCompose(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authorId = req.user!.userId;
    const { id } = req.params;

    const signedBook = await composeService.getSignedBook(id, authorId);

    res.status(200).json({ signedBook });
  } catch (error) {
    next(error);
  }
}
