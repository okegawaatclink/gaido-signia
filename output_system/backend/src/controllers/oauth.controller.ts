/**
 * @file oauth.controller.ts
 * @description OAuth認証コントローラー
 *
 * NextAuth.jsからのOAuthコールバックを処理するHTTPリクエストハンドラー。
 * フロントエンド（NextAuth.js）がOAuth認証後にバックエンドを呼び出し、
 * ファンアカウントの作成またはログインを行う。
 *
 * エンドポイント:
 * - POST /api/auth/oauth: OAuthログイン/ファンアカウント作成
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { OAuthService } from '../services/oauth.service';
import { ValidationError } from '../utils/errors';
import { recordAuthEvent } from '../middleware/audit.middleware';
import { logger } from '../utils/logger';

/**
 * POST /api/auth/oauth
 * OAuthプロバイダー経由でファンアカウントを作成または取得し、JWTを発行する
 *
 * NextAuth.js の signInコールバックから呼び出される。
 * プロバイダーIDとメールアドレスを使ってファンアカウントの登録/取得を行い、
 * バックエンド独自のJWTトークンを発行する。
 *
 * リクエストボディ:
 * {
 *   "provider": "google" | "apple",
 *   "providerId": "プロバイダー固有のユーザーID",
 *   "email": "user@example.com",
 *   "name": "ユーザー表示名",
 *   "avatarUrl": "https://..." | null
 * }
 *
 * レスポンス (200):
 * {
 *   "token": "eyJhbGc...",
 *   "user": { "id": "...", "email": "...", "name": "...", "role": "fan", ... },
 *   "isNewUser": true/false
 * }
 *
 * エラーレスポンス:
 * - 400: バリデーションエラー
 * - 401: アカウントが無効化されている
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function oauthLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      provider,
      providerId,
      email,
      name,
      avatarUrl = null,
    } = req.body as {
      provider: string;
      providerId: string;
      email: string;
      name: string;
      avatarUrl?: string | null;
    };

    // OAuthサービスを呼び出してファンアカウントを作成/取得
    let oauthResult;
    try {
      oauthResult = await OAuthService.loginOrRegisterWithOAuth(
        provider,
        providerId,
        email,
        name,
        avatarUrl || null
      );
    } catch (authError) {
      // ログイン失敗を監査ログに記録
      await recordAuthEvent(req, 'login_failed', null, {
        provider,
        email,
        reason: (authError as Error).message,
      });
      throw authError;
    }

    // ログイン成功を監査ログに記録
    const auditAction = oauthResult.isNewUser ? 'login_success' : 'login_success';
    await recordAuthEvent(req, auditAction, oauthResult.user.id, {
      provider,
      email,
      role: oauthResult.user.role,
      isNewUser: oauthResult.isNewUser,
    });

    logger.info('OAuth login/registration successful', {
      provider,
      userId: oauthResult.user.id,
      role: oauthResult.user.role,
      isNewUser: oauthResult.isNewUser,
    });

    res.status(200).json({
      token: oauthResult.token,
      user: oauthResult.user,
      isNewUser: oauthResult.isNewUser,
    });
  } catch (error) {
    next(error);
  }
}
