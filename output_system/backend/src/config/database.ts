/**
 * @file database.ts
 * @description PostgreSQLデータベース接続設定
 *
 * node-postgresのPoolを使用してPostgreSQLへの接続プールを管理する。
 * DATABASE_URL環境変数から接続情報を取得する。
 */

import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

/**
 * PostgreSQL接続プール設定
 * 環境変数DATABASE_URLから接続情報を取得する
 * フォーマット: postgresql://user:password@host:port/dbname
 */
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // 接続プールの最大接続数（本番環境では調整が必要）
  max: 20,
  // アイドル接続のタイムアウト（10秒）
  idleTimeoutMillis: 10000,
  // 接続確立のタイムアウト（30秒）
  connectionTimeoutMillis: 30000,
};

/**
 * データベース接続プールのシングルトンインスタンス
 * アプリケーション全体で共有する
 */
export const db = new Pool(poolConfig);

// 接続エラーのハンドリング（未処理のエラーでプロセスが落ちるのを防ぐ）
db.on('error', (err) => {
  logger.error('Unexpected error on idle database client', { error: err.message });
});

/**
 * データベース接続を確認する
 *
 * @returns {Promise<void>} 接続成功時はvoid、失敗時はエラーをthrow
 */
export async function checkDatabaseConnection(): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection established successfully');
  } finally {
    // 接続をプールに返却する
    client.release();
  }
}

/**
 * データベース接続プールを閉じる
 * アプリケーション終了時に呼び出す
 *
 * @returns {Promise<void>}
 */
export async function closeDatabaseConnection(): Promise<void> {
  await db.end();
  logger.info('Database connection pool closed');
}
