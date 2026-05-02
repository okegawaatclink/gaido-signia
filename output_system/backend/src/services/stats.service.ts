/**
 * @file stats.service.ts
 * @description 管理者向け統計情報サービス
 *
 * ダッシュボード表示に必要な統計情報と監査ログを提供する。
 * - システム全体の統計情報（著者数・書籍数・ファン数・サイン合成数）
 * - 最近の操作履歴（audit_logsから直近20件）
 * - 全書籍一覧（検索・フィルタ対応）
 * - 書籍詳細（書籍情報 + 著者情報）
 *
 * セキュリティ:
 * - このサービスは admin ロールのユーザーのみ呼び出し可能
 */

import { db } from '../config/database';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

// ===== 型定義 =====

/**
 * ダッシュボード統計情報型
 */
export interface DashboardStats {
  /** 著者アカウント数（is_active=trueのみ） */
  authorCount: number;
  /** 書籍登録数（全ステータス合計） */
  bookCount: number;
  /** ファンアカウント数（is_active=trueのみ） */
  fanCount: number;
  /** サイン合成済み書籍数（signed_booksテーブルの件数） */
  signedBookCount: number;
}

/**
 * 監査ログエントリ型（ダッシュボード表示用）
 */
export interface AuditLogEntry {
  /** ログID */
  id: string;
  /** 操作ユーザーID（nullの場合はユーザー削除済み） */
  userId: string | null;
  /** 操作ユーザー名（nullの場合はユーザー削除済み） */
  userName: string | null;
  /** 操作ユーザーのロール */
  userRole: string | null;
  /** 操作種別（例: CREATE_BOOK, DELETE_USER等） */
  action: string;
  /** 対象リソース種別（例: book, sign, user等） */
  resourceType: string;
  /** 対象リソースID */
  resourceId: string | null;
  /** 詳細情報 */
  details: Record<string, unknown>;
  /** クライアントIPアドレス */
  ipAddress: string | null;
  /** 記録日時 */
  createdAt: Date;
}

/**
 * 管理者向け書籍情報型（著者情報含む）
 */
export interface AdminBookInfo {
  /** 書籍ID */
  id: string;
  /** 書籍タイトル */
  title: string;
  /** 書籍説明 */
  description: string | null;
  /** ファイル形式: pdf または epub */
  format: string;
  /** ステータス */
  status: 'draft' | 'published' | 'archived';
  /** ファイルサイズ（bytes） */
  fileSize: number | null;
  /** ページ数 */
  pageCount: number | null;
  /** メタデータ */
  metadata: Record<string, unknown>;
  /** 著者ID */
  authorId: string;
  /** 著者名 */
  authorName: string;
  /** 著者メールアドレス */
  authorEmail: string;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * 全書籍一覧取得パラメータ
 */
export interface GetAdminBooksParams {
  /** タイトルの部分一致検索キーワード（オプション） */
  search?: string;
  /** ステータスフィルタ（オプション） */
  status?: 'draft' | 'published' | 'archived';
  /** ページ番号（1始まり、デフォルト: 1） */
  page?: number;
  /** 1ページあたりの件数（デフォルト: 20、最大: 100） */
  limit?: number;
}

/**
 * 全書籍一覧レスポンス型
 */
export interface GetAdminBooksResult {
  /** 書籍情報の配列 */
  books: AdminBookInfo[];
  /** 総件数（ページネーション用） */
  total: number;
  /** 現在のページ番号 */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
}

// ===== ヘルパー関数 =====

/**
 * DB 行データを AuditLogEntry 型にマッピングする
 * snake_case（DB 列名）から camelCase（TypeScript）への変換を行う
 *
 * @param row - DB から取得した行データ
 * @returns AuditLogEntry 型のオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToAuditLogEntry(row: Record<string, any>): AuditLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: row.details || {},
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

/**
 * DB 行データを AdminBookInfo 型にマッピングする
 *
 * @param row - DB から取得した行データ
 * @returns AdminBookInfo 型のオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToAdminBookInfo(row: Record<string, any>): AdminBookInfo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    status: row.status,
    fileSize: row.file_size ? Number(row.file_size) : null,
    pageCount: row.page_count,
    metadata: row.metadata || {},
    authorId: row.author_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===== サービス関数 =====

/**
 * ダッシュボード統計情報を取得する
 *
 * 以下の集計値を返す:
 * - 著者アカウント数（is_active=trueのみ）
 * - 書籍登録数（全ステータス合計）
 * - ファンアカウント数（is_active=trueのみ）
 * - サイン合成済み書籍数
 *
 * @returns ダッシュボード統計情報
 *
 * @example
 * const stats = await getStats();
 * // { authorCount: 10, bookCount: 50, fanCount: 200, signedBookCount: 300 }
 */
export async function getStats(): Promise<DashboardStats> {
  logger.info('Getting dashboard stats');

  // 並列で各集計クエリを実行してパフォーマンスを最適化する
  const [authorResult, bookResult, fanResult, signedBookResult] = await Promise.all([
    // 有効な著者アカウント数を取得
    db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE role = 'author' AND is_active = true`
    ),
    // 全ステータスの書籍数を取得
    db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM books`
    ),
    // 有効なファンアカウント数を取得
    db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE role = 'fan' AND is_active = true`
    ),
    // 合成済み書籍数を取得（signed_booksテーブルの件数）
    db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM signed_books`
    ),
  ]);

  const stats: DashboardStats = {
    authorCount: parseInt(authorResult.rows[0].count, 10),
    bookCount: parseInt(bookResult.rows[0].count, 10),
    fanCount: parseInt(fanResult.rows[0].count, 10),
    signedBookCount: parseInt(signedBookResult.rows[0].count, 10),
  };

  logger.info('Dashboard stats retrieved', { stats });
  return stats;
}

/**
 * 最近の操作履歴を取得する
 *
 * audit_logsテーブルから直近20件を取得する。
 * ユーザー情報（名前・ロール）をJOINして返す。
 * ユーザーが削除されている場合はnullになる（LEFT JOIN）。
 *
 * @returns 最近の操作履歴（最大20件、作成日時降順）
 *
 * @example
 * const logs = await getRecentAuditLogs();
 */
export async function getRecentAuditLogs(): Promise<AuditLogEntry[]> {
  logger.info('Getting recent audit logs');

  // audit_logsとusersをLEFT JOINしてユーザー情報を取得
  // ユーザーが削除されている場合はnullになる（LEFT JOIN）
  const result = await db.query<Record<string, unknown>>(
    `SELECT
       al.id,
       al.user_id,
       u.name as user_name,
       u.role as user_role,
       al.action,
       al.resource_type,
       al.resource_id,
       al.details,
       al.ip_address,
       al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ORDER BY al.created_at DESC
     LIMIT 20`
  );

  const logs = result.rows.map(mapRowToAuditLogEntry);
  logger.info('Recent audit logs retrieved', { count: logs.length });

  return logs;
}

/**
 * 全書籍一覧を取得する（管理者向け）
 *
 * 全著者の書籍を一覧表示する。著者情報（名前・メール）も含む。
 * タイトルのILIKE部分一致検索とステータスフィルタに対応。
 * ページネーション対応。
 *
 * @param params - 検索・フィルタ・ページネーションパラメータ
 * @returns 書籍一覧と総件数
 *
 * @example
 * const result = await getAdminBooks({ search: 'テスト', page: 1, limit: 20 });
 */
export async function getAdminBooks(params: GetAdminBooksParams = {}): Promise<GetAdminBooksResult> {
  const {
    search,
    status,
    page = 1,
    limit = 20,
  } = params;

  // limitの上限を100に制限（大量取得の防止）
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  // WHERE句の動的構築
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // タイトルのILIKE部分一致検索
  if (search) {
    conditions.push(`b.title ILIKE $${paramIndex}`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  // ステータスフィルタ
  if (status) {
    conditions.push(`b.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 総件数を取得（ページネーション用）
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM books b
     JOIN users u ON b.author_id = u.id
     ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // 書籍一覧を取得（著者情報のJOIN込み）
  const booksResult = await db.query<Record<string, unknown>>(
    `SELECT
       b.id,
       b.title,
       b.description,
       b.format,
       b.status,
       b.file_size,
       b.page_count,
       b.metadata,
       b.author_id,
       u.name as author_name,
       u.email as author_email,
       b.created_at,
       b.updated_at
     FROM books b
     JOIN users u ON b.author_id = u.id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, safeLimit, offset]
  );

  const books = booksResult.rows.map(mapRowToAdminBookInfo);

  logger.info('Admin books retrieved', { total, page, limit: safeLimit, search, status });

  return {
    books,
    total,
    page,
    limit: safeLimit,
  };
}

/**
 * 書籍詳細を取得する（管理者向け）
 *
 * 指定IDの書籍情報と著者情報を返す。
 * ファンアクセス数（book_access）も合わせて集計して返す。
 *
 * @param bookId - 書籍ID（UUID）
 * @returns 書籍詳細情報
 * @throws {NotFoundError} 指定IDの書籍が存在しない場合
 *
 * @example
 * const book = await getAdminBook('book-uuid-here');
 */
export async function getAdminBook(bookId: string): Promise<AdminBookInfo & { fanAccessCount: number }> {
  // 書籍情報と著者情報をJOINして取得
  const result = await db.query<Record<string, unknown>>(
    `SELECT
       b.id,
       b.title,
       b.description,
       b.format,
       b.status,
       b.file_size,
       b.page_count,
       b.metadata,
       b.author_id,
       u.name as author_name,
       u.email as author_email,
       b.created_at,
       b.updated_at,
       COUNT(ba.id) as fan_access_count
     FROM books b
     JOIN users u ON b.author_id = u.id
     LEFT JOIN book_access ba ON b.id = ba.book_id
     WHERE b.id = $1
     GROUP BY b.id, u.name, u.email`,
    [bookId]
  );

  if (result.rows.length === 0) {
    logger.warn('Admin book not found', { bookId });
    throw new NotFoundError('書籍が見つかりません');
  }

  const row = result.rows[0];
  const book = mapRowToAdminBookInfo(row);
  const fanAccessCount = parseInt(row.fan_access_count as string, 10);

  logger.info('Admin book detail retrieved', { bookId });

  return { ...book, fanAccessCount };
}

/**
 * statsService オブジェクト（名前空間として公開）
 */
export const statsService = {
  getStats,
  getRecentAuditLogs,
  getAdminBooks,
  getAdminBook,
};
