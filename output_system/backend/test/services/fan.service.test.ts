/**
 * @file fan.service.test.ts
 * @description ファンサービスのユニットテスト
 *
 * テスト対象:
 * - FanService.getBookshelf: ファンの本棚（書籍一覧）取得
 * - FanService.getBookReadUrl: 書籍閲覧用署名付きURL取得
 *
 * DBとS3操作はモック化してユニットテストとして実行する
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// DBへの接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

// ストレージサービスをモック化（署名付きURL生成）
jest.mock('../../src/services/storage.service');

import { db } from '../../src/config/database';
import { storageService } from '../../src/services/storage.service';
import { FanService } from '../../src/services/fan.service';

/** モック型定義 */
const mockDb = db as jest.Mocked<typeof db>;
const mockStorageService = storageService as jest.Mocked<typeof storageService>;

/** テスト用のファンID */
const TEST_FAN_ID = 'fan-user-id-1234';

/** テスト用の書籍ID */
const TEST_BOOK_ID = 'book-id-1234';

/** テスト用のDBクエリ結果行（本棚アイテム） */
const mockBookshelfRow = {
  access_id: 'access-id-1234',
  granted_by: 'api',
  granted_at: new Date('2024-01-15'),
  book_id: TEST_BOOK_ID,
  title: 'テスト書籍',
  description: '書籍の説明',
  format: 'pdf',
  cover_image_key: 'covers/book-id-1234/cover.png',
  file_size: '1024000',
  page_count: 100,
  book_status: 'published',
  book_created_at: new Date('2024-01-01'),
  signed_book_id: 'signed-book-id-1234',
  recipient_name: '山田太郎',
  signed_book_status: 'completed',
  composed_at: new Date('2024-01-16'),
  sign_type: 'individual',
};

/** テスト用のDBクエリ結果行（サイン合成なし） */
const mockBookshelfRowNoSign = {
  ...mockBookshelfRow,
  book_id: 'book-id-5678',
  title: '未合成書籍',
  cover_image_key: null,
  signed_book_id: null,
  recipient_name: null,
  signed_book_status: null,
  composed_at: null,
  sign_type: null,
};

describe('FanService', () => {
  let fanService: FanService;

  beforeEach(() => {
    jest.clearAllMocks();
    fanService = new FanService();
  });

  describe('getBookshelf', () => {
    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】ファンIDに紐づく書籍が存在する場合
     * 【期待結果】
     * - 書籍一覧が正しく返される
     * - 表紙画像キーがある場合は署名付きURLが生成される
     * - サイン入り書籍情報が含まれる
     * - アクセス権情報が含まれる
     */
    it('should return bookshelf items for a fan with books', async () => {
      // Arrange: DBが書籍データを返す
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [mockBookshelfRow],
        rowCount: 1,
      });
      // ストレージが署名付きURLを返す
      mockStorageService.getSignedUrl = jest.fn().mockResolvedValue(
        'https://minio.example.com/covers/signed-url'
      );

      // Act
      const items = await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: 書籍一覧が正しく返される
      expect(items).toHaveLength(1);
      expect(items[0].book.id).toBe(TEST_BOOK_ID);
      expect(items[0].book.title).toBe('テスト書籍');
      expect(items[0].book.coverImageUrl).toBe('https://minio.example.com/covers/signed-url');
      expect(items[0].book.fileSize).toBe(1024000);

      // サイン入り書籍情報
      expect(items[0].signedBook).not.toBeNull();
      expect(items[0].signedBook!.id).toBe('signed-book-id-1234');
      expect(items[0].signedBook!.signType).toBe('individual');
      expect(items[0].signedBook!.recipientName).toBe('山田太郎');
      expect(items[0].signedBook!.status).toBe('completed');

      // アクセス権情報
      expect(items[0].access.id).toBe('access-id-1234');
      expect(items[0].access.grantedBy).toBe('api');
    });

    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】書籍がない場合（DBが空の結果を返す）
     * 【期待結果】空配列が返される
     */
    it('should return empty array when fan has no books', async () => {
      // Arrange: DBが空の結果を返す
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      // Act
      const items = await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: 空配列が返される
      expect(items).toHaveLength(0);
      expect(items).toEqual([]);
    });

    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】サイン合成なしの書籍がある場合
     * 【期待結果】signedBookがnullで返される
     */
    it('should return null signedBook when no sign composition', async () => {
      // Arrange
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [mockBookshelfRowNoSign],
        rowCount: 1,
      });

      // Act
      const items = await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: signedBookがnull
      expect(items).toHaveLength(1);
      expect(items[0].signedBook).toBeNull();
      expect(items[0].book.coverImageUrl).toBeNull(); // 表紙なし
    });

    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】複数の書籍がある場合
     * 【期待結果】すべての書籍が返される
     */
    it('should return multiple books when fan has several books', async () => {
      // Arrange
      const anotherRow = {
        ...mockBookshelfRow,
        access_id: 'access-id-5678',
        book_id: 'book-id-5678',
        title: '2冊目の書籍',
        cover_image_key: null,
      };
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [mockBookshelfRow, anotherRow],
        rowCount: 2,
      });
      mockStorageService.getSignedUrl = jest.fn().mockResolvedValue(
        'https://minio.example.com/covers/signed-url'
      );

      // Act
      const items = await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: 2件返される
      expect(items).toHaveLength(2);
      expect(items[0].book.id).toBe(TEST_BOOK_ID);
      expect(items[1].book.id).toBe('book-id-5678');
    });

    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】署名付きURL生成が失敗した場合
     * 【期待結果】エラーにならず、coverImageUrlがnullで返される
     */
    it('should return null coverImageUrl when signed URL generation fails', async () => {
      // Arrange
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [mockBookshelfRow],
        rowCount: 1,
      });
      // 署名付きURL生成が失敗する
      mockStorageService.getSignedUrl = jest.fn().mockRejectedValue(
        new Error('S3 connection error')
      );

      // Act: エラーはスローされない（部分的な失敗を許容）
      const items = await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: 書籍は返されるが表紙URLはnull
      expect(items).toHaveLength(1);
      expect(items[0].book.coverImageUrl).toBeNull();
    });

    /**
     * 【テスト対象】FanService.getBookshelf
     * 【テスト内容】クエリにファンIDが正しく使われているか
     * 【期待結果】DBクエリがfanIdで呼ばれる
     */
    it('should query database with correct fanId', async () => {
      // Arrange
      mockDb.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await fanService.getBookshelf(TEST_FAN_ID);

      // Assert: DBクエリが正しいfanIdで呼ばれた
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ba.fan_id = $1'),
        [TEST_FAN_ID]
      );
    });
  });

  describe('getBookReadUrl', () => {
    /**
     * 【テスト対象】FanService.getBookReadUrl
     * 【テスト内容】ファンが所有する書籍（サイン合成済み）のURLを取得する場合
     * 【期待結果】署名付きURLと有効期限が返される
     */
    it('should return signed URL for owned book with signed file', async () => {
      // Arrange
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'access-id-1234',
          file_key: 'books/uuid-1234/test.pdf',
          signed_file_key: 'signed/uuid-1234/test-signed.pdf',
        }],
        rowCount: 1,
      });
      mockStorageService.getSignedUrl = jest.fn().mockResolvedValue(
        'https://minio.example.com/signed/presigned-url'
      );

      // Act
      const result = await fanService.getBookReadUrl(TEST_FAN_ID, TEST_BOOK_ID);

      // Assert
      expect(result.url).toBe('https://minio.example.com/signed/presigned-url');
      expect(result.expiresAt).toBeInstanceOf(Date);
      // 署名付きURLは合成済みファイルキーで生成される
      expect(mockStorageService.getSignedUrl).toHaveBeenCalledWith(
        'signed/uuid-1234/test-signed.pdf',
        900
      );
    });

    /**
     * 【テスト対象】FanService.getBookReadUrl
     * 【テスト内容】ファンが所有する書籍（未合成）のURLを取得する場合
     * 【期待結果】元書籍ファイルの署名付きURLが返される
     */
    it('should return signed URL using original file key when no signed file', async () => {
      // Arrange: signed_file_keyがnull（未合成）
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'access-id-1234',
          file_key: 'books/uuid-1234/test.pdf',
          signed_file_key: null,
        }],
        rowCount: 1,
      });
      mockStorageService.getSignedUrl = jest.fn().mockResolvedValue(
        'https://minio.example.com/books/presigned-url'
      );

      // Act
      const result = await fanService.getBookReadUrl(TEST_FAN_ID, TEST_BOOK_ID);

      // Assert: 元書籍ファイルキーで署名付きURLが生成される
      expect(result.url).toBe('https://minio.example.com/books/presigned-url');
      expect(mockStorageService.getSignedUrl).toHaveBeenCalledWith(
        'books/uuid-1234/test.pdf',
        900
      );
    });

    /**
     * 【テスト対象】FanService.getBookReadUrl
     * 【テスト内容】ファンが所有していない書籍にアクセスしようとした場合
     * 【期待結果】ForbiddenErrorがスローされる
     */
    it('should throw ForbiddenError when fan does not own the book', async () => {
      // Arrange: DBがアクセス権なし（空の結果）
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      // Act & Assert: ForbiddenErrorがスローされる
      await expect(
        fanService.getBookReadUrl(TEST_FAN_ID, 'other-book-id')
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    /**
     * 【テスト対象】FanService.getBookReadUrl
     * 【テスト内容】クエリにファンIDと書籍IDが正しく使われているか
     * 【期待結果】DBクエリがfanIdとbookIdで呼ばれる
     */
    it('should query database with correct fanId and bookId', async () => {
      // Arrange
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'access-id-1234',
          file_key: 'books/uuid-1234/test.pdf',
          signed_file_key: null,
        }],
        rowCount: 1,
      });
      mockStorageService.getSignedUrl = jest.fn().mockResolvedValue('https://example.com/url');

      // Act
      await fanService.getBookReadUrl(TEST_FAN_ID, TEST_BOOK_ID);

      // Assert: DBクエリが正しい引数で呼ばれた
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        [TEST_FAN_ID, TEST_BOOK_ID]
      );
    });
  });
});
