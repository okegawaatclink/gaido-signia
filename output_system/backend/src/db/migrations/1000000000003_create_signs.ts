/**
 * @file 003_create_signs.ts
 * @description signsテーブルのマイグレーション
 *
 * 著者のサイン管理テーブルを作成する。
 * 共通サイン（全ファンに同じサイン）と個別サイン（宛名付き）の2種類を管理する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: signsテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('signs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: 'サインID',
    },
    author_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: '著者ID（usersテーブル参照）',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'サイン名（管理用）',
    },
    // サイン種別: common（共通）または individual（個別・宛名付き）
    type: {
      type: 'varchar(20)',
      notNull: true,
      check: "type IN ('common', 'individual')",
      comment: '種別: common / individual',
    },
    // サイン画像はMinIOに保存し、S3キーをDBで管理
    image_key: {
      type: 'varchar(500)',
      comment: 'サイン画像S3キー（PNG）',
    },
    // Canvas描画データはJSONBで保存（再編集時に利用）
    canvas_data: {
      type: 'jsonb',
      comment: 'Canvas描画データ（JSON）',
    },
    // デフォルトサインは著者につき1つのみ
    is_default: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'デフォルトサインフラグ',
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
    comment: 'サインテーブル（著者のサイン画像管理）',
  });

  // 著者ID検索用インデックス（著者のサイン一覧取得に使用）
  pgm.createIndex('signs', 'author_id');
}

/**
 * マイグレーション巻き戻し: signsテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('signs');
}
