/**
 * @file admin.controller.ts
 * @description 管理者向けコントローラー
 *
 * 著者アカウント管理の HTTP リクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET    /api/admin/authors       : 著者一覧取得
 * - POST   /api/admin/authors       : 著者アカウント作成
 * - GET    /api/admin/authors/:id   : 著者詳細取得（登録書籍一覧含む）
 * - PUT    /api/admin/authors/:id   : 著者情報更新
 * - DELETE /api/admin/authors/:id   : 著者アカウント無効化
 *
 * 認証・認可:
 * - 全エンドポイントに JWT 認証が必要（authenticate）
 * - admin ロールのみアクセス可能（adminOnly）
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { adminService } from '../services/admin.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/admin/authors
 * 著者一覧を取得する
 *
 * レスポンス (200):
 * - authors: 著者情報の配列（パスワードなし）
 * - count: 著者数
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getAuthors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('GET /api/admin/authors called', { adminId: req.user?.userId });

    const authors = await adminService.getAuthors();

    res.status(200).json({
      authors,
      count: authors.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/authors
 * 著者アカウントを新規作成する
 *
 * リクエスト (application/json):
 * - email: メールアドレス（必須、有効なメール形式）
 * - name: 表示名（必須、1〜100 文字）
 * - password: 初期パスワード（必須、8 文字以上）
 *
 * レスポンス (201):
 * - author: 作成した著者情報（パスワードなし）
 *
 * エラー:
 * - 400: バリデーションエラー（メール形式不正、パスワード短すぎ等）
 * - 409: メールアドレスが既に使用されている
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createAuthor(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const { email, name, password } = req.body;
    logger.info('POST /api/admin/authors called', { adminId: req.user?.userId, email, name });

    const author = await adminService.createAuthor({ email, name, password });

    res.status(201).json({ author });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/authors/:id
 * 著者詳細を取得する（登録書籍一覧含む）
 *
 * レスポンス (200):
 * - author: 著者詳細情報（登録書籍一覧含む）
 *
 * エラー:
 * - 400: 著者 ID が不正な形式
 * - 404: 著者が見つからない
 *
 * @param req - Express リクエストオブジェクト（req.params.id に著者 ID）
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getAuthor(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    logger.info('GET /api/admin/authors/:id called', { adminId: req.user?.userId, authorId: id });

    const author = await adminService.getAuthorById(id);

    res.status(200).json({ author });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/authors/:id
 * 著者情報を更新する
 *
 * リクエスト (application/json):
 * - name: 表示名（オプション）
 * - email: メールアドレス（オプション）
 * - isActive: アカウント有効フラグ（オプション）
 *
 * レスポンス (200):
 * - author: 更新後の著者情報
 *
 * エラー:
 * - 400: バリデーションエラー
 * - 404: 著者が見つからない
 * - 409: 変更後のメールアドレスが既に使用されている
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function updateAuthor(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    const { name, email, isActive } = req.body;
    logger.info('PUT /api/admin/authors/:id called', { adminId: req.user?.userId, authorId: id });

    const author = await adminService.updateAuthor(id, { name, email, isActive });

    res.status(200).json({ author });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/authors/:id
 * 著者アカウントを無効化する（論理削除）
 *
 * is_active フラグを false に変更する（物理削除は行わない）。
 * 無効化された著者はログインできなくなる。
 *
 * レスポンス (200):
 * - author: 無効化後の著者情報
 * - message: 完了メッセージ
 *
 * エラー:
 * - 400: 著者 ID が不正な形式
 * - 404: 著者が見つからない
 *
 * @param req - Express リクエストオブジェクト
 * @param res - Express レスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function deactivateAuthor(
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
    logger.info('DELETE /api/admin/authors/:id called', {
      adminId: req.user?.userId,
      authorId: id,
    });

    const author = await adminService.deactivateAuthor(id);

    res.status(200).json({
      author,
      message: '著者アカウントを無効化しました',
    });
  } catch (error) {
    next(error);
  }
}
