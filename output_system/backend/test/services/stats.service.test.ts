/**
 * @file stats.service.test.ts
 * @description 統計情報サービスのユニットテスト
 *
 * テスト対象:
 * - statsService.getStats: ダッシュボード統計情報取得
 * - statsService.getRecentAuditLogs: 最近の操作履歴取得
 * - statsService.getAdminBooks: 全書籍一覧取得（検索・フィルタ対応）
 * - statsService.getAdminBook: 書籍詳細取得
 *
 * DB モックについて:
 * jest.mock() を使って database モジュールをモック化することで DB 接続不要にする
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// DB への接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

import { statsService } from '../../src/services/stats.service';
import { db } from '../../src/config/database';
import { NotFoundError } from '../../src/utils/errors';

// DB クエリのモック型
const mockDbQuery = db.query as jest.Mock;

/** テスト用書籍データ（DB行形式） */
const mockBookRow = {
  id: 'book-uuid-12345',
  title: 'テスト書籍',
  description: 'テスト書籍の説明',
  format: 'pdf',
  status: 'published',
  file_size: 1024 * 1024,
  page_count: 100,
  metadata: { isbn: '978-0-000-00000-0' },
  author_id: 'author-uuid-12345',
  author_name: 'テスト著者',
  author_email: 'author@example.com',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

/** テスト用監査ログデータ（DB行形式） */
const mockAuditLogRow = {
  id: 'log-uuid-12345',
  user_id: 'user-uuid-12345',
  user_name: 'テスト管理者',
  user_role: 'admin',
  action: 'CREATE_BOOK',
  resource_type: 'book',
  resource_id: 'book-uuid-12345',
  details: { title: 'テスト書籍' },
  ip_address: '192.168.1.1',
  created_at: new Date('2024-01-01T10:00:00Z'),
};

describe('statsService', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセット
    jest.clearAllMocks();
  });

  // ====================================================================
  // getStats
  // ====================================================================

  describe('getStats', () => {
    /**
     * 【テスト対象】statsService.getStats
     * 【テスト内容】正常系: 各集計値が正しく返る
     * 【期待結果】authorCount/bookCount/fanCount/signedBookCountが集計される
     */
    it('should return correct stats counts', async () => {
      // Promise.all の4クエリに対してモックを設定
      // getStats内でPromise.all([著者COUNT, 書籍COUNT, ファンCOUNT, signed_booksCOUNT])
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })  // 著者数
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })  // 書籍数
        .mockResolvedValueOnce({ rows: [{ count: '200' }] }) // ファン数
        .mockResolvedValueOnce({ rows: [{ count: '300' }] }); // 合成数

      const stats = await statsService.getStats();

      expect(stats.authorCount).toBe(10);
      expect(stats.bookCount).toBe(50);
      expect(stats.fanCount).toBe(200);
      expect(stats.signedBookCount).toBe(300);
    });

    /**
     * 【テスト対象】statsService.getStats
     * 【テスト内容】件数が0の場合でも正しく0を返す
     * 【期待結果】全件数が0として返る
     */
    it('should return zeros when no data exists', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const stats = await statsService.getStats();

      expect(stats.authorCount).toBe(0);
      expect(stats.bookCount).toBe(0);
      expect(stats.fanCount).toBe(0);
      expect(stats.signedBookCount).toBe(0);
    });
  });

  // ====================================================================
  // getRecentAuditLogs
  // ====================================================================

  describe('getRecentAuditLogs', () => {
    /**
     * 【テスト対象】statsService.getRecentAuditLogs
     * 【テスト内容】正常系: 監査ログが正しくマッピングされる
     * 【期待結果】snake_caseのDB列名がcamelCaseにマッピングされる
     */
    it('should return mapped audit log entries', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [mockAuditLogRow],
      });

      const logs = await statsService.getRecentAuditLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        id: 'log-uuid-12345',
        userId: 'user-uuid-12345',
        userName: 'テスト管理者',
        userRole: 'admin',
        action: 'CREATE_BOOK',
        resourceType: 'book',
        resourceId: 'book-uuid-12345',
        ipAddress: '192.168.1.1',
      });
    });

    /**
     * 【テスト対象】statsService.getRecentAuditLogs
     * 【テスト内容】ユーザーが削除済みの場合（LEFT JOINでnull）
     * 【期待結果】userNameとuserRoleがnullで返る
     */
    it('should handle deleted user (null user info)', async () => {
      const logWithDeletedUser = {
        ...mockAuditLogRow,
        user_id: null,
        user_name: null,
        user_role: null,
      };

      mockDbQuery.mockResolvedValueOnce({
        rows: [logWithDeletedUser],
      });

      const logs = await statsService.getRecentAuditLogs();

      expect(logs[0].userId).toBeNull();
      expect(logs[0].userName).toBeNull();
      expect(logs[0].userRole).toBeNull();
    });

    /**
     * 【テスト対象】statsService.getRecentAuditLogs
     * 【テスト内容】ログが空の場合
     * 【期待結果】空配列が返る
     */
    it('should return empty array when no logs exist', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const logs = await statsService.getRecentAuditLogs();

      expect(logs).toHaveLength(0);
    });
  });

  // ====================================================================
  // getAdminBooks
  // ====================================================================

  describe('getAdminBooks', () => {
    /**
     * 【テスト対象】statsService.getAdminBooks
     * 【テスト内容】正常系: 検索・フィルタなしで全件取得
     * 【期待結果】書籍一覧と総件数が返る
     */
    it('should return books list with total count', async () => {
      // 総件数クエリのモック
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // 書籍一覧クエリのモック
      mockDbQuery.mockResolvedValueOnce({ rows: [mockBookRow] });

      const result = await statsService.getAdminBooks();

      expect(result.total).toBe(1);
      expect(result.books).toHaveLength(1);
      expect(result.books[0]).toMatchObject({
        id: 'book-uuid-12345',
        title: 'テスト書籍',
        authorName: 'テスト著者',
        authorEmail: 'author@example.com',
      });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    /**
     * 【テスト対象】statsService.getAdminBooks
     * 【テスト内容】検索キーワードを指定した場合
     * 【期待結果】ILIKEによるタイトル部分一致検索クエリが実行される
     */
    it('should apply search filter with ILIKE', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockDbQuery.mockResolvedValueOnce({ rows: [mockBookRow] });

      await statsService.getAdminBooks({ search: 'テスト' });

      // 1回目のクエリ（COUNT）でsearchが適用されているか確認
      const firstCall = mockDbQuery.mock.calls[0];
      expect(firstCall[0]).toContain('ILIKE');
      expect(firstCall[1]).toContain('%テスト%');
    });

    /**
     * 【テスト対象】statsService.getAdminBooks
     * 【テスト内容】ステータスフィルタを指定した場合
     * 【期待結果】ステータスフィルタのWHERE句が追加される
     */
    it('should apply status filter', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockDbQuery.mockResolvedValueOnce({ rows: [mockBookRow] });

      await statsService.getAdminBooks({ status: 'published' });

      const firstCall = mockDbQuery.mock.calls[0];
      expect(firstCall[0]).toContain('status');
      expect(firstCall[1]).toContain('published');
    });

    /**
     * 【テスト対象】statsService.getAdminBooks
     * 【テスト内容】limitが100を超える場合
     * 【期待結果】limitが100に丸められる（過大取得の防止）
     */
    it('should cap limit at 100', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const result = await statsService.getAdminBooks({ limit: 200 });

      expect(result.limit).toBe(100);
    });

    /**
     * 【テスト対象】statsService.getAdminBooks
     * 【テスト内容】ページネーション: page=2, limit=10の場合
     * 【期待結果】OFFSETが10に設定される
     */
    it('should apply correct pagination offset', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '25' }] });
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const result = await statsService.getAdminBooks({ page: 2, limit: 10 });

      // 2回目のクエリ（書籍一覧）のパラメータでOFFSETを確認
      const secondCall = mockDbQuery.mock.calls[1];
      expect(secondCall[1]).toContain(10); // offset = (2-1) * 10 = 10
      expect(result.page).toBe(2);
    });
  });

  // ====================================================================
  // getAdminBook
  // ====================================================================

  describe('getAdminBook', () => {
    /**
     * 【テスト対象】statsService.getAdminBook
     * 【テスト内容】正常系: 書籍詳細が正しくマッピングされる
     * 【期待結果】書籍情報とファンアクセス数が返る
     */
    it('should return book detail with fan access count', async () => {
      const bookRowWithFanCount = {
        ...mockBookRow,
        fan_access_count: '5',
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [bookRowWithFanCount] });

      const book = await statsService.getAdminBook('book-uuid-12345');

      expect(book).toMatchObject({
        id: 'book-uuid-12345',
        title: 'テスト書籍',
        authorName: 'テスト著者',
        fanAccessCount: 5,
      });
    });

    /**
     * 【テスト対象】statsService.getAdminBook
     * 【テスト内容】存在しない書籍IDを指定した場合
     * 【期待結果】NotFoundErrorがスローされる
     */
    it('should throw NotFoundError when book does not exist', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await expect(statsService.getAdminBook('non-existent-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    /**
     * 【テスト対象】statsService.getAdminBook
     * 【テスト内容】ファンアクセスが0件の場合
     * 【期待結果】fanAccessCountが0で返る
     */
    it('should return fanAccessCount as 0 when no fan access', async () => {
      const bookRowWithNoFanAccess = {
        ...mockBookRow,
        fan_access_count: '0',
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [bookRowWithNoFanAccess] });

      const book = await statsService.getAdminBook('book-uuid-12345');

      expect(book.fanAccessCount).toBe(0);
    });
  });
});
