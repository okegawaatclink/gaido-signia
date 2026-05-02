/**
 * @file auth.routes.ts
 * @description 認証APIルーター
 *
 * 管理側の認証エンドポイントを定義する。
 * バリデーション、認証ミドルウェア、コントローラーを組み合わせる。
 *
 * エンドポイント一覧:
 * - POST /api/auth/login:  メール+パスワードでログイン
 * - POST /api/auth/logout: ログアウト（要認証）
 * - GET  /api/auth/me:     現在のユーザー情報取得（要認証）
 */

import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { login, logout, getMe } from '../controllers/auth.controller';
import { oauthLogin } from '../controllers/oauth.controller';
import { authenticate } from '../middleware/auth.middleware';

/** 認証ルーター */
const router = Router();

/**
 * ログインのレート制限設定
 * 同一IPから短時間に連続してログインを試みるブルートフォース攻撃を防ぐ
 * 15分間で最大10回のリクエストを許可
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 10, // 最大10回
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'ログイン試行回数が多すぎます。15分後に再試行してください。',
    statusCode: 429,
  },
  standardHeaders: true, // RateLimit-* ヘッダーを返す
  legacyHeaders: false,
});

/**
 * ログインリクエストのバリデーションルール
 * express-validatorを使用してリクエストボディを検証する
 */
const loginValidators = [
  body('email')
    .isEmail()
    .withMessage('有効なメールアドレスを入力してください')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('パスワードを入力してください')
    .isLength({ min: 1 })
    .withMessage('パスワードを入力してください'),
];

/**
 * POST /api/auth/login
 * メールアドレスとパスワードでログインする
 *
 * レート制限: 15分間に10回まで
 * バリデーション: メールアドレス形式チェック、パスワード必須チェック
 *
 * リクエストボディ:
 * {
 *   "email": "admin@example.com",
 *   "password": "password123"
 * }
 *
 * レスポンス (200):
 * {
 *   "token": "eyJhbGc...",
 *   "user": { "id": "...", "email": "...", "name": "...", "role": "admin" }
 * }
 *
 * エラーレスポンス:
 * - 400: バリデーションエラー
 * - 401: 認証失敗（メールまたはパスワードが不正）
 * - 429: レート制限超過
 */
router.post('/login', loginRateLimit, loginValidators, login);

/**
 * POST /api/auth/logout
 * ログアウトする（JWTトークン必須）
 *
 * JWTはステートレスなため、サーバー側でのトークン無効化は行わない。
 * クライアント側でトークンを削除することでログアウト状態になる。
 * 監査ログにログアウトイベントが記録される。
 *
 * レスポンス (200):
 * { "message": "ログアウトしました" }
 */
router.post('/logout', authenticate, logout);

/**
 * GET /api/auth/me
 * 現在のログインユーザー情報を取得する（JWTトークン必須）
 *
 * JWTのペイロードではなく、DBから最新のユーザー情報を返す。
 *
 * レスポンス (200):
 * {
 *   "user": { "id": "...", "email": "...", "name": "...", "role": "admin", ... }
 * }
 */
router.get('/me', authenticate, getMe);

/**
 * OAuthログインのレート制限設定
 * NextAuth.jsからのコールバック呼び出しに適用
 * 15分間で最大50回のリクエストを許可（複数ユーザーが同時にログインするケースを考慮）
 */
const oauthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 50, // 最大50回
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'リクエスト数が多すぎます。15分後に再試行してください。',
    statusCode: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * OAuthリクエストのバリデーションルール
 * NextAuth.jsが送信するプロバイダー情報を検証する
 */
const oauthValidators = [
  body('provider')
    .isIn(['google', 'apple'])
    .withMessage('有効なOAuthプロバイダーを指定してください'),
  body('providerId')
    .notEmpty()
    .withMessage('プロバイダーIDは必須です')
    .isString()
    .trim(),
  body('email')
    .isEmail()
    .withMessage('有効なメールアドレスを入力してください')
    .normalizeEmail(),
  body('name')
    .notEmpty()
    .withMessage('名前は必須です')
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('名前は100文字以内で入力してください'),
  body('avatarUrl')
    .optional({ nullable: true })
    .isURL()
    .withMessage('有効なURLを入力してください'),
];

/**
 * POST /api/auth/oauth
 * OAuthプロバイダー経由でファンアカウントを作成または取得する
 *
 * NextAuth.jsのsignInコールバックから呼び出される。
 * 初回ログイン時にfanロールでアカウントを自動作成する。
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
 */
router.post('/oauth', oauthRateLimit, oauthValidators, oauthLogin);

export default router;
