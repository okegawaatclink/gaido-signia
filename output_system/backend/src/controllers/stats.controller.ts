/**
 * @file stats.controller.ts
 * @description 管理者向け統計情報コントローラー
 *
 * ダッシュボード表示に必要な統計情報と監査ログ、書籍管理のHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET /api/admin/stats         : ダッシュボード統計情報取得（著者数・書籍数・ファン数・合成数）
 * - GET /api/admin/books         : 全書籍一覧取得（検索・フィルタ対応）
 * - GET /api/admin/books/:id     : 書籍詳細取得
 *
 * 認証・認可:
 * - 全エンドポイントに JWT 認証が必要（authenticate）
 * - admin ロールのみアクセス可能（adminOnly）
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { statsService } from '../services/stats.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/admin/stats
 * ダッシュボード統計情報を取得する
 *
 * 以下の統計情報を返す:
 * - 著者アカウント数
 * - 書籍登録数
 * - ファンアカウント数
 * - サイン合成済み書籍数
 * - 最近の操作履歴（直近20件）
 *
 * レスポンス (200):
 * - stats: 統計情報
 * - recentLogs: 最近の操作履歴
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('GET /api/admin/stats called', { adminId: req.user?.userId });

    // 統計情報と監査ログを並列で取得
    const [stats, recentLogs] = await Promise.all([
      statsService.getStats(),
      statsService.getRecentAuditLogs(),
    ]);

    res.status(200).json({
      stats,
      recentLogs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/books
 * 全書籍一覧を取得する（管理者向け）
 *
 * 全著者の書籍を検索・フィルタリングして返す。
 *
 * クエリパラメータ:
 * - search: タイトルの部分一致検索キーワード（オプション）
 * - status: ステータスフィルタ（draft/published/archived）（オプション）
 * - page: ページ番号（デフォルト: 1）
 * - limit: 1ページあたりの件数（デフォルト: 20、最大: 100）
 *
 * レスポンス (200):
 * - books: 書籍情報の配列（著者情報含む）
 * - total: 総件数
 * - page: 現在のページ番号
 * - limit: 1ページあたりの件数
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getAdminBooks(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const {
      search,
      status,
      page: pageStr = '1',
      limit: limitStr = '20',
    } = req.query as Record<string, string>;

    // ページ番号とlimitを整数に変換
    const page = parseInt(pageStr, 10) || 1;
    const limit = parseInt(limitStr, 10) || 20;

    logger.info('GET /api/admin/books called', {
      adminId: req.user?.userId,
      search,
      status,
      page,
      limit,
    });

    const result = await statsService.getAdminBooks({
      search,
      status: status as 'draft' | 'published' | 'archived' | undefined,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/books/:id
 * 書籍詳細を取得する（管理者向け）
 *
 * 書籍情報と著者情報、ファンアクセス数を返す。
 *
 * レスポンス (200):
 * - book: 書籍詳細情報（著者情報・ファンアクセス数含む）
 *
 * エラー:
 * - 400: 書籍IDが不正な形式
 * - 404: 書籍が見つからない
 *
 * @param req - Express リクエストオブジェクト（req.params.id に書籍ID）
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getAdminBook(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    logger.info('GET /api/admin/books/:id called', { adminId: req.user?.userId, bookId: id });

    const book = await statsService.getAdminBook(id);

    res.status(200).json({ book });
  } catch (error) {
    next(error);
  }
}
