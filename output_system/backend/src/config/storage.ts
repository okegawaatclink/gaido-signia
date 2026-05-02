/**
 * @file storage.ts
 * @description S3互換ストレージ（MinIO）接続設定
 *
 * AWS SDK v3のS3Clientを使用してMinIOへの接続を設定する。
 * MinIOはS3互換APIを提供するため、endpointを指定することでAWS SDKが利用できる。
 */

import { S3Client } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';

/**
 * MinIOのバケット名
 * 電子書籍ファイルやサイン画像を保存するバケット
 */
export const STORAGE_BUCKET = process.env.S3_BUCKET || 'ebook-signing';

/**
 * S3クライアントの設定
 * MinIOのエンドポイントを指定することでAWS SDKをMinIOに向ける
 */
export const s3Client = new S3Client({
  // MinIOのエンドポイント（環境変数から取得）
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  // MinIOの場合はカスタムエンドポイントのためforcePathStyleをtrueに設定
  // （仮想ホストスタイル: bucket.endpoint ではなく endpoint/bucket 形式を使用）
  forcePathStyle: true,
  // リージョン（MinIOでは任意の値でよい）
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
});

logger.info('S3 client configured', {
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  bucket: STORAGE_BUCKET,
});
