/**
 * @file auth.controller.ts
 * @description 認証コントローラー
 *
 * ログイン・ログアウト・ユーザー情報取得のHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - POST /api/auth/login: ログイン（JWT発行）
 * - POST /api/auth/logout: ログアウト
 * - GET  /api/auth/me: 現在のユーザー情報取得
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AuthService } from '../services/auth.service';
import { ValidationError } from '../utils/errors';
import { recordAuthEvent } from '../middleware/audit.middleware';
import { logger } from '../utils/logger';

/**
 * POST /api/auth/login
 * メール+パスワードでログイン認証を行い、JWTトークンを発行する
 *
 * リクエストボディ:
 * - email: メールアドレス
 * - password: パスワード
 *
 * レスポンス (200):
 * - token: JWT認証トークン
 * - user: ユーザー情報（パスワードハッシュを含まない）
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const { email, password } = req.body as { email: string; password: string };

    // 認証サービスを呼び出す
    let loginResult;
    try {
      loginResult = await AuthService.login(email, password);
    } catch (authError) {
      // ログイン失敗を監査ログに記録
      await recordAuthEvent(req, 'login_failed', null, {
        email,
        reason: (authError as Error).message,
      });
      throw authError;
    }

    // ログイン成功を監査ログに記録
    await recordAuthEvent(req, 'login_success', loginResult.user.id, {
      email,
      role: loginResult.user.role,
    });

    logger.info('User logged in', { userId: loginResult.user.id, role: loginResult.user.role });

    res.status(200).json({
      token: loginResult.token,
      user: loginResult.user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 * ログアウト処理を行う
 *
 * JWTはステートレスなためサーバーサイドでのトークン無効化は行わない。
 * クライアント側でトークンを削除することでログアウト状態になる。
 * 監査ログにログアウトイベントを記録する。
 *
 * レスポンス (200):
 * - message: ログアウト完了メッセージ
 *
 * @param req - Expressリクエストオブジェクト（authenticate middleware後に使用）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId || null;

    // ログアウトを監査ログに記録
    await recordAuthEvent(req, 'logout', userId, {
      email: req.user?.email,
      role: req.user?.role,
    });

    logger.info('User logged out', { userId });

    res.status(200).json({ message: 'ログアウトしました' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * 現在ログイン中のユーザー情報を取得する
 *
 * JWTから取得したユーザーIDでDBを検索し、最新の情報を返す。
 * （JWTのペイロードにキャッシュされた情報ではなくDBから最新情報を取得する）
 *
 * レスポンス (200):
 * - user: ユーザー情報（パスワードハッシュを含まない）
 *
 * @param req - Expressリクエストオブジェクト（authenticate middleware後に使用）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // authenticate middlewareでreq.userがセットされていることが前提
    const userId = req.user!.userId;

    const user = await AuthService.getMe(userId);

    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}
