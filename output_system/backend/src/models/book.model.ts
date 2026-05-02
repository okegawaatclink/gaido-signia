/**
 * @file book.model.ts
 * @description 書籍モデル
 *
 * booksテーブルのデータアクセスロジックを提供する。
 * DBクエリのラッパーとして機能し、型安全なデータ取得・変更を行う。
 *
 * ステータス定義:
 * - draft: 下書き（登録直後のデフォルト状態）
 * - published: 公開中
 * - archived: アーカイブ済み
 */

import { db } from '../config/database';

/**
 * 書籍エンティティ型
 * booksテーブルの行データに対応する
 */
export interface Book {
  /** 書籍ID（UUID） */
  id: string;
  /** 著者ID（usersテーブル参照） */
  authorId: string;
  /** 書籍タイトル */
  title: string;
  /** 書籍説明 */
  description: string | null;
  /** ファイル形式: pdf または epub */
  format: 'pdf' | 'epub';
  /** S3ファイルキー（暗号化済み） */
  fileKey: string | null;
  /** 表紙画像S3キー */
  coverImageKey: string | null;
  /** ファイルサイズ（bytes） */
  fileSize: number | null;
  /** ページ数 */
  pageCount: number | null;
  /** ステータス */
  status: 'draft' | 'published' | 'archived';
  /** メタデータ（ISBN等） */
  metadata: Record<string, unknown>;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * 書籍作成パラメータ型
 */
export interface CreateBookParams {
  authorId: string;
  title: string;
  description?: string;
  format: 'pdf' | 'epub';
  fileKey?: string;
  coverImageKey?: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 書籍更新パラメータ型
 * すべてのフィールドがオプション
 */
export interface UpdateBookParams {
  title?: string;
  description?: string;
  fileKey?: string;
  coverImageKey?: string;
  fileSize?: number;
  status?: 'draft' | 'published' | 'archived';
  metadata?: Record<string, unknown>;
}

/**
 * DBのスネークケースカラムをキャメルケースにマッピングする
 * PostgreSQLはカラム名を小文字で返すため変換が必要
 *
 * @param row - DBの行データ（スネークケース）
 * @returns キャメルケースに変換した書籍オブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBook(row: any): Book {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    format: row.format,
    fileKey: row.file_key,
    coverImageKey: row.cover_image_key,
    fileSize: row.file_size ? parseInt(row.file_size, 10) : null,
    pageCount: row.page_count,
    status: row.status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 書籍モデル
 * booksテーブルへのCRUD操作を提供する
 */
export const BookModel = {
  /**
   * 著者IDで書籍一覧を取得する
   * admin用に authorId を指定しない場合は全書籍を返す
   *
   * @param authorId - 著者ID（指定しない場合は全書籍）
   * @returns 書籍の配列（作成日時降順）
   */
  async findByAuthorId(authorId: string): Promise<Book[]> {
    const result = await db.query(
      `SELECT * FROM books
       WHERE author_id = $1
       ORDER BY created_at DESC`,
      [authorId]
    );
    return result.rows.map(rowToBook);
  },

  /**
   * 全書籍を取得する（admin用）
   *
   * @returns 全書籍の配列（作成日時降順）
   */
  async findAll(): Promise<Book[]> {
    const result = await db.query(
      `SELECT * FROM books ORDER BY created_at DESC`
    );
    return result.rows.map(rowToBook);
  },

  /**
   * IDで書籍を取得する
   *
   * @param id - 書籍ID
   * @returns 書籍オブジェクト、存在しない場合はnull
   */
  async findById(id: string): Promise<Book | null> {
    const result = await db.query(
      `SELECT * FROM books WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return rowToBook(result.rows[0]);
  },

  /**
   * 新しい書籍を作成する
   *
   * @param params - 書籍作成パラメータ
   * @returns 作成した書籍オブジェクト
   */
  async create(params: CreateBookParams): Promise<Book> {
    const result = await db.query(
      `INSERT INTO books (author_id, title, description, format, file_key, cover_image_key, file_size, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.authorId,
        params.title,
        params.description || null,
        params.format,
        params.fileKey || null,
        params.coverImageKey || null,
        params.fileSize || null,
        JSON.stringify(params.metadata || {}),
      ]
    );
    return rowToBook(result.rows[0]);
  },

  /**
   * 書籍情報を更新する
   * 指定されたフィールドのみを更新する（部分更新）
   *
   * @param id - 書籍ID
   * @param params - 更新パラメータ
   * @returns 更新後の書籍オブジェクト、存在しない場合はnull
   */
  async update(id: string, params: UpdateBookParams): Promise<Book | null> {
    // 動的にSETクローズを構築する（指定フィールドのみ更新）
    const setClauses: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    let paramIndex = 1;

    if (params.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(params.title);
    }
    if (params.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.fileKey !== undefined) {
      setClauses.push(`file_key = $${paramIndex++}`);
      values.push(params.fileKey);
    }
    if (params.coverImageKey !== undefined) {
      setClauses.push(`cover_image_key = $${paramIndex++}`);
      values.push(params.coverImageKey);
    }
    if (params.fileSize !== undefined) {
      setClauses.push(`file_size = $${paramIndex++}`);
      values.push(params.fileSize);
    }
    if (params.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    // updated_at は常に更新する
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    if (setClauses.length === 1) {
      // updated_atのみの場合は更新不要
      return this.findById(id);
    }

    values.push(id);
    const result = await db.query(
      `UPDATE books SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;
    return rowToBook(result.rows[0]);
  },

  /**
   * 書籍を削除する
   *
   * @param id - 書籍ID
   * @returns 削除が成功した場合はtrue
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM books WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
