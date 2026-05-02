/**
 * @file 005_create_book_access.ts
 * @description book_accessテーブルのマイグレーション
 *
 * ファンへの書籍アクセス権管理テーブルを作成する。
 * 外部システムからのAPI経由と、著者の手動付与の両方に対応する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: book_accessテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('book_access', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: 'アクセス権ID',
    },
    book_id: {
      type: 'uuid',
      notNull: true,
      references: '"books"',
      onDelete: 'CASCADE',
      comment: '書籍ID（booksテーブル参照）',
    },
    fan_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'ファンID（usersテーブル参照）',
    },
    // サイン合成完了後に紐づけされる
    signed_book_id: {
      type: 'uuid',
      references: '"signed_books"',
      onDelete: 'SET NULL',
      comment: 'サイン入り書籍ID（サイン合成済みの場合）',
    },
    // アクセス権の付与元
    granted_by: {
      type: 'varchar(20)',
      notNull: true,
      check: "granted_by IN ('api', 'manual')",
      comment: '付与元: api（外部システム）/ manual（手動）',
    },
    // 外部システムの注文IDや購入IDを保存
    external_reference: {
      type: 'varchar(255)',
      comment: '外部システム参照ID（注文IDや購入ID等）',
    },
    granted_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '付与日時',
    },
    // NULLは無期限アクセスを意味する
    expires_at: {
      type: 'timestamp with time zone',
      comment: '有効期限（NULLは無期限）',
    },
  }, {
    comment: '書籍アクセス権テーブル（ファンへのアクセス権管理）',
  });

  // ファンIDの書籍一覧取得用インデックス
  pgm.createIndex('book_access', ['fan_id', 'book_id']);
  // 書籍別アクセス権確認用インデックス
  pgm.createIndex('book_access', 'book_id');
  // 外部システム参照IDの検索用インデックス
  pgm.createIndex('book_access', 'external_reference');
}

/**
 * マイグレーション巻き戻し: book_accessテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('book_access');
}
