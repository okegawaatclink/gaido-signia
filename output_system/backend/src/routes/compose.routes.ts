/**
 * @file compose.routes.ts
 * @description サイン合成APIルーター
 *
 * サイン合成エンドポイントを定義する。
 *
 * エンドポイント:
 * - POST /api/compose     : 合成リクエスト受付（書籍・サイン・ファン指定）
 * - GET  /api/compose/:id : 合成結果取得（signed_books ID指定）
 *
 * 認証・認可:
 * - 全エンドポイントにJWT認証が必要（authenticate）
 * - author ロールのみアクセス可能（requireRole）
 *   ※ サイン合成は著者専用機能
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { createCompose, getCompose } from '../controllers/compose.controller';

const router = Router();

// ======= ルート定義 =======

/**
 * POST /api/compose
 * サイン合成リクエストを受け付ける
 *
 * リクエストボディ:
 * - bookId: 合成対象の書籍ID（UUID、必須）
 * - signId: 使用するサインID（UUID、必須）
 * - fanIds: 対象ファンIDの配列（UUID配列、1件以上必須）
 * - recipientNames: 個別サイン宛名マップ（オプション）
 *   例: { "fan-uuid-1": "山田太郎", "fan-uuid-2": "田中花子" }
 */
router.post(
  '/',
  authenticate,
  requireRole('author'),
  [
    // 書籍IDは必須（UUID形式）
    body('bookId')
      .notEmpty().withMessage('書籍IDは必須です')
      .isUUID().withMessage('書籍IDの形式が不正です'),
    // サインIDは必須（UUID形式）
    body('signId')
      .notEmpty().withMessage('サインIDは必須です')
      .isUUID().withMessage('サインIDの形式が不正です'),
    // ファンIDの配列は必須（1件以上、各要素はUUID）
    body('fanIds')
      .isArray({ min: 1 }).withMessage('fanIdsは1件以上のUUID配列を指定してください'),
    body('fanIds.*')
      .isUUID().withMessage('fanIds内の各要素はUUID形式で指定してください'),
    // 宛名マップはオプション（オブジェクト形式）
    body('recipientNames')
      .optional()
      .isObject().withMessage('recipientNamesはオブジェクト形式で指定してください'),
  ],
  createCompose
);

/**
 * GET /api/compose/:id
 * 合成結果を取得する
 *
 * URLパラメータ:
 * - id: サイン入り書籍ID（signed_booksテーブルのUUID）
 */
router.get(
  '/:id',
  authenticate,
  requireRole('author'),
  [
    param('id').isUUID().withMessage('サイン入り書籍IDの形式が不正です'),
  ],
  getCompose
);

export default router;
