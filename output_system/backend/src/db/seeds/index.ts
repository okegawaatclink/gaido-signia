/**
 * @file seeds/index.ts
 * @description データベースシードスクリプト
 *
 * 開発・テスト環境用の初期データを投入する。
 * 管理者アカウントとサンプルデータを作成する。
 *
 * 実行コマンド: npm run seed
 */

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

// 環境変数の読み込み
dotenv.config();

/**
 * シードデータの投入処理
 * 管理者アカウントを作成する
 */
async function seed(): Promise<void> {
  const client = await db.connect();

  try {
    logger.info('Starting seed data insertion...');

    await client.query('BEGIN');

    // ===== 管理者アカウント =====
    // パスワード: admin123（開発環境用、本番では変更すること）
    const adminPasswordHash = await bcrypt.hash('admin123', 12);

    await client.query(`
      INSERT INTO users (email, name, role, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@signia.example.com', 'システム管理者', 'admin', adminPasswordHash, true]);

    logger.info('Admin user created: admin@signia.example.com (password: admin123)');

    // ===== 著者アカウント（サンプル） =====
    const authorPasswordHash = await bcrypt.hash('author123', 12);

    await client.query(`
      INSERT INTO users (email, name, role, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, ['author@signia.example.com', 'サンプル著者', 'author', authorPasswordHash, true]);

    logger.info('Author user created: author@signia.example.com (password: author123)');

    // ===== APIキー（サンプル） =====
    // 実際のAPIキー: sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    // ハッシュ値として保存（SHA-256相当）
    const apiKeyHash = await bcrypt.hash('sk-test-sample-api-key-for-development', 12);

    await client.query(`
      INSERT INTO api_keys (key_hash, name, description, permissions, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [
      apiKeyHash,
      'テスト用APIキー',
      '外部システム連携テスト用（開発環境専用）',
      JSON.stringify(['book-access:write', 'book-access:read', 'signs:write']),
      true,
    ]);

    logger.info('Sample API key created');

    await client.query('COMMIT');
    logger.info('Seed data insertion completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed data insertion failed', { error });
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

// スクリプトとして直接実行された場合
seed().catch((error) => {
  logger.error('Fatal error during seeding', { error });
  process.exit(1);
});
