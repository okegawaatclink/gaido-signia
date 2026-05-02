/**
 * @file 006_create_audit_logs.ts
 * @description audit_logsテーブルのマイグレーション
 *
 * システム操作の監査ログテーブルを作成する。
 * セキュリティ要件として全ての重要な操作を記録する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: audit_logsテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('audit_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      comment: 'ログID',
    },
    // ユーザーが削除されてもログは残す（SET NULL）
    user_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: '操作ユーザーID（usersテーブル参照）',
    },
    // 操作種別（例: CREATE_BOOK, UPDATE_SIGN, DELETE_USER等）
    action: {
      type: 'varchar(100)',
      notNull: true,
      comment: '操作種別（例: CREATE_BOOK, DELETE_USER等）',
    },
    // 対象リソースの種別（例: book, sign, user等）
    resource_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: '対象リソース種別（例: book, sign, user等）',
    },
    resource_id: {
      type: 'uuid',
      comment: '対象リソースID',
    },
    // 操作の詳細情報をJSONBで柔軟に保存
    details: {
      type: 'jsonb',
      // pgm.funcでPostgreSQLのJSONBリテラルとして扱う
      default: pgm.func("'{}'"),
      comment: '詳細情報（変更前後の値等）',
    },
    ip_address: {
      type: 'varchar(50)',
      comment: 'クライアントIPアドレス',
    },
    user_agent: {
      type: 'varchar(500)',
      comment: 'クライアントUser-Agent',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: '記録日時',
    },
  }, {
    comment: '監査ログテーブル（セキュリティ・操作履歴管理）',
  });

  // ユーザー操作履歴の検索用インデックス
  pgm.createIndex('audit_logs', 'user_id');
  // 操作種別でのフィルタリング用インデックス
  pgm.createIndex('audit_logs', 'action');
  // リソース種別・IDでの検索用インデックス
  pgm.createIndex('audit_logs', ['resource_type', 'resource_id']);
  // 時系列検索用インデックス
  pgm.createIndex('audit_logs', 'created_at');
}

/**
 * マイグレーション巻き戻し: audit_logsテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('audit_logs');
}
