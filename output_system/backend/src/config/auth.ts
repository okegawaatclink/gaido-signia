/**
 * @file auth.ts
 * @description 認証設定
 *
 * JWT認証の設定とOAuthプロバイダーの設定を定義する。
 * 管理側（admin/author）はメール+パスワード認証、ファン（fan）はOAuth認証を使用する。
 */

import { logger } from '../utils/logger';

/**
 * JWT設定
 */
export const jwtConfig = {
  /** JWTの署名シークレット（環境変数から取得、本番環境では強力なランダム文字列を使用） */
  secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  /** アクセストークンの有効期限（1時間） */
  accessTokenExpiry: '1h',
  /** リフレッシュトークンの有効期限（7日） */
  refreshTokenExpiry: '7d',
};

/**
 * 認証設定の検証
 * 本番環境でデフォルト値が使用されていないか確認する
 */
export function validateAuthConfig(): void {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-jwt-secret-change-in-production') {
      logger.error('JWT_SECRET is not set or uses default value in production environment');
      throw new Error('JWT_SECRET must be set in production environment');
    }
  }
}

/**
 * OAuthプロバイダー設定（ファン向けソーシャルログイン用）
 * 実際の値は環境変数で設定する
 */
export const oauthConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
    clientSecret: process.env.APPLE_CLIENT_SECRET || '',
  },
};
