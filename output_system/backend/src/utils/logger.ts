/**
 * @file logger.ts
 * @description アプリケーションロガー
 *
 * winstonを使用したログ出力設定。
 * 開発環境ではコンソール出力、本番環境ではJSON形式のログファイル出力を行う。
 */

import winston from 'winston';

/**
 * ログレベル定義
 * error > warn > info > debug の順で詳細度が上がる
 */
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

/**
 * winstonロガーインスタンス
 * アプリケーション全体で共有するシングルトンロガー
 */
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // コンソール出力（開発環境用の読みやすいフォーマット）
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});
