/**
 * @file index.ts
 * @description Express.jsバックエンドAPIサーバーのエントリーポイント
 *
 * Signia（電子書籍サイン合成システム）のバックエンドAPIサーバー。
 * ポート3002で起動し、フロントエンドおよび外部システムからのリクエストを処理する。
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { storageService } from './services/storage.service';
import apiRouter from './routes/index';

// 環境変数の読み込み（.envファイルがあれば読み込む）
dotenv.config();

/** サーバーのポート番号 */
const PORT = parseInt(process.env.PORT || '3002', 10);

/** Expressアプリケーションインスタンス */
const app = express();

// ===== ミドルウェア設定 =====

/**
 * セキュリティヘッダー設定
 * helmetはXSS、クリックジャッキング等の攻撃からアプリを保護するHTTPヘッダーを設定する
 */
app.use(helmet());

/**
 * CORS設定
 * フロントエンドコンテナ（okegawaatclink-gaido-signia-output-system:3001）からのアクセスを許可する
 */
app.use(
  cors({
    origin: [
      // 開発環境: ホストからのアクセス
      'http://localhost:3001',
      // コンテナ内からのアクセス（フロントエンドコンテナ名）
      'http://okegawaatclink-gaido-signia-output-system:3001',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  })
);

/**
 * リクエストボディのパース
 * JSONおよびURLエンコードされたリクエストボディを解析する
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * HTTPアクセスログ
 * 開発環境はdev形式（色付きコンソール）、本番環境はcombined形式（Apache形式）
 */
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// ===== ルーター設定 =====

/**
 * APIルーターをマウント
 * 全APIエンドポイントは /api プレフィックスを持つ
 */
app.use('/api', apiRouter);

/**
 * ルートパスへのアクセス
 * API以外のパスにアクセスした場合のフォールバック
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Signia API',
    version: '0.1.0',
    docs: '/api/health',
  });
});

// ===== エラーハンドリング =====

/**
 * 404エラーハンドラー
 * 存在しないルートへのアクセスを処理する
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: '指定されたエンドポイントが見つかりません',
    statusCode: 404,
  });
});

/**
 * グローバルエラーハンドラー
 * アプリケーション全体のエラーを処理する
 * Expressのエラーハンドラーは引数が4つ必要
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    // アプリケーションで定義したカスタムエラー
    logger.warn('Application error', {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
    });
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
  } else {
    // 予期しないエラー（スタックトレースをログに記録）
    logger.error('Unexpected error', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '内部サーバーエラーが発生しました',
      statusCode: 500,
    });
  }
});

// ===== サーバー起動 =====

/**
 * サーバーを起動する
 * MinIOバケットの初期化を行ってからサーバーを起動する
 */
async function startServer(): Promise<void> {
  // MinIOバケットの初期化（存在しない場合は作成）
  try {
    await storageService.initializeBucket();
    logger.info('Storage bucket initialized');
  } catch (error) {
    // MinIOへの接続に失敗しても起動は続ける（後続で再試行するため）
    logger.warn('Storage bucket initialization failed, will retry later', {
      error: (error as Error).message,
    });
  }
}

const server = app.listen(PORT, async () => {
  logger.info(`Signia API server started on port ${PORT}`, {
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
  });
  // ストレージ初期化を非同期で実行
  await startServer();
});

/**
 * グレースフルシャットダウン
 * SIGTERMシグナルを受け取った際に安全にサーバーを停止する
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
