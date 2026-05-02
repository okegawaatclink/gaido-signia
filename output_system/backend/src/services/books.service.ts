/**
 * @file books.service.ts
 * @description 書籍ビジネスロジックサービス
 *
 * 書籍のCRUD操作に関するビジネスロジックを提供する。
 * - ファイルのS3アップロード（AES-256暗号化）
 * - 書籍メタデータのDB管理
 * - 認可チェック（著者は自分の書籍のみ操作可）
 *
 * アップロード仕様:
 * - 対応形式: PDF (application/pdf) / EPUB (application/epub+zip)
 * - 最大ファイルサイズ: 50MB
 * - S3キー形式: {uuid}/{originalFilename}（衝突回避）
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { BookModel, Book, CreateBookParams, UpdateBookParams } from '../models/book.model';
import { storageService } from './storage.service';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * 書籍登録リクエストパラメータ
 */
export interface CreateBookInput {
  /** 書籍タイトル（必須） */
  title: string;
  /** 書籍説明（オプション） */
  description?: string;
  /** アップロードされた電子書籍ファイル（multer Buffer） */
  bookFile: Express.Multer.File;
  /** アップロードされた表紙画像ファイル（multer Buffer、オプション） */
  coverImageFile?: Express.Multer.File;
  /** メタデータ（ISBN等、オプション） */
  metadata?: Record<string, unknown>;
}

/**
 * 書籍更新リクエストパラメータ
 */
export interface UpdateBookInput {
  /** 書籍タイトル */
  title?: string;
  /** 書籍説明 */
  description?: string;
  /** 新しい電子書籍ファイル（multer Buffer、オプション） */
  bookFile?: Express.Multer.File;
  /** 新しい表紙画像ファイル（multer Buffer、オプション） */
  coverImageFile?: Express.Multer.File;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/** 対応するMIMEタイプと対応する書籍形式のマッピング */
const ALLOWED_BOOK_MIME_TYPES: Record<string, 'pdf' | 'epub'> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  // EPUBはブラウザによってMIMEタイプが異なる場合がある
  'application/x-epub+zip': 'epub',
};

/** 対応するファイル拡張子 */
const ALLOWED_BOOK_EXTENSIONS = ['.pdf', '.epub'];

/**
 * ファイル形式を検証してフォーマット文字列を返す
 * MIMEタイプと拡張子の両方で検証する（一方のみの偽装を防ぐ）
 *
 * @param file - multerのファイルオブジェクト
 * @returns 検証済みのフォーマット ('pdf' | 'epub')
 * @throws {ValidationError} 対応していないファイル形式の場合
 */
function validateBookFileFormat(file: Express.Multer.File): 'pdf' | 'epub' {
  // MIMEタイプで検証
  const formatByMime = ALLOWED_BOOK_MIME_TYPES[file.mimetype];
  if (!formatByMime) {
    throw new ValidationError(
      `対応していないファイル形式です。PDFまたはEPUBファイルをアップロードしてください。(MIMEタイプ: ${file.mimetype})`
    );
  }

  // ファイル拡張子でも検証（MIMEタイプ偽装への二重チェック）
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_BOOK_EXTENSIONS.includes(ext)) {
    throw new ValidationError(
      `対応していないファイル拡張子です。.pdf または .epub ファイルをアップロードしてください。(拡張子: ${ext})`
    );
  }

  return formatByMime;
}

/**
 * S3キーを生成する
 * UUID/originalFilename 形式でファイル名の衝突を回避する
 *
 * @param originalname - 元のファイル名
 * @returns S3ファイルキー
 */
function generateFileKey(originalname: string): string {
  const uuid = uuidv4();
  // ファイル名の特殊文字をサニタイズ（スペースやUnicode文字を除去）
  const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${uuid}/${safeName}`;
}

/**
 * S3サーバーサイド暗号化の設定を取得する
 * - AWS S3本番環境: AES256（SSE-S3）
 * - MinIO開発環境: KMS設定不要なためSSE無効（環境変数 S3_ENABLE_SSE=false で制御）
 *
 * MinIOでSSE-S3を使用するにはKMS設定が必要。
 * 開発環境では S3_ENABLE_SSE=false（デフォルト無効）でスキップする。
 *
 * @returns サーバーサイド暗号化設定値、または無効の場合はundefined
 */
function getServerSideEncryption(): 'AES256' | undefined {
  // S3_ENABLE_SSE=true の場合のみAES256暗号化を有効にする
  // MinIOのデフォルト設定ではKMSが未設定のためSSEはサポートされない
  return process.env.S3_ENABLE_SSE === 'true' ? 'AES256' : undefined;
}

/**
 * 書籍ビジネスロジックサービスクラス
 */
export class BooksService {
  /**
   * 著者の書籍一覧を取得する
   * adminの場合は全書籍を返す
   *
   * @param userId - リクエストユーザーID
   * @param role - ユーザーロール
   * @returns 書籍の配列
   */
  async getBooks(userId: string, role: string): Promise<Book[]> {
    if (role === 'admin') {
      return BookModel.findAll();
    }
    // authorは自分の書籍のみ
    return BookModel.findByAuthorId(userId);
  }

  /**
   * 書籍詳細を取得する
   * 著者は自分の書籍のみ、adminは全書籍にアクセス可能
   *
   * @param bookId - 書籍ID
   * @param userId - リクエストユーザーID
   * @param role - ユーザーロール
   * @returns 書籍オブジェクト
   * @throws {NotFoundError} 書籍が存在しない場合
   * @throws {ForbiddenError} 他の著者の書籍にアクセスしようとした場合
   */
  async getBook(bookId: string, userId: string, role: string): Promise<Book> {
    const book = await BookModel.findById(bookId);
    if (!book) {
      throw new NotFoundError('書籍が見つかりません');
    }

    // adminは全書籍にアクセス可能、authorは自分の書籍のみ
    if (role !== 'admin' && book.authorId !== userId) {
      throw new ForbiddenError('この書籍にアクセスする権限がありません');
    }

    return book;
  }

  /**
   * 書籍を新規登録する
   * ファイルをS3にAES-256暗号化してアップロードし、メタデータをDBに保存する
   *
   * @param userId - 著者のユーザーID
   * @param input - 書籍登録パラメータ
   * @returns 作成した書籍オブジェクト
   * @throws {ValidationError} ファイル形式や入力値が不正な場合
   */
  async createBook(userId: string, input: CreateBookInput): Promise<Book> {
    // ファイル形式を検証
    const format = validateBookFileFormat(input.bookFile);

    // S3キーを生成してファイルをアップロード
    const fileKey = generateFileKey(input.bookFile.originalname);
    await storageService.upload({
      key: fileKey,
      body: input.bookFile.buffer,
      contentType: input.bookFile.mimetype,
      // AES-256でサーバーサイド暗号化（受入条件5: ファイルがS3に暗号化して保存される）
      // MinIO開発環境ではKMS未設定のためS3_ENABLE_SSE=trueの場合のみ有効化
      serverSideEncryption: getServerSideEncryption(),
      metadata: {
        originalName: input.bookFile.originalname,
        authorId: userId,
      },
    });

    logger.info('Book file uploaded to S3', { fileKey, authorId: userId });

    // 表紙画像が指定されている場合はアップロード
    let coverImageKey: string | undefined;
    if (input.coverImageFile) {
      coverImageKey = generateFileKey(input.coverImageFile.originalname);
      await storageService.upload({
        key: coverImageKey,
        body: input.coverImageFile.buffer,
        contentType: input.coverImageFile.mimetype,
        serverSideEncryption: getServerSideEncryption(),
        metadata: {
          originalName: input.coverImageFile.originalname,
          authorId: userId,
          type: 'cover_image',
        },
      });
      logger.info('Cover image uploaded to S3', { coverImageKey, authorId: userId });
    }

    // DBに書籍情報を保存
    const createParams: CreateBookParams = {
      authorId: userId,
      title: input.title,
      description: input.description,
      format,
      fileKey,
      coverImageKey,
      fileSize: input.bookFile.size,
      metadata: input.metadata,
    };

    const book = await BookModel.create(createParams);
    logger.info('Book created', { bookId: book.id, authorId: userId, format });

    return book;
  }

  /**
   * 書籍情報を更新する
   * 著者は自分の書籍のみ更新可能
   *
   * @param bookId - 書籍ID
   * @param userId - リクエストユーザーID
   * @param role - ユーザーロール
   * @param input - 更新パラメータ
   * @returns 更新後の書籍オブジェクト
   * @throws {NotFoundError} 書籍が存在しない場合
   * @throws {ForbiddenError} 他の著者の書籍を更新しようとした場合
   */
  async updateBook(
    bookId: string,
    userId: string,
    role: string,
    input: UpdateBookInput
  ): Promise<Book> {
    // 書籍の存在と所有権を確認
    const existingBook = await BookModel.findById(bookId);
    if (!existingBook) {
      throw new NotFoundError('書籍が見つかりません');
    }

    // authorは自分の書籍のみ更新可能
    if (role !== 'admin' && existingBook.authorId !== userId) {
      throw new ForbiddenError('この書籍を更新する権限がありません');
    }

    const updateParams: UpdateBookParams = {};

    if (input.title !== undefined) updateParams.title = input.title;
    if (input.description !== undefined) updateParams.description = input.description;
    if (input.metadata !== undefined) updateParams.metadata = input.metadata;

    // 新しいファイルが指定されている場合はS3にアップロード
    if (input.bookFile) {
      const format = validateBookFileFormat(input.bookFile);
      const newFileKey = generateFileKey(input.bookFile.originalname);

      await storageService.upload({
        key: newFileKey,
        body: input.bookFile.buffer,
        contentType: input.bookFile.mimetype,
        serverSideEncryption: getServerSideEncryption(),
        metadata: {
          originalName: input.bookFile.originalname,
          authorId: userId,
        },
      });

      // 古いファイルをS3から削除（ストレージの無駄遣いを防ぐ）
      if (existingBook.fileKey) {
        await storageService.delete(existingBook.fileKey).catch((err) => {
          // 古いファイルの削除失敗は致命的ではないのでwarnとして記録
          logger.warn('Failed to delete old book file', {
            fileKey: existingBook.fileKey,
            error: (err as Error).message,
          });
        });
      }

      updateParams.fileKey = newFileKey;
      updateParams.fileSize = input.bookFile.size;
      logger.info('Book file updated in S3', { newFileKey, bookId, format });
    }

    // 新しい表紙画像が指定されている場合はS3にアップロード
    if (input.coverImageFile) {
      const newCoverKey = generateFileKey(input.coverImageFile.originalname);

      await storageService.upload({
        key: newCoverKey,
        body: input.coverImageFile.buffer,
        contentType: input.coverImageFile.mimetype,
        serverSideEncryption: getServerSideEncryption(),
        metadata: {
          originalName: input.coverImageFile.originalname,
          authorId: userId,
          type: 'cover_image',
        },
      });

      // 古い表紙画像を削除
      if (existingBook.coverImageKey) {
        await storageService.delete(existingBook.coverImageKey).catch((err) => {
          logger.warn('Failed to delete old cover image', {
            coverImageKey: existingBook.coverImageKey,
            error: (err as Error).message,
          });
        });
      }

      updateParams.coverImageKey = newCoverKey;
      logger.info('Cover image updated in S3', { newCoverKey, bookId });
    }

    const updatedBook = await BookModel.update(bookId, updateParams);
    if (!updatedBook) {
      throw new AppError('書籍の更新に失敗しました', 500);
    }

    logger.info('Book updated', { bookId, authorId: userId });
    return updatedBook;
  }

  /**
   * 書籍を削除する
   * S3のファイルも合わせて削除する
   * authorは自分の書籍のみ削除可能
   *
   * @param bookId - 書籍ID
   * @param userId - リクエストユーザーID
   * @param role - ユーザーロール
   * @throws {NotFoundError} 書籍が存在しない場合
   * @throws {ForbiddenError} 他の著者の書籍を削除しようとした場合
   */
  async deleteBook(bookId: string, userId: string, role: string): Promise<void> {
    // 書籍の存在と所有権を確認
    const book = await BookModel.findById(bookId);
    if (!book) {
      throw new NotFoundError('書籍が見つかりません');
    }

    // authorは自分の書籍のみ削除可能
    if (role !== 'admin' && book.authorId !== userId) {
      throw new ForbiddenError('この書籍を削除する権限がありません');
    }

    // S3からファイルを削除（受入条件: DELETE /api/books/:id で書籍とS3ファイルが削除される）
    if (book.fileKey) {
      await storageService.delete(book.fileKey).catch((err) => {
        logger.warn('Failed to delete book file from S3', {
          fileKey: book.fileKey,
          error: (err as Error).message,
        });
      });
    }

    // 表紙画像も削除
    if (book.coverImageKey) {
      await storageService.delete(book.coverImageKey).catch((err) => {
        logger.warn('Failed to delete cover image from S3', {
          coverImageKey: book.coverImageKey,
          error: (err as Error).message,
        });
      });
    }

    // DBから書籍を削除
    await BookModel.delete(bookId);
    logger.info('Book deleted', { bookId, authorId: userId });
  }
}

/**
 * 書籍サービスのシングルトンインスタンス
 */
export const booksService = new BooksService();
