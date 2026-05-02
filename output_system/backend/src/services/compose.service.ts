/**
 * @file compose.service.ts
 * @description サイン合成メインサービス
 *
 * 著者のサイン画像を電子書籍（PDF/EPUB）に合成するコアロジックを提供する。
 *
 * 処理フロー:
 * 1. 書籍・サイン情報をDBから取得し、認可チェックを行う
 * 2. signed_books レコードを作成（status: processing）
 * 3. S3から書籍ファイルとサイン画像をダウンロード
 * 4. ファイル形式（PDF/EPUB）に応じて合成処理を実行
 * 5. 合成済みファイルをS3にアップロード
 * 6. signed_books ステータスを completed に更新
 * 7. book_access テーブルにアクセス権を付与
 *
 * エラー処理:
 * - 合成処理が失敗した場合は signed_books のステータスを error に更新する
 * - エラーは呼び出し元に伝播させる
 */

import { v4 as uuidv4 } from 'uuid';
import { BookModel } from '../models/book.model';
import { SignModel } from '../models/sign.model';
import { SignedBookModel, SignedBook } from '../models/signed-book.model';
import { storageService } from './storage.service';
import { composePdf } from './pdf.service';
import { composeEpub } from './epub.service';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { db } from '../config/database';

/**
 * 合成リクエストのパラメータ型
 */
export interface ComposeRequest {
  /** 合成対象の書籍ID */
  bookId: string;
  /** 使用するサインID */
  signId: string;
  /** 合成対象のファンIDの配列（1名以上） */
  fanIds: string[];
  /** 宛名テキスト（個別サインの場合。各ファンへの宛名をfanIdをキーとしたマップ） */
  recipientNames?: Record<string, string>;
}

/**
 * 合成結果の型（ファン1名分）
 */
export interface ComposeResult {
  /** サイン入り書籍ID */
  signedBookId: string;
  /** 対象ファンID */
  fanId: string;
  /** 合成ステータス */
  status: 'completed' | 'error';
  /** エラーメッセージ（status: error の場合のみ） */
  errorMessage?: string;
}

/**
 * 合成処理全体の結果型
 */
export interface ComposeJobResult {
  /** 書籍ID */
  bookId: string;
  /** 使用サインID */
  signId: string;
  /** 各ファンへの合成結果 */
  results: ComposeResult[];
  /** 成功件数 */
  successCount: number;
  /** 失敗件数 */
  errorCount: number;
}

/**
 * S3に保存する合成済みファイルのキーを生成する
 * パス形式: signed-books/{uuid}/{originalFilename}
 *
 * @param bookId - 書籍ID
 * @param fanId - ファンID
 * @param format - ファイル形式（pdf または epub）
 * @returns S3ファイルキー
 */
function generateSignedFileKey(bookId: string, fanId: string, format: 'pdf' | 'epub'): string {
  const uuid = uuidv4();
  return `signed-books/${uuid}/${bookId}_${fanId}.${format}`;
}

/**
 * 合成済みファイルのS3 MIMEタイプを取得する
 *
 * @param format - ファイル形式
 * @returns MIMEタイプ文字列
 */
function getSignedFileMimeType(format: 'pdf' | 'epub'): string {
  return format === 'pdf' ? 'application/pdf' : 'application/epub+zip';
}

/**
 * book_access テーブルにファンのアクセス権を追加または更新する
 * 合成完了後に呼び出し、ファンがサイン入り書籍を閲覧できるようにする。
 *
 * 処理:
 * - 既存のアクセス権があれば signed_book_id を更新
 * - 存在しなければ新規作成（granted_by: 'manual'）
 *
 * @param bookId - 書籍ID
 * @param fanId - ファンID
 * @param signedBookId - サイン入り書籍ID
 */
async function grantBookAccess(
  bookId: string,
  fanId: string,
  signedBookId: string
): Promise<void> {
  // 既存アクセス権レコードがあれば signed_book_id を更新、なければ新規作成
  const existing = await db.query(
    `SELECT id FROM book_access WHERE book_id = $1 AND fan_id = $2 LIMIT 1`,
    [bookId, fanId]
  );

  if (existing.rows.length > 0) {
    // 既存レコードの signed_book_id を最新の合成済みファイルで更新
    await db.query(
      `UPDATE book_access SET signed_book_id = $1 WHERE book_id = $2 AND fan_id = $3`,
      [signedBookId, bookId, fanId]
    );
  } else {
    // 新規アクセス権を付与（合成完了と同時に付与するため granted_by: 'manual'）
    await db.query(
      `INSERT INTO book_access (book_id, fan_id, signed_book_id, granted_by)
       VALUES ($1, $2, $3, 'manual')`,
      [bookId, fanId, signedBookId]
    );
  }

  logger.info('Book access granted', { bookId, fanId, signedBookId });
}

/**
 * ファン1名分のサイン合成処理を実行する
 *
 * @param params - 合成に必要なパラメータ
 * @returns 合成結果
 */
async function composeSingleFan(params: {
  bookId: string;
  signId: string;
  fanId: string;
  bookFileBuffer: Buffer;
  signImageBuffer: Buffer;
  format: 'pdf' | 'epub';
  recipientName?: string;
}): Promise<ComposeResult> {
  const { bookId, signId, fanId, bookFileBuffer, signImageBuffer, format, recipientName } = params;

  // signed_books レコードを作成（status: processing）
  const signedBook: SignedBook = await SignedBookModel.create({
    bookId,
    signId,
    fanId,
    recipientName,
  });

  logger.info('Started sign composition for fan', {
    signedBookId: signedBook.id,
    bookId,
    fanId,
    format,
    recipientName,
  });

  try {
    // ファイル形式に応じて合成処理を実行
    let composedBuffer: Buffer;

    if (format === 'pdf') {
      composedBuffer = await composePdf({
        pdfBuffer: bookFileBuffer,
        signImageBuffer,
        recipientName,
      });
    } else {
      composedBuffer = await composeEpub({
        epubBuffer: bookFileBuffer,
        signImageBuffer,
        recipientName,
      });
    }

    // 合成済みファイルをS3にアップロード
    const signedFileKey = generateSignedFileKey(bookId, fanId, format);
    await storageService.upload({
      key: signedFileKey,
      body: composedBuffer,
      contentType: getSignedFileMimeType(format),
      metadata: {
        bookId,
        signId,
        fanId,
        format,
      },
    });

    logger.info('Signed file uploaded to S3', { signedFileKey, signedBookId: signedBook.id });

    // signed_books ステータスを completed に更新
    await SignedBookModel.updateStatus(signedBook.id, {
      status: 'completed',
      signedFileKey,
      composedAt: new Date(),
    });

    // book_access にアクセス権を付与
    await grantBookAccess(bookId, fanId, signedBook.id);

    return {
      signedBookId: signedBook.id,
      fanId,
      status: 'completed',
    };
  } catch (error) {
    // 合成エラー: ステータスを error に更新してエラー結果を返す
    const errorMessage = (error as Error).message;

    logger.error('Sign composition failed for fan', {
      signedBookId: signedBook.id,
      bookId,
      fanId,
      error: errorMessage,
    });

    await SignedBookModel.updateStatus(signedBook.id, {
      status: 'error',
    }).catch((updateError) => {
      // ステータス更新失敗はwarningとして記録（エラーの上書きを防ぐ）
      logger.warn('Failed to update signed_book status to error', {
        signedBookId: signedBook.id,
        error: (updateError as Error).message,
      });
    });

    return {
      signedBookId: signedBook.id,
      fanId,
      status: 'error',
      errorMessage,
    };
  }
}

/**
 * サイン合成サービスクラス
 */
export class ComposeService {
  /**
   * サイン合成ジョブを実行する
   *
   * 処理の特性:
   * - 複数ファン指定時はループで順次合成（並列化によるS3負荷増大を回避）
   * - 1件のエラーが他のファンの合成を中断しない（エラーは個別に記録）
   * - 合成処理は同期的に実行（数秒以内に完了する想定）
   *
   * @param authorId - リクエストした著者のユーザーID
   * @param request - 合成リクエストパラメータ
   * @returns 合成処理の結果
   * @throws {NotFoundError} 書籍またはサインが存在しない場合
   * @throws {ForbiddenError} 他の著者の書籍/サインを使おうとした場合
   * @throws {ValidationError} バリデーションエラー
   */
  async execute(authorId: string, request: ComposeRequest): Promise<ComposeJobResult> {
    const { bookId, signId, fanIds, recipientNames } = request;

    // 入力バリデーション
    if (!fanIds || fanIds.length === 0) {
      throw new ValidationError('対象ファンを1名以上指定してください');
    }

    // 書籍の取得と認可チェック
    const book = await BookModel.findById(bookId);
    if (!book) {
      throw new NotFoundError('書籍が見つかりません');
    }
    if (book.authorId !== authorId) {
      throw new ForbiddenError('この書籍に対する操作権限がありません');
    }
    if (!book.fileKey) {
      throw new ValidationError('書籍ファイルが存在しません。まず書籍ファイルをアップロードしてください');
    }

    // サインの取得と認可チェック
    const sign = await SignModel.findById(signId);
    if (!sign) {
      throw new NotFoundError('サインが見つかりません');
    }
    if (sign.authorId !== authorId) {
      throw new ForbiddenError('このサインに対する操作権限がありません');
    }
    if (!sign.imageKey) {
      throw new ValidationError('サイン画像が存在しません。まずサイン画像を登録してください');
    }

    logger.info('Starting compose job', {
      authorId,
      bookId,
      signId,
      format: book.format,
      fanCount: fanIds.length,
    });

    // S3から書籍ファイルとサイン画像を一度だけダウンロード（全ファン共通）
    const [bookFileBuffer, signImageBuffer] = await Promise.all([
      storageService.download(book.fileKey),
      storageService.download(sign.imageKey),
    ]);

    logger.info('Files downloaded from S3', {
      bookFileSize: bookFileBuffer.length,
      signImageSize: signImageBuffer.length,
    });

    // 各ファンに対して順次合成処理を実行
    const results: ComposeResult[] = [];

    for (const fanId of fanIds) {
      const recipientName = recipientNames?.[fanId];

      const result = await composeSingleFan({
        bookId,
        signId,
        fanId,
        bookFileBuffer,
        signImageBuffer,
        format: book.format,
        recipientName,
      });

      results.push(result);
    }

    const successCount = results.filter((r) => r.status === 'completed').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    logger.info('Compose job completed', {
      bookId,
      signId,
      successCount,
      errorCount,
    });

    return {
      bookId,
      signId,
      results,
      successCount,
      errorCount,
    };
  }

  /**
   * サイン入り書籍の詳細を取得する
   *
   * @param signedBookId - サイン入り書籍ID
   * @param authorId - リクエストした著者のユーザーID（認可チェック用）
   * @returns サイン入り書籍の詳細情報
   * @throws {NotFoundError} 存在しない場合
   * @throws {ForbiddenError} アクセス権がない場合
   */
  async getSignedBook(signedBookId: string, authorId: string): Promise<SignedBook> {
    const signedBook = await SignedBookModel.findById(signedBookId);
    if (!signedBook) {
      throw new NotFoundError('サイン入り書籍が見つかりません');
    }

    // 書籍の著者が一致するか確認
    const book = await BookModel.findById(signedBook.bookId);
    if (!book) {
      throw new AppError('書籍情報が見つかりません', 500, 'DATA_INCONSISTENCY');
    }

    if (book.authorId !== authorId) {
      throw new ForbiddenError('このサイン入り書籍にアクセスする権限がありません');
    }

    return signedBook;
  }
}

/**
 * サイン合成サービスのシングルトンインスタンス
 */
export const composeService = new ComposeService();
