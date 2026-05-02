/**
 * @file rbac.middleware.ts
 * @description ロールベースアクセス制御（RBAC）ミドルウェア
 *
 * authenticate() ミドルウェアで認証済みのreq.userのロールに基づいて、
 * 特定ロールのみアクセスを許可する。
 *
 * ロール定義:
 * - admin: システム管理者（全機能へのアクセス）
 * - author: 著者（自分の書籍・サイン管理）
 * - fan: ファン（本棚・書籍閲覧のみ）
 *
 * 使い方:
 * router.post('/books', authenticate, requireRole('author', 'admin'), controller);
 * router.get('/admin/users', authenticate, requireRole('admin'), controller);
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/** 許可されているロールの型定義 */
type UserRole = 'admin' | 'author' | 'fan';

/**
 * 指定ロールを持つユーザーのみアクセスを許可するミドルウェアファクトリー
 *
 * authenticate() ミドルウェアの後に使用すること。
 * req.userが未設定（未認証）の場合は401エラーを返す。
 * req.userのロールが許可リストにない場合は403エラーを返す。
 *
 * @param roles - アクセスを許可するロールのリスト（複数指定可）
 * @returns Expressミドルウェア関数
 *
 * @example
 * // adminのみ許可
 * router.get('/admin/stats', authenticate, requireRole('admin'), statsController.getStats);
 *
 * // authorとadminを許可
 * router.post('/books', authenticate, requireRole('author', 'admin'), booksController.create);
 *
 * // fanのみ許可
 * router.get('/fan/bookshelf', authenticate, requireRole('fan'), fanController.getBookshelf);
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 認証チェック（authenticate()が先に実行されていることが前提）
    if (!req.user) {
      logger.warn('RBAC check failed: user not authenticated');
      next(new UnauthorizedError('認証が必要です'));
      return;
    }

    const userRole = req.user.role as UserRole;

    // ロールチェック
    if (!roles.includes(userRole)) {
      logger.warn('RBAC check failed: insufficient role', {
        userId: req.user.userId,
        userRole,
        requiredRoles: roles,
      });
      next(new ForbiddenError('このリソースへのアクセス権限がありません'));
      return;
    }

    logger.debug('RBAC check passed', {
      userId: req.user.userId,
      role: userRole,
      allowedRoles: roles,
    });
    next();
  };
}

/**
 * adminロールのみ許可するミドルウェア（requireRole('admin') のショートカット）
 *
 * @example
 * router.get('/admin/users', authenticate, adminOnly, adminController.getUsers);
 */
export const adminOnly = requireRole('admin');

/**
 * author または admin ロールを許可するミドルウェア
 * 著者向け機能（書籍・サイン管理）で使用する
 *
 * @example
 * router.post('/books', authenticate, authorOrAdmin, booksController.create);
 */
export const authorOrAdmin = requireRole('author', 'admin');

/**
 * fanロールのみ許可するミドルウェア（requireRole('fan') のショートカット）
 *
 * @example
 * router.get('/fan/bookshelf', authenticate, fanOnly, fanController.getBookshelf);
 */
export const fanOnly = requireRole('fan');
