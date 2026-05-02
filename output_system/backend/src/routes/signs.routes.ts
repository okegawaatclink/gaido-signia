/**
 * @file signs.routes.ts
 * @description サインAPIルーター
 *
 * サインのCRUD操作エンドポイントを定義する。
 * multerによるPNG画像ファイルアップロードを処理する。
 *
 * エンドポイント:
 * - GET    /api/signs        : サイン一覧取得（著者自身のサインのみ）
 * - POST   /api/signs        : サイン作成（PNG画像+Canvas JSON）
 * - GET    /api/signs/:id    : サイン詳細取得
 * - PUT    /api/signs/:id    : サイン更新
 * - DELETE /api/signs/:id    : サイン削除（S3画像も削除）
 *
 * 認証・認可:
 * - 全エンドポイントにJWT認証が必要（authenticate）
 * - author ロールのみアクセス可能（requireRole）
 *   ※ サイン管理は著者専用機能。adminはサインを管理しない
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  getSigns,
  createSign,
  getSign,
  updateSign,
  deleteSign,
} from '../controllers/signs.controller';
import { AppError } from '../utils/errors';

const router = Router();

/**
 * multerの設定
 *
 * メモリストレージを使用する理由:
 * - ファイルをディスクに書き込まず、S3に直接アップロードするため
 * - 一時ファイルの管理が不要でシンプル
 *
 * ファイルサイズ制限:
 * - サイン画像のPNGファイルは通常数百KB以内
 * - 余裕を持たせて10MBを上限とする
 */
const MAX_SIGN_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * サイン画像ファイルのMIMEタイプフィルター
 * PNG形式のみ許可する
 *
 * PNG形式を採用する理由:
 * - 透明背景（アルファチャンネル）をサポートし、書籍合成時に背景を透過できる
 * - 無劣化圧縮でサインの細かい線も保持できる
 *
 * @param _req - リクエストオブジェクト（未使用）
 * @param file - multerのファイルオブジェクト
 * @param cb - コールバック関数
 */
function signImageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new AppError(
      `サイン画像はPNG形式のみ対応しています。(${file.mimetype})`,
      400,
      'INVALID_FILE_TYPE'
    ) as unknown as null, false);
  }
}

/**
 * multerインスタンスの設定
 * - memoryStorage: ファイルをメモリ上のBufferに保存（S3直接アップロード用）
 * - limits.fileSize: 10MBでサイズ制限
 * - fileFilter: PNG以外のファイルは拒否
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIGN_IMAGE_SIZE_BYTES,
    files: 1, // signImage の最大1ファイル
  },
  fileFilter: signImageFileFilter,
});

/**
 * multerエラーをHTTPレスポンスに変換するエラーハンドラー
 * multerのエラーはExpressの通常エラーハンドラーでは処理されないため、
 * ルートレベルで個別にハンドリングする
 *
 * @param err - エラーオブジェクト
 * @param _req - リクエストオブジェクト（未使用）
 * @param _res - レスポンスオブジェクト（未使用）
 * @param next - 次のミドルウェア
 */
function multerErrorHandler(
  err: Error,
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // ファイルサイズ超過: 413 Payload Too Large
      next(new AppError(`サイン画像ファイルサイズが上限（10MB）を超えています`, 413, 'FILE_TOO_LARGE'));
    } else {
      next(new AppError(`ファイルアップロードエラー: ${err.message}`, 400, 'UPLOAD_ERROR'));
    }
  } else {
    next(err);
  }
}

/**
 * サイン画像ファイルアップロード設定
 * single()を使用して1ファイルのみ処理する
 */
const uploadSignImage = upload.single('signImage');

// ======= ルート定義 =======

/**
 * GET /api/signs
 * サイン一覧取得（著者自身のサインのみ）
 */
router.get(
  '/',
  authenticate,
  requireRole('author'),
  getSigns
);

/**
 * POST /api/signs
 * サイン新規作成（PNG画像アップロード + Canvas JSON保存）
 */
router.post(
  '/',
  authenticate,
  requireRole('author'),
  uploadSignImage,
  multerErrorHandler,
  [
    // サイン名は必須（1〜100文字）
    body('name')
      .notEmpty().withMessage('サイン名は必須です')
      .isLength({ max: 100 }).withMessage('サイン名は100文字以内で入力してください'),
    // 種別は必須（common または individual のみ）
    body('type')
      .notEmpty().withMessage('種別は必須です')
      .isIn(['common', 'individual']).withMessage('種別は common または individual を指定してください'),
    // canvasDataは必須（JSON文字列）
    body('canvasData')
      .notEmpty().withMessage('canvasDataは必須です'),
    // isDefaultはオプション（boolean文字列）
    body('isDefault')
      .optional()
      .isIn(['true', 'false', true, false]).withMessage('isDefaultはtrue/falseで指定してください'),
  ],
  createSign
);

/**
 * GET /api/signs/:id
 * サイン詳細取得
 */
router.get(
  '/:id',
  authenticate,
  requireRole('author'),
  [
    param('id').isUUID().withMessage('サインIDが不正です'),
  ],
  getSign
);

/**
 * PUT /api/signs/:id
 * サイン情報更新（画像の差し替えも可能）
 */
router.put(
  '/:id',
  authenticate,
  requireRole('author'),
  uploadSignImage,
  multerErrorHandler,
  [
    param('id').isUUID().withMessage('サインIDが不正です'),
    body('name')
      .optional()
      .notEmpty().withMessage('サイン名は空にできません')
      .isLength({ max: 100 }).withMessage('サイン名は100文字以内で入力してください'),
    body('type')
      .optional()
      .isIn(['common', 'individual']).withMessage('種別は common または individual を指定してください'),
    body('isDefault')
      .optional()
      .isIn(['true', 'false', true, false]).withMessage('isDefaultはtrue/falseで指定してください'),
  ],
  updateSign
);

/**
 * DELETE /api/signs/:id
 * サイン削除（S3画像も合わせて削除）
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('author'),
  [
    param('id').isUUID().withMessage('サインIDが不正です'),
  ],
  deleteSign
);

export default router;
