/**
 * @file books.controller.ts
 * @description 書籍コントローラー
 *
 * 書籍CRUD操作のHTTPリクエスト処理を担当する。
 * リクエストバリデーション、サービス呼び出し、レスポンス整形を行う。
 *
 * エンドポイント:
 * - GET    /api/books        : 書籍一覧取得（author: 自分の書籍, admin: 全書籍）
 * - POST   /api/books        : 書籍登録（ファイルアップロード）
 * - GET    /api/books/:id    : 書籍詳細取得
 * - PUT    /api/books/:id    : 書籍情報更新
 * - DELETE /api/books/:id    : 書籍削除（S3ファイルも削除）
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { booksService } from '../services/books.service';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * GET /api/books
 * 書籍一覧を取得する
 * - author: 自分の書籍のみ
 * - admin: 全書籍
 *
 * レスポンス (200):
 * - books: 書籍の配列
 * - count: 書籍数
 *
 * @param req - Expressリクエストオブジェクト（req.user に認証済みユーザー情報）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getBooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    const books = await booksService.getBooks(userId, role);

    res.status(200).json({
      books,
      count: books.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/books
 * 書籍を新規登録する（ファイルアップロード）
 *
 * リクエスト (multipart/form-data):
 * - bookFile: 電子書籍ファイル（PDF/EPUB、必須）
 * - coverImage: 表紙画像（オプション）
 * - title: 書籍タイトル（必須）
 * - description: 書籍説明（オプション）
 * - metadata: JSONメタデータ（ISBN等、オプション）
 *
 * レスポンス (201):
 * - book: 作成した書籍オブジェクト
 *
 * @param req - Expressリクエストオブジェクト（req.files にアップロードファイル）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function createBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // バリデーションエラーチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors
          .array()
          .map((e) => e.msg)
          .join(', ')
      );
    }

    const userId = req.user!.userId;
    // multerの fields() を使用するため req.files はオブジェクト形式
    const files = req.files as Record<string, Express.Multer.File[]>;

    // 電子書籍ファイルは必須
    if (!files?.bookFile?.[0]) {
      throw new ValidationError('電子書籍ファイル（bookFile）は必須です');
    }

    const bookFile = files.bookFile[0];
    const coverImageFile = files?.coverImage?.[0];

    // metadataフィールドはJSONとしてパース
    let metadata: Record<string, unknown> | undefined;
    if (req.body.metadata) {
      try {
        metadata = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
      } catch {
        throw new ValidationError('metadataは有効なJSON形式で指定してください');
      }
    }

    const book = await booksService.createBook(userId, {
      title: req.body.title as string,
      description: req.body.description as string | undefined,
      bookFile,
      coverImageFile,
      metadata,
    });

    logger.info('Book created via API', { bookId: book.id, authorId: userId });

    res.status(201).json({ book });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/books/:id
 * 書籍詳細を取得する
 * - author: 自分の書籍のみ
 * - admin: 全書籍
 *
 * パスパラメータ:
 * - id: 書籍ID（UUID）
 *
 * レスポンス (200):
 * - book: 書籍オブジェクト
 *
 * @param req - Expressリクエストオブジェクト（req.params.id に書籍ID）
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function getBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const book = await booksService.getBook(id, userId, role);

    res.status(200).json({ book });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/books/:id
 * 書籍情報を更新する
 * authorは自分の書籍のみ更新可能
 *
 * パスパラメータ:
 * - id: 書籍ID（UUID）
 *
 * リクエスト (multipart/form-data):
 * - bookFile: 新しい電子書籍ファイル（オプション）
 * - coverImage: 新しい表紙画像（オプション）
 * - title: 書籍タイトル（オプション）
 * - description: 書籍説明（オプション）
 * - metadata: JSONメタデータ（オプション）
 *
 * レスポンス (200):
 * - book: 更新後の書籍オブジェクト
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function updateBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // バリデーションエラーチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors
          .array()
          .map((e) => e.msg)
          .join(', ')
      );
    }

    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const files = req.files as Record<string, Express.Multer.File[]>;

    const bookFile = files?.bookFile?.[0];
    const coverImageFile = files?.coverImage?.[0];

    // metadataフィールドはJSONとしてパース
    let metadata: Record<string, unknown> | undefined;
    if (req.body.metadata) {
      try {
        metadata = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
      } catch {
        throw new ValidationError('metadataは有効なJSON形式で指定してください');
      }
    }

    const book = await booksService.updateBook(id, userId, role, {
      title: req.body.title as string | undefined,
      description: req.body.description as string | undefined,
      // ステータス変更: draft/published/archived
      status: req.body.status as 'draft' | 'published' | 'archived' | undefined,
      bookFile,
      coverImageFile,
      metadata,
    });

    logger.info('Book updated via API', { bookId: id, authorId: userId });

    res.status(200).json({ book });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/books/:id
 * 書籍を削除する（S3ファイルも削除）
 * authorは自分の書籍のみ削除可能
 *
 * パスパラメータ:
 * - id: 書籍ID（UUID）
 *
 * レスポンス (204): No Content
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェア関数
 */
export async function deleteBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    await booksService.deleteBook(id, userId, role);

    logger.info('Book deleted via API', { bookId: id, userId });

    // 204 No Content（削除成功時はボディなし）
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
