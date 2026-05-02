/**
 * @file auth.middleware.ts
 * @description JWT認証ミドルウェア
 *
 * リクエストのAuthorizationヘッダーからJWTトークンを取得・検証し、
 * 認証済みユーザー情報をreq.userにセットする。
 *
 * 使い方:
 * router.get('/protected', authenticate, (req, res) => { ... });
 * router.get('/optional', optionalAuthenticate, (req, res) => { ... });
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtUserPayload } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Express RequestオブジェクトへのユーザープロパティのType拡張
 * 認証後のリクエストでreq.userにアクセス可能にする
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 認証済みユーザー情報（JWT検証後にセットされる） */
      user?: JwtUserPayload;
    }
  }
}

/**
 * Authorizationヘッダーからベアラートークンを抽出する
 *
 * @param authHeader - リクエストのAuthorizationヘッダー値
 * @returns トークン文字列、または未設定/不正な形式の場合はnull
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  // "Bearer <token>" 形式のみ受け付ける
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1];
}

/**
 * JWT認証ミドルウェア（必須認証）
 *
 * 有効なJWTトークンが必要なエンドポイントに適用する。
 * 認証に失敗した場合は401エラーを返す。
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 *
 * @example
 * router.get('/books', authenticate, booksController.getBooks);
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedError('認証トークンが必要です');
    }

    // JWTを検証してペイロードをreq.userにセット
    const payload = verifyToken(token);
    req.user = payload;

    logger.debug('Authentication successful', { userId: payload.userId, role: payload.role });
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      // JWT検証エラー（期限切れ・不正な署名等）は全て401として扱う
      logger.debug('Authentication failed', { error: (error as Error).message });
      next(new UnauthorizedError('トークンが無効か期限切れです'));
    }
  }
}

/**
 * JWT認証ミドルウェア（任意認証）
 *
 * JWTが提供されている場合は検証してreq.userにセットするが、
 * 未提供の場合はエラーにしない（req.userはundefinedのまま）。
 * 認証済み・未認証の両方を許容するエンドポイントに使用する。
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    // トークンがない場合はそのまま続行（未認証状態）
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    logger.debug('Optional authentication successful', { userId: payload.userId });
  } catch (error) {
    // 任意認証の場合はトークンが無効でもエラーにしない
    logger.debug('Optional authentication token invalid, continuing unauthenticated', {
      error: (error as Error).message,
    });
  }
  next();
}
