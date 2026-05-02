/**
 * @file 004_create_signed_books.ts
 * @description signed_booksテーブルのマイグレーション
 *
 * サイン入り書籍の管理テーブルを作成する。
 * 元の書籍にサインを合成した結果を管理する。
 * サイン合成は非同期処理のため、statusで進捗を管理する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: signed_booksテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('signed_books', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: 'サイン入り書籍ID',
    },
    book_id: {
      type: 'uuid',
      notNull: true,
      references: '"books"',
      onDelete: 'CASCADE',
      comment: '元書籍ID（booksテーブル参照）',
    },
    sign_id: {
      type: 'uuid',
      notNull: true,
      references: '"signs"',
      onDelete: 'RESTRICT',
      comment: '使用サインID（signsテーブル参照）',
    },
    fan_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: '対象ファンID（usersテーブル参照）',
    },
    // 個別サイン（宛名付き）の場合のみ使用
    recipient_name: {
      type: 'varchar(100)',
      comment: '宛名（個別サインの場合）',
    },
    // サイン合成済みファイルのS3キー（合成完了後に設定）
    signed_file_key: {
      type: 'varchar(500)',
      comment: 'サイン合成済みファイルS3キー',
    },
    // 合成処理の進捗状態
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: pgm.func("'processing'"),
      check: "status IN ('processing', 'completed', 'error')",
      comment: 'ステータス: processing / completed / error',
    },
    composed_at: {
      type: 'timestamp with time zone',
      comment: '合成完了日時',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '作成日時',
    },
  }, {
    comment: 'サイン入り書籍テーブル（サイン合成結果管理）',
  });

  // 書籍ID・ファンIDの複合インデックス（重複防止と検索に使用）
  pgm.createIndex('signed_books', ['book_id', 'fan_id']);
  // ステータス別検索用インデックス（処理中のタスク確認に使用）
  pgm.createIndex('signed_books', 'status');
}

/**
 * マイグレーション巻き戻し: signed_booksテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('signed_books');
}
