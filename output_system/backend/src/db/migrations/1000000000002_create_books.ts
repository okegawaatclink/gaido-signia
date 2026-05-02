/**
 * @file 002_create_books.ts
 * @description booksテーブルのマイグレーション
 *
 * 電子書籍管理テーブルを作成する。
 * 著者が登録した電子書籍のメタデータとS3ファイルキーを管理する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: booksテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('books', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: '書籍ID',
    },
    author_id: {
      type: 'uuid',
      notNull: true,
      // usersテーブルへの外部キー（著者が削除されたら書籍も削除）
      references: '"users"',
      onDelete: 'CASCADE',
      comment: '著者ID（usersテーブル参照）',
    },
    title: {
      type: 'varchar(200)',
      notNull: true,
      comment: '書籍タイトル',
    },
    description: {
      type: 'text',
      comment: '書籍説明',
    },
    // ファイル形式: pdf または epub
    format: {
      type: 'varchar(10)',
      notNull: true,
      check: "format IN ('pdf', 'epub')",
      comment: 'ファイル形式: pdf / epub',
    },
    // S3ファイルキーは暗号化して保存
    file_key: {
      type: 'varchar(500)',
      comment: 'S3ファイルキー（暗号化済み）',
    },
    cover_image_key: {
      type: 'varchar(500)',
      comment: '表紙画像S3キー',
    },
    file_size: {
      type: 'bigint',
      comment: 'ファイルサイズ（bytes）',
    },
    page_count: {
      type: 'integer',
      comment: 'ページ数',
    },
    // ステータス: draft（下書き）/ published（公開）/ archived（アーカイブ）
    status: {
      type: 'varchar(20)',
      notNull: true,
      // pgm.funcで生のSQL literalとして'draft'を指定
      default: pgm.func("'draft'"),
      check: "status IN ('draft', 'published', 'archived')",
      comment: 'ステータス: draft / published / archived',
    },
    // JSONBでISBN等のメタデータを柔軟に保存
    metadata: {
      type: 'jsonb',
      // pgm.funcを使用することでnode-pg-migrateによる再クォートを防ぐ
      // '{}'はPostgreSQLのJSONBリテラル（空のJSONオブジェクト）
      default: pgm.func("'{}'"),
      comment: 'メタデータ（ISBN等）',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '作成日時',
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '更新日時',
    },
  }, {
    comment: '電子書籍テーブル',
  });

  // 著者ID検索用インデックス（著者の書籍一覧取得に使用）
  pgm.createIndex('books', 'author_id');
  // ステータス別検索用インデックス
  pgm.createIndex('books', 'status');
}

/**
 * マイグレーション巻き戻し: booksテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('books');
}
