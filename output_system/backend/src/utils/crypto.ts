/**
 * @file crypto.ts
 * @description パスワードハッシュ化・JWT生成・検証ユーティリティ
 *
 * bcryptjsを使用したパスワードハッシュ化と、
 * jsonwebtokenを使用したJWT生成・検証機能を提供する。
 *
 * セキュリティ設定:
 * - bcrypt salt rounds: 12（適度なセキュリティとパフォーマンスのバランス）
 * - JWT有効期限: 24時間
 * - JWTシークレット: 環境変数 JWT_SECRET から取得（必須）
 */

import bcrypt from 'bcryptjs';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { logger } from './logger';

/** bcryptのsalt rounds（値が大きいほど安全だがハッシュ化に時間がかかる。12は推奨値） */
const BCRYPT_SALT_ROUNDS = 12;

/** JWTの有効期限: 24時間 */
const JWT_EXPIRES_IN = '24h';

/**
 * JWT秘密鍵を環境変数から取得する
 * 起動時に未設定の場合は警告ログを出力する
 *
 * @returns JWT秘密鍵文字列
 * @throws {Error} JWT_SECRETが設定されていない場合
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET environment variable is not set');
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

// ===== パスワード関連 =====

/**
 * パスワードをbcryptでハッシュ化する
 *
 * @param password - ハッシュ化する平文パスワード
 * @returns ハッシュ化されたパスワード文字列
 *
 * @example
 * const hash = await hashPassword('mySecurePassword');
 */
export async function hashPassword(password: string): Promise<string> {
  // saltを生成してパスワードをハッシュ化
  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  return hashedPassword;
}

/**
 * 平文パスワードとハッシュを比較して検証する
 *
 * タイミング攻撃対策: bcrypt.compareはハッシュ比較を定時間で実行するため、
 * 存在しないユーザーへの攻撃でも応答時間に差が出にくい
 *
 * @param password - 検証する平文パスワード
 * @param hash - 比較対象のハッシュ
 * @returns 一致する場合はtrue、しない場合はfalse
 *
 * @example
 * const isValid = await verifyPassword('inputPassword', storedHash);
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ===== JWT関連 =====

/**
 * JWTペイロードの型定義
 * ユーザー情報をJWTに含めるために使用する
 */
export interface JwtUserPayload {
  /** ユーザーID（UUID） */
  userId: string;
  /** メールアドレス */
  email: string;
  /** ロール: admin / author / fan */
  role: 'admin' | 'author' | 'fan';
}

/**
 * JWTトークンを生成する
 *
 * @param payload - JWTに含めるユーザー情報
 * @returns 署名済みJWTトークン文字列
 *
 * @example
 * const token = generateToken({ userId: 'uuid', email: 'user@example.com', role: 'author' });
 */
export function generateToken(payload: JwtUserPayload): string {
  const secret = getJwtSecret();
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN,
    // アルゴリズムはデフォルトのHS256を使用（対称鍵署名）
    algorithm: 'HS256',
  };
  return jwt.sign(payload, secret, options);
}

/**
 * JWTトークンを検証してペイロードを返す
 *
 * @param token - 検証するJWTトークン文字列
 * @returns デコードされたペイロード（JwtUserPayload）
 * @throws {Error} トークンが無効・期限切れの場合
 *
 * @example
 * try {
 *   const payload = verifyToken(token);
 *   console.log(payload.userId);
 * } catch (err) {
 *   // 無効なトークン
 * }
 */
export function verifyToken(token: string): JwtUserPayload & JwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  return decoded as JwtUserPayload & JwtPayload;
}

/**
 * JWTトークンをデコードして（検証せずに）ペイロードを返す
 * デバッグ目的や署名検証前の情報取得に使用する
 *
 * 警告: この関数はトークンの有効性を検証しない。
 * 認証目的には必ず verifyToken() を使用すること。
 *
 * @param token - デコードするJWTトークン文字列
 * @returns デコードされたペイロード、またはnull（デコード失敗時）
 */
export function decodeToken(token: string): (JwtUserPayload & JwtPayload) | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') {
    return null;
  }
  return decoded as JwtUserPayload & JwtPayload;
}
