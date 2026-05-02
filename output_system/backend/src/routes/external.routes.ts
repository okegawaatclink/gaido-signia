/**
 * @file external.routes.ts
 * @description 外部連携API ルーター
 *
 * 外部購入システムからのAPI呼び出しを処理するルーターを定義する。
 * 全エンドポイントにAPI Key認証（X-API-Keyヘッダー）とレート制限が適用される。
 *
 * エンドポイント:
 * - POST   /api/external/book-access     : ファンに書籍アクセス権を付与
 * - DELETE /api/external/book-access/:id : アクセス権を削除
 * - GET    /api/external/book-access     : アクセス権一覧取得
 * - POST   /api/external/signs           : サインデータを登録
 * - GET    /api/external/signs/:id       : サインデータを取得
 *
 * 認証フロー:
 * 1. externalApiRateLimit: リクエスト頻度を制限（100 req/min/API Key）
 * 2. authenticateApiKey: X-API-KeyヘッダーでAPI Key認証
 *    → 認証後に req.apiKey に認証済みAPIキー情報がセットされる
 *
 * 注意: レート制限は authenticateApiKey の後に適用することで
 *       API Key単位でカウントが行われる
 */

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateApiKey } from '../middleware/api-key.middleware';
import { externalApiRateLimit } from '../middleware/rate-limit.middleware';
import {
  grantBookAccess,
  deleteBookAccess,
  listBookAccess,
  createExternalSign,
  getExternalSign,
} from '../controllers/external.controller';

const router = Router();

// ルーター全体にAPI Key認証とレート制限を適用
// 順序: API Key認証 → レート制限（API Key IDを使ってレート制限を適用するため）
router.use(authenticateApiKey);
router.use(externalApiRateLimit);

// ======= 書籍アクセス権管理ルート =======

/**
 * POST /api/external/book-access
 * ファンに書籍アクセス権を付与する
 *
 * リクエストボディのバリデーション:
 * - bookId: UUID形式の書籍ID（必須）
 * - fanEmail: 有効なメールアドレス（必須）
 * - externalReference: 外部システム参照ID（オプション）
 */
router.post(
  '/book-access',
  [
    // bookId は必須かつ UUID 形式
    body('bookId')
      .notEmpty()
      .withMessage('bookId は必須です')
      .isUUID()
      .withMessage('bookId は UUID 形式で指定してください'),
    // fanEmail は必須かつ有効なメールアドレス形式
    body('fanEmail')
      .notEmpty()
      .withMessage('fanEmail は必須です')
      .isEmail()
      .withMessage('fanEmail は有効なメールアドレス形式で指定してください')
      .normalizeEmail(),
    // externalReference はオプション（外部システムの注文ID等）
    body('externalReference')
      .optional()
      .isString()
      .withMessage('externalReference は文字列で指定してください')
      .isLength({ max: 255 })
      .withMessage('externalReference は 255 文字以内で指定してください')
      .trim(),
  ],
  grantBookAccess
);

/**
 * DELETE /api/external/book-access/:id
 * 指定IDの書籍アクセス権を削除する
 *
 * パラメータバリデーション:
 * - id: UUID形式のアクセス権ID
 */
router.delete(
  '/book-access/:id',
  [param('id').isUUID().withMessage('アクセス権 ID は UUID 形式で指定してください')],
  deleteBookAccess
);

/**
 * GET /api/external/book-access
 * 書籍アクセス権一覧を取得する（外部APIによる付与分のみ）
 *
 * クエリパラメータ（すべてオプション）:
 * - bookId: 書籍IDでフィルタ（UUID形式）
 * - fanId: ファンIDでフィルタ（UUID形式）
 * - externalReference: 外部参照IDでフィルタ
 */
router.get(
  '/book-access',
  [
    query('bookId')
      .optional()
      .isUUID()
      .withMessage('bookId は UUID 形式で指定してください'),
    query('fanId')
      .optional()
      .isUUID()
      .withMessage('fanId は UUID 形式で指定してください'),
    query('externalReference')
      .optional()
      .isString()
      .withMessage('externalReference は文字列で指定してください')
      .trim(),
  ],
  listBookAccess
);

// ======= サインデータ管理ルート =======

/**
 * POST /api/external/signs
 * サインデータを登録する
 *
 * リクエストボディのバリデーション:
 * - authorId: UUID形式の著者ID（必須）
 * - name: サイン名（必須、1〜100文字）
 * - type: サイン種別（必須: common / individual）
 * - imageBase64: Base64エンコードされたPNG画像（必須）
 */
router.post(
  '/signs',
  [
    // authorId は必須かつ UUID 形式
    body('authorId')
      .notEmpty()
      .withMessage('authorId は必須です')
      .isUUID()
      .withMessage('authorId は UUID 形式で指定してください'),
    // name は必須かつ 1〜100 文字
    body('name')
      .notEmpty()
      .withMessage('name は必須です')
      .isLength({ min: 1, max: 100 })
      .withMessage('name は 1〜100 文字で指定してください')
      .trim(),
    // type は必須かつ common / individual のいずれか
    body('type')
      .notEmpty()
      .withMessage('type は必須です')
      .isIn(['common', 'individual'])
      .withMessage('type は common または individual で指定してください'),
    // imageBase64 は必須（サイズチェックはサービス層で実施）
    body('imageBase64')
      .notEmpty()
      .withMessage('imageBase64 は必須です')
      .isString()
      .withMessage('imageBase64 は文字列で指定してください'),
  ],
  createExternalSign
);

/**
 * GET /api/external/signs/:id
 * 指定IDのサインデータを取得する
 *
 * パラメータバリデーション:
 * - id: UUID形式のサインID
 */
router.get(
  '/signs/:id',
  [param('id').isUUID().withMessage('サイン ID は UUID 形式で指定してください')],
  getExternalSign
);

export default router;
