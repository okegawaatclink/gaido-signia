/**
 * @file auth.service.ts
 * @description 認証サービス
 *
 * メール+パスワード認証のビジネスロジックを実装する。
 * パスワード検証、JWTトークン生成、ユーザー情報取得を担当する。
 *
 * セキュリティ考慮事項:
 * - タイミング攻撃対策: 存在しないメールでも同じ処理時間になるようにする
 * - パスワードハッシュはレスポンスに含めない
 * - 失敗時はメールアドレスの存在を明かさない（同一エラーメッセージ）
 */

import { UserModel, UserWithoutPassword } from '../models/user.model';
import { verifyPassword, generateToken, JwtUserPayload } from '../utils/crypto';
import { UnauthorizedError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * ログイン結果の型定義
 * JWTトークンとユーザー情報を返す
 */
export interface LoginResult {
  /** JWT認証トークン */
  token: string;
  /** ユーザー情報（パスワードハッシュを含まない） */
  user: UserWithoutPassword;
}

/**
 * メール+パスワードでログイン認証を行う
 *
 * タイミング攻撃対策:
 * - ユーザーが存在しない場合もbcrypt.compareを実行して応答時間を均一化する
 * - エラーメッセージは「メールまたはパスワードが正しくありません」に統一する
 *   （メールアドレスの存在を攻撃者に明かさないため）
 *
 * @param email - ログインするメールアドレス
 * @param password - 平文パスワード
 * @returns ログイン結果（JWTトークン + ユーザー情報）
 * @throws {UnauthorizedError} 認証失敗時（メールまたはパスワードが不正）
 * @throws {UnauthorizedError} アカウントが無効化されている場合
 *
 * @example
 * const result = await login('admin@example.com', 'password123');
 * // result.token: JWT文字列
 * // result.user: ユーザー情報（パスワードなし）
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  // ダミーハッシュ: ユーザーが存在しない場合のタイミング攻撃対策
  // bcrypt.compareをスキップすると応答時間が短くなりユーザー存在確認ができてしまう
  const DUMMY_HASH = '$2a$12$dummyhashfortimingtackprotectionpurposesonly000000000000';

  // ユーザーをDBから取得（パスワードハッシュ含む）
  const user = await UserModel.findByEmail(email);

  if (!user) {
    // ユーザーが存在しない場合もdummyハッシュでbcrypt.compareを実行（タイミング攻撃対策）
    await verifyPassword(password, DUMMY_HASH);
    logger.warn('Login failed: user not found', { email });
    throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません');
  }

  // パスワードが設定されていないユーザー（OAuthユーザー等）はパスワード認証不可
  if (!user.passwordHash) {
    await verifyPassword(password, DUMMY_HASH);
    logger.warn('Login failed: user has no password (OAuth only)', { email, userId: user.id });
    throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません');
  }

  // パスワード検証
  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    logger.warn('Login failed: invalid password', { email, userId: user.id });
    throw new UnauthorizedError('メールアドレスまたはパスワードが正しくありません');
  }

  // アカウント有効チェック
  if (!user.isActive) {
    logger.warn('Login failed: account is deactivated', { email, userId: user.id });
    throw new UnauthorizedError('このアカウントは無効化されています');
  }

  // JWTトークンを生成
  const jwtPayload: JwtUserPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const token = generateToken(jwtPayload);

  logger.info('Login successful', { userId: user.id, role: user.role });

  // パスワードハッシュを含まないユーザー情報を作成
  const userWithoutPassword: UserWithoutPassword = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    oauthProvider: user.oauthProvider,
    oauthProviderId: user.oauthProviderId,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { token, user: userWithoutPassword };
}

/**
 * ユーザーID（JWTのsub）で現在のユーザー情報を取得する
 *
 * @param userId - ユーザーID（UUID）
 * @returns ユーザー情報（パスワードハッシュなし）
 * @throws {NotFoundError} ユーザーが見つからない場合
 * @throws {UnauthorizedError} アカウントが無効化されている場合
 *
 * @example
 * const user = await getMe('123e4567-...');
 */
export async function getMe(userId: string): Promise<UserWithoutPassword> {
  const user = await UserModel.findByIdWithoutPassword(userId);

  if (!user) {
    logger.warn('GetMe failed: user not found', { userId });
    throw new NotFoundError('ユーザーが見つかりません');
  }

  if (!user.isActive) {
    logger.warn('GetMe failed: account is deactivated', { userId });
    throw new UnauthorizedError('このアカウントは無効化されています');
  }

  return user;
}

/**
 * AuthServiceオブジェクト（名前空間として公開）
 */
export const AuthService = {
  login,
  getMe,
};
