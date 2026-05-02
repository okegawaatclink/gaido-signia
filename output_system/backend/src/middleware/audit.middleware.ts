/**
 * @file audit.middleware.ts
 * @description 監査ログ記録ミドルウェア
 *
 * ログイン・ログアウト等の重要操作をaudit_logsテーブルに記録する。
 * IPアドレス・ユーザーエージェント・操作内容・結果を記録する。
 *
 * 監査ログの目的:
 * 1. セキュリティインシデントの追跡
 * 2. 認証イベントの記録（ログイン成功/失敗、ログアウト）
 * 3. 重要操作（書籍削除、ユーザー管理等）の記録
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';

/**
 * 監査ログのアクション種別
 * audit_logsテーブルのaction列に格納される値
 */
export type AuditAction =
  | 'login_success'  // ログイン成功
  | 'login_failed'   // ログイン失敗（認証エラー）
  | 'logout'         // ログアウト
  | 'book_create'    // 書籍作成
  | 'book_update'    // 書籍更新
  | 'book_delete'    // 書籍削除
  | 'sign_create'    // サイン作成
  | 'sign_delete'    // サイン削除
  | 'author_create'  // 著者アカウント作成
  | 'author_update'  // 著者アカウント更新
  | 'author_delete'  // 著者アカウント削除（無効化）
  | 'compose_start'; // サイン合成開始

/**
 * 監査ログエントリーの型定義
 */
export interface AuditLogEntry {
  /** 操作を行ったユーザーID（未認証の場合はnull） */
  userId: string | null;
  /** アクション種別 */
  action: AuditAction;
  /** 操作対象リソースの種類（例: 'book', 'user', 'sign'） */
  resourceType?: string;
  /** 操作対象リソースのID */
  resourceId?: string;
  /** 追加情報（メールアドレス等のコンテキスト情報） */
  details?: Record<string, unknown>;
  /** 操作結果（success / failed） */
  result: 'success' | 'failed';
  /** クライアントのIPアドレス */
  ipAddress?: string;
  /** ユーザーエージェント文字列 */
  userAgent?: string;
}

/**
 * 監査ログをデータベースに記録する
 *
 * エラーが発生しても例外を投げずにログのみ記録する
 * （監査ログの失敗でリクエスト全体を失敗させない）
 *
 * @param entry - 記録する監査ログエントリー
 * @returns {Promise<void>}
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, result, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.result,
        entry.ipAddress || null,
        entry.userAgent || null,
      ]
    );
  } catch (error) {
    // 監査ログの記録失敗はアプリケーションを停止させない（記録のみ）
    logger.error('Failed to record audit log', {
      error: (error as Error).message,
      action: entry.action,
      userId: entry.userId,
    });
  }
}

/**
 * リクエストからクライアントIPアドレスを取得する
 * X-Forwarded-For ヘッダーを優先し、なければremoteAddressを使用する
 *
 * @param req - Expressリクエストオブジェクト
 * @returns IPアドレス文字列
 */
export function getClientIpAddress(req: Request): string {
  // プロキシ経由の場合はX-Forwarded-ForヘッダーにクライアントIPが含まれる
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-Forは "client, proxy1, proxy2" 形式なので最初のIPを取得
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * 認証イベント（ログイン・ログアウト）を記録するヘルパー関数
 *
 * @param req - Expressリクエストオブジェクト
 * @param action - アクション種別（login_success / login_failed / logout）
 * @param userId - ユーザーID（未認証の場合はnull）
 * @param details - 追加情報（メールアドレス等）
 */
export async function recordAuthEvent(
  req: Request,
  action: 'login_success' | 'login_failed' | 'logout',
  userId: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  await recordAuditLog({
    userId,
    action,
    resourceType: 'auth',
    details,
    result: action === 'login_failed' ? 'failed' : 'success',
    ipAddress: getClientIpAddress(req),
    userAgent: req.headers['user-agent'],
  });
}

/**
 * 一般的なリソース操作を監査ログに記録するExpressミドルウェアファクトリー
 *
 * レスポンス完了時にログを記録するため、次のミドルウェアの処理後に実行される。
 *
 * @param action - 記録するアクション種別
 * @param resourceType - 操作対象リソースの種類
 * @param getResourceId - リクエストからリソースIDを取得するコールバック（省略可）
 * @returns Expressミドルウェア関数
 *
 * @example
 * router.delete('/books/:id',
 *   authenticate,
 *   authorOrAdmin,
 *   auditLog('book_delete', 'book', (req) => req.params.id),
 *   booksController.deleteBook
 * );
 */
export function auditLog(
  action: AuditAction,
  resourceType: string,
  getResourceId?: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // レスポンス完了後にログを記録（onfinishイベント）
    res.on('finish', () => {
      const result = res.statusCode < 400 ? 'success' : 'failed';
      const resourceId = getResourceId ? getResourceId(req) : undefined;

      recordAuditLog({
        userId: req.user?.userId || null,
        action,
        resourceType,
        resourceId,
        result,
        ipAddress: getClientIpAddress(req),
        userAgent: req.headers['user-agent'],
      }).catch((err) => {
        logger.error('Failed to record audit log in middleware', {
          error: (err as Error).message,
        });
      });
    });

    next();
  };
}
