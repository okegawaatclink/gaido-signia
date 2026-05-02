/**
 * @file books.routes.ts
 * @description 書籍APIルーター
 *
 * 書籍のCRUD操作エンドポイントを定義する。
 * multerによるマルチパートファイルアップロードを処理する。
 *
 * エンドポイント:
 * - GET    /api/books        : 書籍一覧取得（author: 自分の書籍, admin: 全書籍）
 * - POST   /api/books        : 書籍登録（ファイルアップロード）
 * - GET    /api/books/:id    : 書籍詳細取得
 * - PUT    /api/books/:id    : 書籍情報更新
 * - DELETE /api/books/:id    : 書籍削除（S3ファイルも削除）
 *
 * 認証・認可:
 * - 全エンドポイントにJWT認証が必要（authenticate）
 * - author と admin のみアクセス可能（requireRole）
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  getBooks,
  createBook,
  getBook,
  getBookFans,
  updateBook,
  deleteBook,
} from '../controllers/books.controller';
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
 * - 受入条件3・4: 50MB以下のファイルが正常アップロード、超過時は413エラー
 */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * 電子書籍ファイルのMIMEタイプフィルター
 * multerレイヤーで基本的なフィルタリングを行い、
 * 詳細な検証はサービスレイヤーで行う
 *
 * @param _req - リクエストオブジェクト（未使用）
 * @param file - multerのファイルオブジェクト
 * @param cb - コールバック関数
 */
function bookFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (file.fieldname === 'bookFile') {
    // 電子書籍ファイル: PDF/EPUBのみ許可
    const allowedMimes = [
      'application/pdf',
      'application/epub+zip',
      'application/x-epub+zip',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(
        `対応していないファイル形式です。PDFまたはEPUBをアップロードしてください。(${file.mimetype})`,
        400,
        'INVALID_FILE_TYPE'
      ) as unknown as null, false);
    }
  } else if (file.fieldname === 'coverImage') {
    // 表紙画像: 画像ファイルのみ許可
    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(
        `表紙画像は JPEG, PNG, WebP, GIF 形式のみ対応しています。(${file.mimetype})`,
        400,
        'INVALID_FILE_TYPE'
      ) as unknown as null, false);
    }
  } else {
    // 未知のフィールドは拒否
    cb(null, false);
  }
}

/**
 * multerインスタンスの設定
 * - memoryStorage: ファイルをメモリ上のBufferに保存（S3直接アップロード用）
 * - limits.fileSize: 50MBでサイズ制限（MulterError LIMIT_FILE_SIZE）
 * - fileFilter: PDF/EPUB以外のファイルは拒否
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 2, // bookFile + coverImage の最大2ファイル
  },
  fileFilter: bookFileFilter,
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
      next(new AppError(`ファイルサイズが上限（50MB）を超えています`, 413, 'FILE_TOO_LARGE'));
    } else {
      next(new AppError(`ファイルアップロードエラー: ${err.message}`, 400, 'UPLOAD_ERROR'));
    }
  } else {
    next(err);
  }
}

/**
 * ファイルフィールド設定
 * fields()を使用することで複数フィールドのファイルを一度に処理できる
 */
const uploadFields = upload.fields([
  { name: 'bookFile', maxCount: 1 },    // 電子書籍ファイル（必須）
  { name: 'coverImage', maxCount: 1 },  // 表紙画像（オプション）
]);

// ======= ルート定義 =======

/**
 * GET /api/books
 * 書籍一覧取得
 * author: 自分の書籍, admin: 全書籍
 */
router.get(
  '/',
  authenticate,
  requireRole('author', 'admin'),
  getBooks
);

/**
 * POST /api/books
 * 書籍新規登録（マルチパートファイルアップロード）
 */
router.post(
  '/',
  authenticate,
  requireRole('author', 'admin'),
  uploadFields,
  multerErrorHandler,
  [
    // タイトルは必須（1〜200文字）
    body('title')
      .notEmpty().withMessage('タイトルは必須です')
      .isLength({ max: 200 }).withMessage('タイトルは200文字以内で入力してください'),
    // 説明はオプション
    body('description')
      .optional()
      .isString().withMessage('説明は文字列で入力してください'),
  ],
  createBook
);

/**
 * GET /api/books/:id
 * 書籍詳細取得
 */
router.get(
  '/:id',
  authenticate,
  requireRole('author', 'admin'),
  [
    param('id').isUUID().withMessage('書籍IDが不正です'),
  ],
  getBook
);

/**
 * PUT /api/books/:id
 * 書籍情報更新（ファイルの差し替えも可能）
 */
router.put(
  '/:id',
  authenticate,
  requireRole('author', 'admin'),
  uploadFields,
  multerErrorHandler,
  [
    param('id').isUUID().withMessage('書籍IDが不正です'),
    body('title')
      .optional()
      .notEmpty().withMessage('タイトルは空にできません')
      .isLength({ max: 200 }).withMessage('タイトルは200文字以内で入力してください'),
    body('description')
      .optional()
      .isString().withMessage('説明は文字列で入力してください'),
    // ステータス変更: draft/published/archived のみ許可
    body('status')
      .optional()
      .isIn(['draft', 'published', 'archived'])
      .withMessage('ステータスは draft, published, archived のいずれかを指定してください'),
  ],
  updateBook
);

/**
 * DELETE /api/books/:id
 * 書籍削除（S3ファイルも合わせて削除）
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('author', 'admin'),
  [
    param('id').isUUID().withMessage('書籍IDが不正です'),
  ],
  deleteBook
);

/**
 * GET /api/books/:id/fans
 * 書籍にアクセス権があるファン一覧を取得する
 * サイン合成画面でファン選択に使用する
 */
router.get(
  '/:id/fans',
  authenticate,
  requireRole('author'),
  [
    param('id').isUUID().withMessage('書籍IDが不正です'),
  ],
  getBookFans
);

export default router;
