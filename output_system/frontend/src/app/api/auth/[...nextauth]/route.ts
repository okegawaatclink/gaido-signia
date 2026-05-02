/**
 * @file api/auth/[...nextauth]/route.ts
 * @description NextAuth.js APIルートハンドラー
 *
 * NextAuth.js v5のApp Router用ルートハンドラー。
 * /api/auth/* 配下の全リクエストを処理する。
 *
 * 処理するルート:
 * - GET  /api/auth/signin: サインイン開始
 * - POST /api/auth/signin: サインインフォームのサブミット
 * - GET  /api/auth/signout: サインアウト開始
 * - POST /api/auth/signout: サインアウト実行
 * - GET  /api/auth/callback/:provider: OAuthコールバック
 * - GET  /api/auth/session: セッション情報取得
 * - GET  /api/auth/csrf: CSRFトークン取得
 * - GET  /api/auth/providers: 利用可能なプロバイダー一覧取得
 */

import { handlers } from '@/lib/auth';

/**
 * GETリクエストハンドラー
 * セッション確認、プロバイダー一覧、OAuthコールバック等に使用される
 */
export const { GET, POST } = handlers;
