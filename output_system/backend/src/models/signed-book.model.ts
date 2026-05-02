/**
 * @file signed-book.model.ts
 * @description サイン入り書籍モデル
 *
 * signed_booksテーブルのデータアクセスロジックを提供する。
 * サイン合成処理の進捗管理と結果保存を行う。
 *
 * ステータス定義:
 * - processing: 合成処理中（初期値）
 * - completed: 合成完了（signed_file_keyが設定される）
 * - error: 合成エラー
 */

import { db } from '../config/database';

/**
 * サイン入り書籍エンティティ型
 * signed_booksテーブルの行データに対応する
 */
export interface SignedBook {
  /** サイン入り書籍ID（UUID） */
  id: string;
  /** 元書籍ID（booksテーブル参照） */
  bookId: string;
  /** 使用サインID（signsテーブル参照） */
  signId: string;
  /** 対象ファンID（usersテーブル参照） */
  fanId: string;
  /** 宛名（個別サインの場合のみ） */
  recipientName: string | null;
  /** 合成済みファイルS3キー（合成完了後に設定） */
  signedFileKey: string | null;
  /** 合成処理のステータス */
  status: 'processing' | 'completed' | 'error';
  /** 合成完了日時 */
  composedAt: Date | null;
  /** 作成日時 */
  createdAt: Date;
}

/**
 * サイン入り書籍作成パラメータ型
 */
export interface CreateSignedBookParams {
  /** 元書籍ID */
  bookId: string;
  /** 使用サインID */
  signId: string;
  /** 対象ファンID */
  fanId: string;
  /** 宛名（個別サインの場合） */
  recipientName?: string;
}

/**
 * サイン入り書籍ステータス更新パラメータ型
 */
export interface UpdateSignedBookStatusParams {
  /** 新しいステータス */
  status: 'completed' | 'error';
  /** 合成済みファイルS3キー（completed時に設定） */
  signedFileKey?: string;
  /** 合成完了日時（completed時に設定） */
  composedAt?: Date;
}

/**
 * DBのスネークケースカラムをキャメルケースにマッピングする
 *
 * @param row - DBの行データ（スネークケース）
 * @returns キャメルケースに変換したサイン入り書籍オブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSignedBook(row: any): SignedBook {
  return {
    id: row.id,
    bookId: row.book_id,
    signId: row.sign_id,
    fanId: row.fan_id,
    recipientName: row.recipient_name,
    signedFileKey: row.signed_file_key,
    status: row.status,
    composedAt: row.composed_at,
    createdAt: row.created_at,
  };
}

/**
 * サイン入り書籍モデル
 * signed_booksテーブルへのCRUD操作を提供する
 */
export const SignedBookModel = {
  /**
   * IDでサイン入り書籍を取得する
   *
   * @param id - サイン入り書籍ID
   * @returns サイン入り書籍オブジェクト、存在しない場合はnull
   */
  async findById(id: string): Promise<SignedBook | null> {
    const result = await db.query(
      `SELECT * FROM signed_books WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return rowToSignedBook(result.rows[0]);
  },

  /**
   * 書籍IDとファンIDでサイン入り書籍を取得する
   *
   * @param bookId - 書籍ID
   * @param fanId - ファンID
   * @returns サイン入り書籍の配列
   */
  async findByBookAndFan(bookId: string, fanId: string): Promise<SignedBook[]> {
    const result = await db.query(
      `SELECT * FROM signed_books
       WHERE book_id = $1 AND fan_id = $2
       ORDER BY created_at DESC`,
      [bookId, fanId]
    );
    return result.rows.map(rowToSignedBook);
  },

  /**
   * 新しいサイン入り書籍レコードを作成する
   * 初期ステータスはprocessingで作成される
   *
   * @param params - 作成パラメータ
   * @returns 作成したサイン入り書籍オブジェクト
   */
  async create(params: CreateSignedBookParams): Promise<SignedBook> {
    const result = await db.query(
      `INSERT INTO signed_books (book_id, sign_id, fan_id, recipient_name, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING *`,
      [
        params.bookId,
        params.signId,
        params.fanId,
        params.recipientName || null,
      ]
    );
    return rowToSignedBook(result.rows[0]);
  },

  /**
   * サイン入り書籍のステータスを更新する
   * 合成完了時はsigned_file_keyとcomposed_atも更新する
   *
   * @param id - サイン入り書籍ID
   * @param params - ステータス更新パラメータ
   * @returns 更新後のサイン入り書籍オブジェクト、存在しない場合はnull
   */
  async updateStatus(
    id: string,
    params: UpdateSignedBookStatusParams
  ): Promise<SignedBook | null> {
    const result = await db.query(
      `UPDATE signed_books
       SET status = $1,
           signed_file_key = COALESCE($2, signed_file_key),
           composed_at = $3
       WHERE id = $4
       RETURNING *`,
      [
        params.status,
        params.signedFileKey || null,
        params.composedAt || null,
        id,
      ]
    );
    if (result.rows.length === 0) return null;
    return rowToSignedBook(result.rows[0]);
  },
};
