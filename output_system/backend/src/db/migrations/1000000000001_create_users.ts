/**
 * @file 001_create_users.ts
 * @description usersテーブルのマイグレーション
 *
 * ユーザー管理テーブルを作成する。
 * 管理側（admin/author）はメール+パスワード認証、
 * ファン（fan）はOAuth認証（Google/Apple）を使用する。
 */

import { MigrationBuilder } from 'node-pg-migrate';

/**
 * マイグレーション: usersテーブルを作成する
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // pgcrypto拡張を有効化（gen_random_uuid()のために必要）
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      // UUIDはPostgreSQLのgen_random_uuid()で自動生成
      default: pgm.func('gen_random_uuid()'),
      comment: 'ユーザーID',
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      comment: 'メールアドレス',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: '表示名',
    },
    // roleはCHECK制約で admin / author / fan の3値に制限
    role: {
      type: 'varchar(20)',
      notNull: true,
      check: "role IN ('admin', 'author', 'fan')",
      comment: 'ロール: admin / author / fan',
    },
    // 管理側（admin/author）のパスワードハッシュ
    password_hash: {
      type: 'varchar(255)',
      comment: 'パスワードハッシュ（管理側のみ）',
    },
    // OAuth認証情報（ファン向け）
    oauth_provider: {
      type: 'varchar(50)',
      comment: 'OAuthプロバイダー（fan: google / apple）',
    },
    oauth_provider_id: {
      type: 'varchar(255)',
      comment: 'OAuthプロバイダーID',
    },
    avatar_url: {
      type: 'varchar(500)',
      comment: 'アバターURL',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: '有効フラグ',
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
    comment: 'ユーザーテーブル（管理側・著者・ファン共通）',
  });

  // メールアドレス検索用インデックス
  pgm.createIndex('users', 'email');
  // ロール別検索用インデックス
  pgm.createIndex('users', 'role');
  // OAuth認証用の複合インデックス
  pgm.createIndex('users', ['oauth_provider', 'oauth_provider_id']);
}

/**
 * マイグレーション巻き戻し: usersテーブルを削除する
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('users');
}
