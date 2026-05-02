/**
 * @file rate-limit.middleware.ts
 * @description レート制限ミドルウェア
 *
 * express-rate-limitを使用してAPIエンドポイントへのアクセス頻度を制限する。
 * 外部連携APIにはAPI Key単位でのレート制限を適用する。
 *
 * 設計方針:
 * - 外部連携API: 100 req/min/API Key
 * - 一般API（JWT認証）: 200 req/min/IP
 * - レート制限超過時: 429 Too Many Requests を返す
 * - Retry-After ヘッダーを含めてクライアントに再試行タイミングを通知する
 *
 * 参考: https://github.com/express-rate-limit/express-rate-limit
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * 外部連携API用レート制限ミドルウェア
 *
 * API Keyごとに 100 req/min のレート制限を適用する。
 * authenticateApiKey ミドルウェアの後に適用することで、
 * req.apiKey.id をキーとしてAPI Key単位でカウントする。
 *
 * authenticateApiKey の前に配置する場合は IPベースでカウントされる。
 *
 * @example
 * router.use(externalApiRateLimit);
 * router.use(authenticateApiKey);
 */
export const externalApiRateLimit: RateLimitRequestHandler = rateLimit({
  // ウィンドウ期間: 1分（60,000ms）
  windowMs: 60 * 1000,

  // 1ウィンドウあたりの最大リクエスト数: 100 req/min
  max: 100,

  // レート制限のキー生成関数
  // API Key認証後であればAPI Key IDをキーに、未認証の場合はIPアドレスをキーにする
  keyGenerator: (req: Request): string => {
    // req.apiKey は authenticateApiKey の後に設定される
    // ルーターで authenticateApiKey → externalApiRateLimit の順に適用する場合は
    // API Key IDをキーとして使用できる
    if (req.apiKey?.id) {
      return `api_key:${req.apiKey.id}`;
    }
    // フォールバック: IPアドレスをキーにする
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return `ip:${ips.split(',')[0].trim()}`;
    }
    return `ip:${req.socket?.remoteAddress || 'unknown'}`;
  },

  // レート制限超過時のレスポンス
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'レート制限を超過しました。しばらく経ってから再試行してください。',
      statusCode: 429,
    });
  },

  // 標準のRateLimitヘッダーを含める（RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset）
  standardHeaders: true,

  // 非推奨のX-RateLimit-*ヘッダーを無効化
  legacyHeaders: false,

  // レート制限メッセージ（handlerで上書きするため参照されない）
  message: 'レート制限を超過しました。しばらく経ってから再試行してください。',
});

/**
 * 一般API用レート制限ミドルウェア（IPアドレスベース）
 *
 * JWT認証APIに対して IP アドレスごとに 200 req/min のレート制限を適用する。
 * ブルートフォース攻撃などの過剰アクセスを防ぐための基本的な保護。
 */
export const generalApiRateLimit: RateLimitRequestHandler = rateLimit({
  // ウィンドウ期間: 1分（60,000ms）
  windowMs: 60 * 1000,

  // 1ウィンドウあたりの最大リクエスト数: 200 req/min
  max: 200,

  // レート制限超過時のレスポンス
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'レート制限を超過しました。しばらく経ってから再試行してください。',
      statusCode: 429,
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 認証エンドポイント用レート制限ミドルウェア（ブルートフォース対策）
 *
 * ログインエンドポイントに対して IP アドレスごとに 10 req/min のレート制限を適用する。
 * パスワードスプレー攻撃やブルートフォース攻撃への対策。
 */
export const authRateLimit: RateLimitRequestHandler = rateLimit({
  // ウィンドウ期間: 1分（60,000ms）
  windowMs: 60 * 1000,

  // 1ウィンドウあたりの最大リクエスト数: 10 req/min（ログインは厳しく制限）
  max: 10,

  // レート制限超過時のレスポンス
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: '認証試行回数が上限に達しました。しばらく経ってから再試行してください。',
      statusCode: 429,
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});
