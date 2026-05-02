/**
 * @file routes/index.ts
 * @description APIルーター統合
 *
 * 全APIルートを統合して1つのルーターにまとめる。
 * 各機能ごとのルーターをここでマウントする。
 */

import { Router, Request, Response } from 'express';
import authRouter from './auth.routes';
import booksRouter from './books.routes';
import signsRouter from './signs.routes';
import composeRouter from './compose.routes';
import fanRouter from './fan.routes';
import adminRouter from './admin.routes';
import externalRouter from './external.routes';

/**
 * メインAPIルーター
 * /api プレフィックスでマウントされる
 */
const router = Router();

/**
 * ヘルスチェックエンドポイント
 * サービスの稼働状態を確認するためのエンドポイント
 * Docker HealthCheckやロードバランサーからの確認に使用される
 *
 * GET /api/health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Signia API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});

// 認証APIルーターをマウント
router.use('/auth', authRouter);

// 書籍APIルーターをマウント
router.use('/books', booksRouter);

// サインAPIルーターをマウント
router.use('/signs', signsRouter);

// サイン合成APIルーターをマウント
router.use('/compose', composeRouter);

// ファン向けAPIルーターをマウント
router.use('/fan', fanRouter);

// 管理者向けAPIルーターをマウント（admin ロールのみアクセス可能）
router.use('/admin', adminRouter);

// 外部連携APIルーターをマウント（API Key認証、外部購入システム向け）
router.use('/external', externalRouter);

export default router;
