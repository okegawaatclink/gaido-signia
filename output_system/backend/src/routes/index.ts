/**
 * @file routes/index.ts
 * @description APIルーター統合
 *
 * 全APIルートを統合して1つのルーターにまとめる。
 * 各機能ごとのルーターをここでマウントする。
 */

import { Router, Request, Response } from 'express';

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

// TODO: 以下の各ルーターは後続のTaskで実装する
// router.use('/auth', authRouter);
// router.use('/books', booksRouter);
// router.use('/signs', signsRouter);
// router.use('/compose', composeRouter);
// router.use('/fan', fanRouter);
// router.use('/admin', adminRouter);
// router.use('/external', externalRouter);

export default router;
