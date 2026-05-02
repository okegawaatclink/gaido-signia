/**
 * @file admin.routes.ts
 * @description 管理者向け API ルーター
 *
 * 著者アカウント管理エンドポイントを定義する。
 *
 * エンドポイント:
 * - GET    /api/admin/authors       : 著者一覧取得
 * - POST   /api/admin/authors       : 著者アカウント作成
 * - GET    /api/admin/authors/:id   : 著者詳細取得（登録書籍一覧含む）
 * - PUT    /api/admin/authors/:id   : 著者情報更新
 * - DELETE /api/admin/authors/:id   : 著者アカウント無効化（論理削除）
 *
 * 認証・認可:
 * - 全エンドポイントに JWT 認証が必要（authenticate）
 * - admin ロールのみアクセス可能（adminOnly）
 * - admin 以外のロール（author, fan）には 403 が返る
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { adminOnly } from '../middleware/rbac.middleware';
import {
  getAuthors,
  createAuthor,
  getAuthor,
  updateAuthor,
  deactivateAuthor,
} from '../controllers/admin.controller';
import {
  listApiKeys,
  createApiKey,
  getApiKey,
  deactivateApiKey,
} from '../controllers/api-key.controller';

const router = Router();

// ======= 著者管理ルート =======

/**
 * GET /api/admin/authors
 * 著者一覧取得
 * admin ロールのみアクセス可能
 */
router.get('/authors', authenticate, adminOnly, getAuthors);

/**
 * POST /api/admin/authors
 * 著者アカウント新規作成
 *
 * リクエストボディのバリデーション:
 * - email: 有効なメールアドレス形式（必須）
 * - name: 1〜100 文字（必須）
 * - password: 8 文字以上（必須）
 */
router.post(
  '/authors',
  authenticate,
  adminOnly,
  [
    // メールアドレスは必須かつ有効な形式
    body('email')
      .notEmpty()
      .withMessage('メールアドレスは必須です')
      .isEmail()
      .withMessage('有効なメールアドレスを入力してください')
      .normalizeEmail(),
    // 表示名は必須かつ 1〜100 文字
    body('name')
      .notEmpty()
      .withMessage('名前は必須です')
      .isLength({ min: 1, max: 100 })
      .withMessage('名前は 1〜100 文字で入力してください')
      .trim(),
    // パスワードは必須かつ 8 文字以上
    body('password')
      .notEmpty()
      .withMessage('パスワードは必須です')
      .isLength({ min: 8 })
      .withMessage('パスワードは 8 文字以上で入力してください'),
  ],
  createAuthor
);

/**
 * GET /api/admin/authors/:id
 * 著者詳細取得（登録書籍一覧含む）
 *
 * パラメータバリデーション:
 * - id: UUID 形式
 */
router.get(
  '/authors/:id',
  authenticate,
  adminOnly,
  [param('id').isUUID().withMessage('著者 ID が不正です')],
  getAuthor
);

/**
 * PUT /api/admin/authors/:id
 * 著者情報更新
 *
 * リクエストボディのバリデーション:
 * - email: 有効なメールアドレス形式（オプション）
 * - name: 1〜100 文字（オプション）
 * - isActive: boolean（オプション）
 */
router.put(
  '/authors/:id',
  authenticate,
  adminOnly,
  [
    param('id').isUUID().withMessage('著者 ID が不正です'),
    // email はオプションだが、指定する場合は有効なメール形式
    body('email')
      .optional()
      .isEmail()
      .withMessage('有効なメールアドレスを入力してください')
      .normalizeEmail(),
    // name はオプションだが、指定する場合は空でない 1〜100 文字
    body('name')
      .optional()
      .notEmpty()
      .withMessage('名前は空にできません')
      .isLength({ max: 100 })
      .withMessage('名前は 100 文字以内で入力してください')
      .trim(),
    // isActive はオプションの boolean
    body('isActive').optional().isBoolean().withMessage('isActive は true または false で指定してください'),
  ],
  updateAuthor
);

/**
 * DELETE /api/admin/authors/:id
 * 著者アカウント無効化（論理削除）
 *
 * パラメータバリデーション:
 * - id: UUID 形式
 */
router.delete(
  '/authors/:id',
  authenticate,
  adminOnly,
  [param('id').isUUID().withMessage('著者 ID が不正です')],
  deactivateAuthor
);

// ======= API Key管理ルート =======

/**
 * GET /api/admin/api-keys
 * APIキー一覧取得
 * admin ロールのみアクセス可能
 */
router.get('/api-keys', authenticate, adminOnly, listApiKeys);

/**
 * POST /api/admin/api-keys
 * 新しいAPIキーを発行する
 *
 * リクエストボディのバリデーション:
 * - name: キー名（必須、1〜100文字）
 * - description: 説明（オプション）
 * - permissions: 許可する操作リスト（オプション）
 * - expiresAt: 有効期限（オプション、ISO 8601形式）
 *
 * セキュリティ注意: plainKey はこのレスポンスで一度だけ返される
 */
router.post(
  '/api-keys',
  authenticate,
  adminOnly,
  [
    // キー名は必須かつ 1〜100 文字
    body('name')
      .notEmpty()
      .withMessage('キー名は必須です')
      .isLength({ min: 1, max: 100 })
      .withMessage('キー名は 1〜100 文字で入力してください')
      .trim(),
    // 説明はオプション
    body('description').optional().isString().withMessage('説明は文字列で指定してください').trim(),
    // permissions はオプションの文字列配列
    body('permissions')
      .optional()
      .isArray()
      .withMessage('permissions は配列で指定してください'),
    body('permissions.*').optional().isString().withMessage('permissions の各要素は文字列で指定してください'),
    // expiresAt はオプションの日時文字列（ISO 8601形式）
    body('expiresAt')
      .optional()
      .isISO8601()
      .withMessage('expiresAt は ISO 8601 形式（例: 2025-12-31T23:59:59Z）で指定してください'),
  ],
  createApiKey
);

/**
 * GET /api/admin/api-keys/:id
 * APIキー詳細取得
 *
 * パラメータバリデーション:
 * - id: UUID 形式
 */
router.get(
  '/api-keys/:id',
  authenticate,
  adminOnly,
  [param('id').isUUID().withMessage('APIキー ID が不正です')],
  getApiKey
);

/**
 * DELETE /api/admin/api-keys/:id
 * APIキーを無効化する（論理削除）
 *
 * パラメータバリデーション:
 * - id: UUID 形式
 */
router.delete(
  '/api-keys/:id',
  authenticate,
  adminOnly,
  [param('id').isUUID().withMessage('APIキー ID が不正です')],
  deactivateApiKey
);

export default router;
