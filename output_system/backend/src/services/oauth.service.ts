/**
 * @file oauth.service.ts
 * @description OAuthソーシャルログインサービス
 *
 * NextAuth.jsからのOAuthコールバックを処理し、ファンアカウントの
 * 作成または取得を行うビジネスロジックを実装する。
 *
 * 処理フロー:
 * 1. OAuthプロバイダーとプロバイダーIDでユーザーを検索
 * 2. 見つかった場合: 既存ユーザーとしてJWTを発行
 * 3. 見つからない場合:
 *    a. メールアドレスで既存ユーザーを検索（同一メールで別プロバイダーのケース）
 *    b. 存在しなければfanロールで新規アカウントを作成
 *    c. JWTを発行
 *
 * セキュリティ考慮事項:
 * - プロバイダーIDはOAuthプロバイダーが保証するため、改ざんリスクが低い
 * - メールアドレスはプロバイダーが検証済みのものを使用する
 * - 新規作成時は必ずfanロールを付与する（管理者ロールの不正付与を防止）
 */

import { db } from '../config/database';
import { generateToken, JwtUserPayload } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * OAuthログイン結果の型定義
 */
export interface OAuthLoginResult {
  /** バックエンドが発行したJWTトークン */
  token: string;
  /** ユーザー情報 */
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'author' | 'fan';
    avatarUrl: string | null;
    isActive: boolean;
    oauthProvider: string;
    oauthProviderId: string;
    createdAt: string;
    updatedAt: string;
  };
  /** 新規作成されたかどうか */
  isNewUser: boolean;
}

/**
 * DBの行データをユーザー情報にマッピングするヘルパー
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToUser(row: Record<string, any>): OAuthLoginResult['user'] {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    oauthProvider: row.oauth_provider,
    oauthProviderId: row.oauth_provider_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/**
 * OAuthプロバイダー経由でファンアカウントを作成または取得し、JWTを発行する
 *
 * 以下の順序で処理する:
 * 1. oauth_provider + oauth_provider_id で既存ユーザーを検索
 * 2. 見つからない場合はメールアドレスで検索
 * 3. どちらにも見つからない場合はfanロールで新規作成
 *
 * @param provider - OAuthプロバイダー名（'google' または 'apple'）
 * @param providerId - OAuthプロバイダーが発行するユーザーID
 * @param email - OAuthプロバイダーが提供するメールアドレス
 * @param name - OAuthプロバイダーが提供する表示名
 * @param avatarUrl - OAuthプロバイダーが提供するアバターURL（省略可）
 * @returns JWT発行結果とユーザー情報
 * @throws {UnauthorizedError} アカウントが無効化されている場合
 */
export async function loginOrRegisterWithOAuth(
  provider: string,
  providerId: string,
  email: string,
  name: string,
  avatarUrl: string | null = null
): Promise<OAuthLoginResult> {
  // Step 1: oauth_provider + oauth_provider_id で既存ユーザーを検索
  let userRow: Record<string, unknown> | null = null;
  let isNewUser = false;

  const existingByProvider = await db.query<Record<string, unknown>>(
    `SELECT id, email, name, role, avatar_url, is_active, oauth_provider, oauth_provider_id,
            created_at, updated_at
     FROM users
     WHERE oauth_provider = $1 AND oauth_provider_id = $2`,
    [provider, providerId]
  );

  if (existingByProvider.rows.length > 0) {
    // 既存ユーザーが見つかった場合
    userRow = existingByProvider.rows[0];
    logger.info('OAuth login: existing user found by provider', {
      provider,
      userId: userRow.id,
    });

    // アバターURLを最新のものに更新（プロバイダーのプロフィール変更を反映）
    if (avatarUrl && avatarUrl !== userRow.avatar_url) {
      await db.query(
        `UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [avatarUrl, userRow.id]
      );
      userRow.avatar_url = avatarUrl;
      userRow.updated_at = new Date();
    }
  } else {
    // Step 2: メールアドレスで既存ユーザーを検索
    const existingByEmail = await db.query<Record<string, unknown>>(
      `SELECT id, email, name, role, avatar_url, is_active, oauth_provider, oauth_provider_id,
              created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existingByEmail.rows.length > 0) {
      // 同じメールアドレスで異なるプロバイダーのユーザーが見つかった場合
      // oauth_provider / oauth_provider_id を更新して紐付け
      userRow = existingByEmail.rows[0];
      logger.info('OAuth login: existing user found by email, linking provider', {
        provider,
        userId: userRow.id,
        existingProvider: userRow.oauth_provider,
      });

      await db.query(
        `UPDATE users
         SET oauth_provider = $1, oauth_provider_id = $2,
             avatar_url = COALESCE($3, avatar_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [provider, providerId, avatarUrl, userRow.id]
      );
      userRow.oauth_provider = provider;
      userRow.oauth_provider_id = providerId;
      if (avatarUrl) {
        userRow.avatar_url = avatarUrl;
      }
      userRow.updated_at = new Date();
    } else {
      // Step 3: 新規ファンアカウントを作成
      const newUserResult = await db.query<Record<string, unknown>>(
        `INSERT INTO users (email, name, role, oauth_provider, oauth_provider_id, avatar_url, is_active)
         VALUES ($1, $2, 'fan', $3, $4, $5, true)
         RETURNING id, email, name, role, avatar_url, is_active, oauth_provider, oauth_provider_id,
                   created_at, updated_at`,
        [email, name, provider, providerId, avatarUrl]
      );

      userRow = newUserResult.rows[0];
      isNewUser = true;
      logger.info('OAuth login: new fan user created', {
        provider,
        userId: userRow.id,
        email,
      });
    }
  }

  const user = mapRowToUser(userRow);

  // アカウント有効チェック
  if (!user.isActive) {
    logger.warn('OAuth login failed: account is deactivated', {
      provider,
      userId: user.id,
    });
    throw new UnauthorizedError('このアカウントは無効化されています');
  }

  // JWTトークンを生成
  const jwtPayload: JwtUserPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const token = generateToken(jwtPayload);

  logger.info('OAuth login successful', {
    provider,
    userId: user.id,
    role: user.role,
    isNewUser,
  });

  return { token, user, isNewUser };
}

/**
 * OAuthServiceオブジェクト（名前空間として公開）
 */
export const OAuthService = {
  loginOrRegisterWithOAuth,
};
