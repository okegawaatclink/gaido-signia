/**
 * @file fan.service.ts
 * @description ファン向けサービス
 *
 * ファンが利用する機能のビジネスロジックを提供する。
 * - 本棚（サイン入り書籍一覧）取得
 * - 書籍閲覧用署名付きURL生成
 *
 * セキュリティ方針:
 * - 認証済みファン自身の書籍のみ返す（他ファンの書籍は絶対に返さない）
 * - 表紙画像は15分有効の署名付きURLで提供（直接S3キー露出を防ぐ）
 */

import { db } from '../config/database';
import { storageService } from './storage.service';
import { ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * 本棚アイテム型
 * 1冊分の書籍情報・サイン入り書籍情報・アクセス権情報を含む
 */
export interface BookshelfItem {
  /** 書籍基本情報 */
  book: {
    id: string;
    title: string;
    description: string | null;
    format: 'pdf' | 'epub';
    /** 表紙画像の署名付きURL（15分有効）。未設定の場合はnull */
    coverImageUrl: string | null;
    fileSize: number | null;
    pageCount: number | null;
    status: 'draft' | 'published' | 'archived';
    createdAt: Date;
  };
  /** サイン入り書籍情報（サイン合成済みの場合のみ。未合成の場合はnull） */
  signedBook: {
    id: string;
    signType: string | null;
    recipientName: string | null;
    status: 'processing' | 'completed' | 'error';
    composedAt: Date | null;
  } | null;
  /** アクセス権情報 */
  access: {
    id: string;
    grantedBy: 'api' | 'manual';
    grantedAt: Date;
  };
}

/**
 * 書籍閲覧URL取得結果型
 */
export interface BookReadUrlResult {
  /** 署名付きURL（15分有効） */
  url: string;
  /** URLの有効期限 */
  expiresAt: Date;
}

/**
 * ファン向けサービスクラス
 */
export class FanService {
  /**
   * ファンの本棚（サイン入り書籍一覧）を取得する
   *
   * book_accessテーブルを起点にbooks・signed_books・signsを結合し、
   * 認証済みファン自身の書籍のみを返す。
   * 表紙画像がある場合は15分有効の署名付きURLを生成して返す。
   *
   * @param fanId - 認証済みファンのユーザーID
   * @returns 本棚アイテムの配列（書籍がない場合は空配列）
   */
  async getBookshelf(fanId: string): Promise<BookshelfItem[]> {
    logger.info('Getting bookshelf for fan', { fanId });

    /**
     * JOINクエリ:
     * - book_access (ba): アクセス権テーブル（fanIdでフィルタ）
     * - books (b): 書籍基本情報
     * - signed_books (sb): サイン入り書籍（LEFT JOIN - サイン合成済みでない場合はnull）
     * - signs (s): サイン情報（サイン種別取得用、LEFT JOIN）
     *
     * インデックス活用:
     * - book_access(fan_id, book_id) 複合インデックスを使用
     */
    const result = await db.query(
      `SELECT
        ba.id AS access_id,
        ba.granted_by,
        ba.granted_at,
        b.id AS book_id,
        b.title,
        b.description,
        b.format,
        b.cover_image_key,
        b.file_size,
        b.page_count,
        b.status AS book_status,
        b.created_at AS book_created_at,
        sb.id AS signed_book_id,
        sb.recipient_name,
        sb.status AS signed_book_status,
        sb.composed_at,
        s.type AS sign_type
       FROM book_access ba
       INNER JOIN books b ON ba.book_id = b.id
       LEFT JOIN signed_books sb ON ba.signed_book_id = sb.id
       LEFT JOIN signs s ON sb.sign_id = s.id
       WHERE ba.fan_id = $1
         AND (ba.expires_at IS NULL OR ba.expires_at > CURRENT_TIMESTAMP)
       ORDER BY ba.granted_at DESC`,
      [fanId]
    );

    logger.info('Bookshelf query completed', { fanId, count: result.rows.length });

    // 各行に対して表紙画像の署名付きURLを並列生成する
    // 未設定の書籍はnullのままにする（Promise.allSettledで部分的な失敗も許容）
    const items = await Promise.all(
      result.rows.map(async (row) => {
        // 表紙画像の署名付きURL生成（有効期限15分 = 900秒）
        let coverImageUrl: string | null = null;
        if (row.cover_image_key) {
          try {
            coverImageUrl = await storageService.getSignedUrl(
              row.cover_image_key,
              900 // 15分
            );
          } catch (error) {
            // 署名付きURL生成失敗は致命的ではない（表紙なしで返す）
            logger.warn('Failed to generate cover image URL', {
              bookId: row.book_id,
              error: (error as Error).message,
            });
          }
        }

        return {
          book: {
            id: row.book_id,
            title: row.title,
            description: row.description,
            format: row.format as 'pdf' | 'epub',
            coverImageUrl,
            fileSize: row.file_size ? parseInt(row.file_size, 10) : null,
            pageCount: row.page_count,
            status: row.book_status as 'draft' | 'published' | 'archived',
            createdAt: row.book_created_at,
          },
          signedBook: row.signed_book_id
            ? {
                id: row.signed_book_id,
                signType: row.sign_type as string | null,
                recipientName: row.recipient_name,
                status: row.signed_book_status as 'processing' | 'completed' | 'error',
                composedAt: row.composed_at,
              }
            : null,
          access: {
            id: row.access_id,
            grantedBy: row.granted_by as 'api' | 'manual',
            grantedAt: row.granted_at,
          },
        } as BookshelfItem;
      })
    );

    return items;
  }

  /**
   * 書籍閲覧用の署名付きURLを取得する
   *
   * ファンが所有する書籍のみアクセス可能。
   * サイン合成済みの書籍（signed_books）が存在する場合はそのファイルを、
   * 未合成の場合は元の書籍ファイルを返す。
   *
   * @param fanId - 認証済みファンのユーザーID
   * @param bookId - アクセス対象の書籍ID
   * @returns 署名付きURLと有効期限
   * @throws {ForbiddenError} ファンがその書籍のアクセス権を持っていない場合
   */
  async getBookReadUrl(fanId: string, bookId: string): Promise<BookReadUrlResult> {
    logger.info('Getting book read URL', { fanId, bookId });

    // ファンがその書籍のアクセス権を持っているか確認
    const accessResult = await db.query(
      `SELECT
         ba.id,
         b.file_key,
         sb.signed_file_key
       FROM book_access ba
       INNER JOIN books b ON ba.book_id = b.id
       LEFT JOIN signed_books sb ON ba.signed_book_id = sb.id
         AND sb.status = 'completed'
       WHERE ba.fan_id = $1
         AND ba.book_id = $2
         AND (ba.expires_at IS NULL OR ba.expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [fanId, bookId]
    );

    if (accessResult.rows.length === 0) {
      logger.warn('Fan attempted to access book without permission', { fanId, bookId });
      throw new ForbiddenError('この書籍へのアクセス権限がありません');
    }

    const access = accessResult.rows[0];

    // サイン合成済みファイルを優先して返す。なければ元書籍ファイルを使用
    const fileKey = access.signed_file_key || access.file_key;

    if (!fileKey) {
      throw new ForbiddenError('書籍ファイルがまだ利用できません');
    }

    // 署名付きURL生成（有効期限15分 = 900秒）
    const EXPIRES_IN_SECONDS = 900;
    const url = await storageService.getSignedUrl(fileKey, EXPIRES_IN_SECONDS);
    const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000);

    logger.info('Book read URL generated', { fanId, bookId, expiresAt });

    return { url, expiresAt };
  }
}

/**
 * ファンサービスのシングルトンインスタンス
 * アプリケーション全体で共有する
 */
export const fanService = new FanService();
