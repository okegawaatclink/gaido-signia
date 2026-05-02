/**
 * @file sign.model.ts
 * @description サインモデル
 *
 * signsテーブルのデータアクセスロジックを提供する。
 * DBクエリのラッパーとして機能し、型安全なデータ取得・変更を行う。
 *
 * サイン種別:
 * - common: 共通サイン（全ファンに同じサインを使用する）
 * - individual: 個別サイン（宛名付きサイン合成に使用する）
 *
 * デフォルトサイン:
 * - is_default フラグは著者ごとに1つのみ true になる
 * - 更新時はトランザクション内で排他制御を行う
 */

import { db } from '../config/database';

/**
 * サインエンティティ型
 * signsテーブルの行データに対応する
 */
export interface Sign {
  /** サインID（UUID） */
  id: string;
  /** 著者ID（usersテーブル参照） */
  authorId: string;
  /** サイン名（管理用ラベル） */
  name: string;
  /** サイン種別: common（共通）または individual（個別） */
  type: 'common' | 'individual';
  /** サイン画像S3キー（PNG形式） */
  imageKey: string | null;
  /** Canvas描画データ（JSON形式。Fabric.jsのtoJSON()出力） */
  canvasData: Record<string, unknown> | null;
  /** デフォルトサインフラグ（著者ごとに1つのみtrue） */
  isDefault: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * サイン作成パラメータ型
 */
export interface CreateSignParams {
  /** 著者ID */
  authorId: string;
  /** サイン名 */
  name: string;
  /** サイン種別 */
  type: 'common' | 'individual';
  /** サイン画像S3キー（PNG） */
  imageKey?: string;
  /** Canvas描画データ（JSON） */
  canvasData?: Record<string, unknown>;
  /** デフォルトサインとして設定するか */
  isDefault?: boolean;
}

/**
 * サイン更新パラメータ型
 * すべてのフィールドがオプション
 */
export interface UpdateSignParams {
  /** サイン名 */
  name?: string;
  /** サイン種別 */
  type?: 'common' | 'individual';
  /** 新しいサイン画像S3キー */
  imageKey?: string;
  /** 新しいCanvas描画データ */
  canvasData?: Record<string, unknown>;
  /** デフォルトサインフラグ */
  isDefault?: boolean;
}

/**
 * DBのスネークケースカラムをキャメルケースにマッピングする
 * PostgreSQLはカラム名を小文字で返すため変換が必要
 *
 * @param row - DBの行データ（スネークケース）
 * @returns キャメルケースに変換したサインオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSign(row: any): Sign {
  return {
    id: row.id,
    authorId: row.author_id,
    name: row.name,
    type: row.type,
    imageKey: row.image_key,
    canvasData: row.canvas_data,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * サインモデル
 * signsテーブルへのCRUD操作を提供する
 */
export const SignModel = {
  /**
   * 著者IDでサイン一覧を取得する
   *
   * @param authorId - 著者ID
   * @returns サインの配列（作成日時降順）
   */
  async findByAuthorId(authorId: string): Promise<Sign[]> {
    const result = await db.query(
      `SELECT * FROM signs
       WHERE author_id = $1
       ORDER BY created_at DESC`,
      [authorId]
    );
    return result.rows.map(rowToSign);
  },

  /**
   * IDでサインを取得する
   *
   * @param id - サインID
   * @returns サインオブジェクト、存在しない場合はnull
   */
  async findById(id: string): Promise<Sign | null> {
    const result = await db.query(
      `SELECT * FROM signs WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return rowToSign(result.rows[0]);
  },

  /**
   * 新しいサインを作成する
   *
   * デフォルトサインとして作成する場合は、同一著者の他のデフォルトサインを
   * トランザクション内で解除してから新規作成する（排他制御）。
   *
   * @param params - サイン作成パラメータ
   * @returns 作成したサインオブジェクト
   */
  async create(params: CreateSignParams): Promise<Sign> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // デフォルトサインとして設定する場合は、他のデフォルトサインを解除
      if (params.isDefault) {
        await client.query(
          `UPDATE signs SET is_default = false, updated_at = CURRENT_TIMESTAMP
           WHERE author_id = $1 AND is_default = true`,
          [params.authorId]
        );
      }

      const result = await client.query(
        `INSERT INTO signs (author_id, name, type, image_key, canvas_data, is_default)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          params.authorId,
          params.name,
          params.type,
          params.imageKey || null,
          params.canvasData ? JSON.stringify(params.canvasData) : null,
          params.isDefault || false,
        ]
      );

      await client.query('COMMIT');
      return rowToSign(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * サイン情報を更新する
   * 指定されたフィールドのみを更新する（部分更新）
   *
   * デフォルトサインに変更する場合は、同一著者の他のデフォルトサインを
   * トランザクション内で解除してから更新する（排他制御）。
   *
   * @param id - サインID
   * @param authorId - 著者ID（排他制御用）
   * @param params - 更新パラメータ
   * @returns 更新後のサインオブジェクト、存在しない場合はnull
   */
  async update(id: string, authorId: string, params: UpdateSignParams): Promise<Sign | null> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // デフォルトサインに変更する場合は、他のデフォルトサインを解除（排他制御）
      if (params.isDefault === true) {
        await client.query(
          `UPDATE signs SET is_default = false, updated_at = CURRENT_TIMESTAMP
           WHERE author_id = $1 AND is_default = true AND id != $2`,
          [authorId, id]
        );
      }

      // 動的にSETクローズを構築する（指定フィールドのみ更新）
      const setClauses: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values: any[] = [];
      let paramIndex = 1;

      if (params.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(params.name);
      }
      if (params.type !== undefined) {
        setClauses.push(`type = $${paramIndex++}`);
        values.push(params.type);
      }
      if (params.imageKey !== undefined) {
        setClauses.push(`image_key = $${paramIndex++}`);
        values.push(params.imageKey);
      }
      if (params.canvasData !== undefined) {
        setClauses.push(`canvas_data = $${paramIndex++}`);
        values.push(JSON.stringify(params.canvasData));
      }
      if (params.isDefault !== undefined) {
        setClauses.push(`is_default = $${paramIndex++}`);
        values.push(params.isDefault);
      }

      // updated_at は常に更新する
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      if (setClauses.length === 1) {
        // updated_atのみの場合はトランザクション不要
        await client.query('COMMIT');
        const found = await db.query(`SELECT * FROM signs WHERE id = $1`, [id]);
        if (found.rows.length === 0) return null;
        return rowToSign(found.rows[0]);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE signs SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      await client.query('COMMIT');

      if (result.rows.length === 0) return null;
      return rowToSign(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * サインを削除する
   *
   * @param id - サインID
   * @returns 削除が成功した場合はtrue
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM signs WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
