/**
 * @file fan.controller.test.ts
 * @description ファンコントローラーのユニットテスト
 *
 * テスト対象:
 * - getBookshelf: GET /api/fan/bookshelf 本棚一覧取得
 * - getBookReadUrl: GET /api/fan/books/:id/read 書籍閲覧URL取得
 *
 * FanServiceをモック化してHTTPリクエスト処理のみをテストする
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// FanServiceをモック化してサービス依存を排除する
jest.mock('../../src/services/fan.service');

// DBへの接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

// express-validatorのvalidationResultをモック化
jest.mock('express-validator', () => ({
  ...jest.requireActual('express-validator'),
  validationResult: jest.fn(),
  param: jest.fn().mockReturnValue({ isUUID: jest.fn().mockReturnValue({ withMessage: jest.fn() }) }),
}));

import { getBookshelf, getBookReadUrl } from '../../src/controllers/fan.controller';
import { fanService } from '../../src/services/fan.service';
import { validationResult } from 'express-validator';
import { ForbiddenError } from '../../src/utils/errors';
import { BookshelfItem } from '../../src/services/fan.service';

/** モック型定義 */
const mockFanService = fanService as jest.Mocked<typeof fanService>;
const mockValidationResult = validationResult as unknown as jest.Mock;

/**
 * モック用のExpressリクエストオブジェクトを生成する
 *
 * @param overrides - 上書きするプロパティ
 */
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: {
      userId: 'fan-user-id-1234',
      email: 'fan@example.com',
      role: 'fan',
    },
    params: {},
    body: {},
    ...overrides,
  };
}

/**
 * モック用のExpressレスポンスオブジェクトを生成する
 */
function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

/** テスト用の本棚アイテムデータ */
const mockBookshelfItem: BookshelfItem = {
  book: {
    id: 'book-id-1234',
    title: 'テスト書籍',
    description: '書籍の説明',
    format: 'pdf',
    coverImageUrl: 'https://minio.example.com/covers/signed-url',
    fileSize: 1024000,
    pageCount: 100,
    status: 'published',
    createdAt: new Date('2024-01-01'),
  },
  signedBook: {
    id: 'signed-book-id-1234',
    signType: 'individual',
    recipientName: '山田太郎',
    status: 'completed',
    composedAt: new Date('2024-01-16'),
  },
  access: {
    id: 'access-id-1234',
    grantedBy: 'api',
    grantedAt: new Date('2024-01-15'),
  },
};

describe('Fan Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = createMockResponse();
    mockNext = jest.fn();
    // デフォルトではバリデーションエラーなし
    mockValidationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
  });

  describe('getBookshelf', () => {
    /**
     * 【テスト対象】getBookshelf
     * 【テスト内容】本棚に書籍がある場合
     * 【期待結果】200ステータスと書籍一覧が返される
     */
    it('should return 200 with bookshelf items when fan has books', async () => {
      // Arrange
      mockReq = createMockRequest();
      mockFanService.getBookshelf = jest.fn().mockResolvedValue([mockBookshelfItem]);

      // Act
      await getBookshelf(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        items: [mockBookshelfItem],
        count: 1,
      });
    });

    /**
     * 【テスト対象】getBookshelf
     * 【テスト内容】本棚が空の場合
     * 【期待結果】200ステータスと空配列が返される（404ではない）
     */
    it('should return 200 with empty array when fan has no books', async () => {
      // Arrange
      mockReq = createMockRequest();
      mockFanService.getBookshelf = jest.fn().mockResolvedValue([]);

      // Act
      await getBookshelf(mockReq as Request, mockRes as Response, mockNext);

      // Assert: 空でも200
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        items: [],
        count: 0,
      });
    });

    /**
     * 【テスト対象】getBookshelf
     * 【テスト内容】サービスがエラーをスローした場合
     * 【期待結果】next(error)が呼ばれる
     */
    it('should call next with error when service throws', async () => {
      // Arrange
      mockReq = createMockRequest();
      const serviceError = new Error('Database connection failed');
      mockFanService.getBookshelf = jest.fn().mockRejectedValue(serviceError);

      // Act
      await getBookshelf(mockReq as Request, mockRes as Response, mockNext);

      // Assert: エラーハンドラーに委譲される
      expect(mockNext).toHaveBeenCalledWith(serviceError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】getBookshelf
     * 【テスト内容】認証済みユーザーのfanIdがサービスに渡される
     * 【期待結果】req.user.userIdがfanService.getBookshelfに渡される
     */
    it('should pass authenticated user id to service', async () => {
      // Arrange
      mockReq = createMockRequest({
        user: { userId: 'specific-fan-id', email: 'fan@example.com', role: 'fan' },
      });
      mockFanService.getBookshelf = jest.fn().mockResolvedValue([]);

      // Act
      await getBookshelf(mockReq as Request, mockRes as Response, mockNext);

      // Assert: 正しいfanIdがサービスに渡された
      expect(mockFanService.getBookshelf).toHaveBeenCalledWith('specific-fan-id');
    });
  });

  describe('getBookReadUrl', () => {
    /**
     * 【テスト対象】getBookReadUrl
     * 【テスト内容】ファンが所有する書籍の閲覧URLを取得する場合
     * 【期待結果】200ステータスと署名付きURLが返される
     */
    it('should return 200 with signed URL for owned book', async () => {
      // Arrange
      const expiresAt = new Date(Date.now() + 900000);
      mockReq = createMockRequest({ params: { id: 'book-id-1234' } });
      mockFanService.getBookReadUrl = jest.fn().mockResolvedValue({
        url: 'https://minio.example.com/books/presigned-url',
        expiresAt,
      });

      // Act
      await getBookReadUrl(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        url: 'https://minio.example.com/books/presigned-url',
        expiresAt,
      });
    });

    /**
     * 【テスト対象】getBookReadUrl
     * 【テスト内容】ファンが所有していない書籍にアクセスした場合
     * 【期待結果】next(ForbiddenError)が呼ばれる
     */
    it('should call next with ForbiddenError when fan does not own the book', async () => {
      // Arrange
      mockReq = createMockRequest({ params: { id: 'other-book-id' } });
      const forbiddenError = new ForbiddenError('この書籍へのアクセス権限がありません');
      mockFanService.getBookReadUrl = jest.fn().mockRejectedValue(forbiddenError);

      // Act
      await getBookReadUrl(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(forbiddenError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】getBookReadUrl
     * 【テスト内容】バリデーションエラーがある場合（UUIDでないID）
     * 【期待結果】next(ValidationError)が呼ばれる
     */
    it('should call next with ValidationError when id is not UUID', async () => {
      // Arrange
      mockReq = createMockRequest({ params: { id: 'not-a-uuid' } });
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: '書籍IDはUUID形式で指定してください' }],
      });

      // Act
      await getBookReadUrl(mockReq as Request, mockRes as Response, mockNext);

      // Assert: ValidationErrorがnextに渡される
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
      expect(mockFanService.getBookReadUrl).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】getBookReadUrl
     * 【テスト内容】認証済みユーザーのfanIdと書籍IDがサービスに渡される
     * 【期待結果】正しい引数でfanService.getBookReadUrlが呼ばれる
     */
    it('should pass fanId and bookId to service', async () => {
      // Arrange
      const expiresAt = new Date(Date.now() + 900000);
      mockReq = createMockRequest({
        params: { id: 'book-id-5678' },
        user: { userId: 'fan-id-9999', email: 'fan@example.com', role: 'fan' },
      });
      mockFanService.getBookReadUrl = jest.fn().mockResolvedValue({
        url: 'https://example.com/url',
        expiresAt,
      });

      // Act
      await getBookReadUrl(mockReq as Request, mockRes as Response, mockNext);

      // Assert: 正しい引数でサービスが呼ばれた
      expect(mockFanService.getBookReadUrl).toHaveBeenCalledWith('fan-id-9999', 'book-id-5678');
    });
  });
});
