/**
 * @file 007_create_api_keys.ts
 * @description api_keysテーブルのマイグレーション
 *
 * 外部システム連携APIの認証キー管理テーブルを作成する。
 * APIキーはハッシュ化して保存し、平文は返却後に削除する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: api_keysテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('api_keys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: 'APIキーID',
    },
    // APIキーは平文ではなくハッシュ値で保存（セキュリティ対策）
    key_hash: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      comment: 'APIキーのハッシュ値（平文は保存しない）',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'キー名（管理用の識別名）',
    },
    description: {
      type: 'text',
      comment: '説明（使用目的・発行先等）',
    },
    // 許可されたAPI操作をJSONBで管理（細粒度の権限制御）
    permissions: {
      type: 'jsonb',
      notNull: true,
      // pgm.funcでPostgreSQLのJSONBリテラルとして扱う（空配列）
      default: pgm.func("'[]'"),
      comment: '許可されたAPI操作のリスト',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: '有効フラグ（無効化しても削除はしない）',
    },
    last_used_at: {
      type: 'timestamp with time zone',
      comment: '最終使用日時',
    },
    // NULLは無期限を意味する
    expires_at: {
      type: 'timestamp with time zone',
      comment: '有効期限（NULLは無期限）',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '作成日時',
    },
  }, {
    comment: 'APIキーテーブル（外部システム連携認証管理）',
  });

  // 有効フラグ別検索用インデックス
  pgm.createIndex('api_keys', 'is_active');
}

/**
 * マイグレーション巻き戻し: api_keysテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('api_keys');
}
