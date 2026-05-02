/**
 * @file fan.routes.ts
 * @description ファン向けAPIルーター
 *
 * ファンが使用するエンドポイントを定義する。
 * 全エンドポイントにJWT認証とfanロール制限を適用する。
 *
 * エンドポイント:
 * - GET /api/fan/bookshelf        : 本棚（自分のサイン入り書籍一覧）
 * - GET /api/fan/books/:id/read   : 書籍閲覧URL取得（署名付きURL）
 *
 * 認証・認可:
 * - authenticate: JWTトークン必須
 * - fanOnly: fanロールのみアクセス可能（author/adminは403）
 *
 * セキュリティ:
 * - fanOnly ミドルウェアにより、著者や管理者がこのエンドポイントにアクセスできない
 * - サービス層でも fanId に基づくデータ分離が行われる（二重防御）
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { fanOnly } from '../middleware/rbac.middleware';
import {
  getBookshelf,
  getBookReadUrl,
  bookIdValidation,
} from '../controllers/fan.controller';

const router = Router();

/**
 * GET /api/fan/bookshelf
 * ファンの本棚（サイン入り書籍一覧）を取得する
 *
 * 認証済みファン自身の書籍のみを返す。
 * 書籍がない場合は空配列を返す（404ではなく200）。
 *
 * @auth required（JWT + fanロール）
 * @response 200 - BookshelfItem[]（本棚アイテムの配列）
 */
router.get('/bookshelf', authenticate, fanOnly, getBookshelf);

/**
 * GET /api/fan/books/:id/read
 * 書籍閲覧用の署名付きURLを取得する
 *
 * ファンが所有する書籍のみアクセス可能。
 * 他のファンの書籍へのアクセスは403を返す。
 *
 * @auth required（JWT + fanロール）
 * @param id - 書籍ID（UUID）
 * @response 200 - { url: string, expiresAt: string }
 * @response 403 - アクセス権なし
 */
router.get('/books/:id/read', authenticate, fanOnly, ...bookIdValidation, getBookReadUrl);

export default router;
