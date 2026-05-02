/**
 * @file storage.service.ts
 * @description S3互換ストレージ（MinIO）操作サービス
 *
 * AWS SDK v3を使用してMinIOへのファイル操作を提供する。
 * 電子書籍ファイル、表紙画像、サイン画像のアップロード・ダウンロード・削除を処理する。
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, STORAGE_BUCKET } from '../config/storage';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { Readable } from 'stream';

/**
 * ファイルアップロードのオプション
 */
export interface UploadOptions {
  /** バケット内のファイルパス（キー） */
  key: string;
  /** ファイルの内容 */
  body: Buffer | Readable | string;
  /** MIMEタイプ */
  contentType: string;
  /** サーバーサイド暗号化（AES-256） */
  serverSideEncryption?: 'AES256';
  /** メタデータ */
  metadata?: Record<string, string>;
}

/**
 * MinIOバケットとS3ファイル操作を提供するサービスクラス
 */
export class StorageService {
  private readonly bucket: string;

  constructor(bucket: string = STORAGE_BUCKET) {
    this.bucket = bucket;
  }

  /**
   * バケットが存在しない場合は作成する
   * アプリケーション起動時に呼び出す
   *
   * @returns {Promise<void>}
   */
  async initializeBucket(): Promise<void> {
    try {
      // バケットの存在確認
      await s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      logger.info(`Bucket '${this.bucket}' already exists`);
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        // バケットが存在しない場合は作成
        await this.createBucket();
      } else {
        throw new AppError(`Failed to check bucket existence: ${(error as Error).message}`, 500);
      }
    }
  }

  /**
   * バケットを作成し、パブリックアクセスを禁止するポリシーを設定する
   *
   * @returns {Promise<void>}
   */
  private async createBucket(): Promise<void> {
    try {
      // バケット作成
      await s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      logger.info(`Bucket '${this.bucket}' created successfully`);

      // パブリックアクセス禁止のバケットポリシーを設定
      // 署名付きURLのみでアクセス可能にする（セキュリティ対策）
      const denyPublicPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'DenyPublicRead',
            Effect: 'Deny',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
            Condition: {
              StringEquals: {
                's3:authType': 'REST-HEADER',
              },
            },
          },
        ],
      };

      await s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(denyPublicPolicy),
        })
      );

      logger.info(`Bucket policy set: public access denied for '${this.bucket}'`);
    } catch (error) {
      throw new AppError(`Failed to create bucket: ${(error as Error).message}`, 500);
    }
  }

  /**
   * ファイルをMinIOにアップロードする
   *
   * @param {UploadOptions} options - アップロードオプション
   * @returns {Promise<string>} アップロードしたファイルのS3キー
   */
  async upload(options: UploadOptions): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        // AES-256でサーバーサイド暗号化（機密データの保護）
        // AES-256サーバーサイド暗号化: undefinedの場合は暗号化なし（MinIO開発環境ではKMS未設定のためSSE非対応）
        // AWS S3本番環境では S3_ENABLE_SSE=true を設定して有効化すること
        ServerSideEncryption: options.serverSideEncryption,
        Metadata: options.metadata,
      });

      await s3Client.send(command);
      logger.info('File uploaded successfully', { key: options.key, contentType: options.contentType });

      return options.key;
    } catch (error) {
      logger.error('File upload failed', { key: options.key, error: (error as Error).message });
      throw new AppError(`File upload failed: ${(error as Error).message}`, 500);
    }
  }

  /**
   * MinIOからファイルをダウンロードする
   *
   * @param {string} key - S3ファイルキー
   * @returns {Promise<Buffer>} ファイルの内容
   */
  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        throw new AppError('File body is empty', 404);
      }

      // StreamをBufferに変換
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('File download failed', { key, error: (error as Error).message });
      throw new AppError(`File download failed: ${(error as Error).message}`, 500);
    }
  }

  /**
   * MinIOからファイルを削除する
   *
   * @param {string} key - S3ファイルキー
   * @returns {Promise<void>}
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await s3Client.send(command);
      logger.info('File deleted successfully', { key });
    } catch (error) {
      logger.error('File deletion failed', { key, error: (error as Error).message });
      throw new AppError(`File deletion failed: ${(error as Error).message}`, 500);
    }
  }

  /**
   * ファイルへの署名付きURLを生成する（一時的なアクセス権付与）
   * ファンが電子書籍を閲覧する際に使用する
   *
   * @param {string} key - S3ファイルキー
   * @param {number} expiresInSeconds - URLの有効期限（秒）デフォルト: 15分（900秒）
   * @returns {Promise<string>} 署名付きURL
   */
  async getSignedUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      // 署名付きURLを生成（有効期限付き）
      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      logger.info('Signed URL generated', { key, expiresInSeconds });
      return signedUrl;
    } catch (error) {
      logger.error('Signed URL generation failed', { key, error: (error as Error).message });
      throw new AppError(`Signed URL generation failed: ${(error as Error).message}`, 500);
    }
  }
}

/**
 * デフォルトストレージサービスインスタンス
 * アプリケーション全体で共有するシングルトン
 */
export const storageService = new StorageService();
