/**
 * @file admin.controller.test.ts
 * @description 管理者コントローラーのユニットテスト
 *
 * テスト対象:
 * - getAuthors: GET /api/admin/authors 著者一覧取得
 * - createAuthor: POST /api/admin/authors 著者アカウント作成
 * - getAuthor: GET /api/admin/authors/:id 著者詳細取得
 * - updateAuthor: PUT /api/admin/authors/:id 著者情報更新
 * - deactivateAuthor: DELETE /api/admin/authors/:id 著者無効化
 *
 * adminService をモック化して HTTP リクエスト処理のみをテストする
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// adminService をモック化してサービス依存を排除する
jest.mock('../../src/services/admin.service');

// DB への接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

// express-validator の validationResult をモック化
jest.mock('express-validator', () => ({
  ...jest.requireActual('express-validator'),
  validationResult: jest.fn(),
}));

import {
  getAuthors,
  createAuthor,
  getAuthor,
  updateAuthor,
  deactivateAuthor,
} from '../../src/controllers/admin.controller';
import { adminService } from '../../src/services/admin.service';
import { validationResult } from 'express-validator';
import { ConflictError, NotFoundError } from '../../src/utils/errors';
import { AuthorInfo, AuthorDetail } from '../../src/services/admin.service';

/**
 * モック用の Express リクエストオブジェクトを生成する
 *
 * @param overrides - 上書きするプロパティ
 */
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: {
      userId: 'admin-user-id-1234',
      email: 'admin@example.com',
      role: 'admin',
    },
    params: {},
    body: {},
    ...overrides,
  };
}

/**
 * モック用の Express レスポンスオブジェクトを生成する
 */
function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

/** テスト用著者データ */
const mockAuthor: AuthorInfo = {
  id: 'author-uuid-12345',
  email: 'author@example.com',
  name: 'テスト著者',
  role: 'author',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用著者詳細データ */
const mockAuthorDetail: AuthorDetail = {
  ...mockAuthor,
  books: [
    {
      id: 'book-uuid-12345',
      title: 'テスト書籍',
      status: 'published',
      format: 'pdf',
      createdAt: new Date('2024-01-01'),
    },
  ],
};

describe('admin.controller', () => {
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
    // バリデーションエラーなしのデフォルト設定
    (validationResult as unknown as jest.Mock).mockReturnValue({ isEmpty: () => true, array: () => [] });
  });

  // ===========================================================================
  // getAuthors テスト
  // ===========================================================================
  describe('getAuthors', () => {
    /**
     * 【テスト対象】getAuthors コントローラー
     * 【テスト内容】著者一覧を正常に取得できる場合
     * 【期待結果】200 ステータスと著者一覧が返る
     */
    it('should return 200 with authors list', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();
      (adminService.getAuthors as jest.Mock).mockResolvedValue([mockAuthor]);

      // Act
      await getAuthors(req as Request, res as Response, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        authors: [mockAuthor],
        count: 1,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】getAuthors コントローラー
     * 【テスト内容】サービスがエラーを throw した場合
     * 【期待結果】next にエラーが渡される
     */
    it('should call next with error when service throws', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();
      const error = new Error('DB error');
      (adminService.getAuthors as jest.Mock).mockRejectedValue(error);

      // Act
      await getAuthors(req as Request, res as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // ===========================================================================
  // createAuthor テスト
  // ===========================================================================
  describe('createAuthor', () => {
    /**
     * 【テスト対象】createAuthor コントローラー
     * 【テスト内容】有効なリクエストボディで著者を作成する場合
     * 【期待結果】201 ステータスと作成した著者情報が返る
     */
    it('should return 201 with created author', async () => {
      // Arrange
      const req = createMockRequest({
        body: {
          email: 'author@example.com',
          name: 'テスト著者',
          password: 'SecurePassword123',
        },
      });
      const res = createMockResponse();
      (adminService.createAuthor as jest.Mock).mockResolvedValue(mockAuthor);

      // Act
      await createAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ author: mockAuthor });
    });

    /**
     * 【テスト対象】createAuthor コントローラー
     * 【テスト内容】バリデーションエラーがある場合
     * 【期待結果】next に ValidationError が渡される
     */
    it('should call next with ValidationError when validation fails', async () => {
      // Arrange
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'メールアドレスは必須です' }],
      });

      // Act
      await createAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      const calledError = (mockNext as jest.Mock).mock.calls[0][0];
      expect(calledError.statusCode).toBe(400);
    });

    /**
     * 【テスト対象】createAuthor コントローラー
     * 【テスト内容】メールアドレスが既に使用されている場合（サービスが ConflictError を throw）
     * 【期待結果】next に ConflictError が渡される
     */
    it('should call next with ConflictError when email is taken', async () => {
      // Arrange
      const req = createMockRequest({
        body: {
          email: 'taken@example.com',
          name: 'テスト著者',
          password: 'SecurePassword123',
        },
      });
      const res = createMockResponse();
      const conflict = new ConflictError('このメールアドレスは既に使用されています');
      (adminService.createAuthor as jest.Mock).mockRejectedValue(conflict);

      // Act
      await createAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(conflict);
    });
  });

  // ===========================================================================
  // getAuthor テスト
  // ===========================================================================
  describe('getAuthor', () => {
    /**
     * 【テスト対象】getAuthor コントローラー
     * 【テスト内容】存在する著者 ID を指定した場合
     * 【期待結果】200 ステータスと著者詳細情報が返る
     */
    it('should return 200 with author detail', async () => {
      // Arrange
      const req = createMockRequest({ params: { id: 'author-uuid-12345' } });
      const res = createMockResponse();
      (adminService.getAuthorById as jest.Mock).mockResolvedValue(mockAuthorDetail);

      // Act
      await getAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ author: mockAuthorDetail });
    });

    /**
     * 【テスト対象】getAuthor コントローラー
     * 【テスト内容】存在しない著者 ID を指定した場合
     * 【期待結果】next に NotFoundError が渡される
     */
    it('should call next with NotFoundError when author not found', async () => {
      // Arrange
      const req = createMockRequest({ params: { id: 'non-existent-uuid' } });
      const res = createMockResponse();
      const notFound = new NotFoundError('著者が見つかりません');
      (adminService.getAuthorById as jest.Mock).mockRejectedValue(notFound);

      // Act
      await getAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(notFound);
    });
  });

  // ===========================================================================
  // updateAuthor テスト
  // ===========================================================================
  describe('updateAuthor', () => {
    /**
     * 【テスト対象】updateAuthor コントローラー
     * 【テスト内容】有効なリクエストで著者情報を更新する場合
     * 【期待結果】200 ステータスと更新後の著者情報が返る
     */
    it('should return 200 with updated author', async () => {
      // Arrange
      const updatedAuthor = { ...mockAuthor, name: '更新後の名前' };
      const req = createMockRequest({
        params: { id: 'author-uuid-12345' },
        body: { name: '更新後の名前' },
      });
      const res = createMockResponse();
      (adminService.updateAuthor as jest.Mock).mockResolvedValue(updatedAuthor);

      // Act
      await updateAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ author: updatedAuthor });
    });
  });

  // ===========================================================================
  // deactivateAuthor テスト
  // ===========================================================================
  describe('deactivateAuthor', () => {
    /**
     * 【テスト対象】deactivateAuthor コントローラー
     * 【テスト内容】有効な著者 ID を指定した場合
     * 【期待結果】200 ステータスと無効化後の著者情報が返る
     */
    it('should return 200 with deactivated author', async () => {
      // Arrange
      const deactivatedAuthor = { ...mockAuthor, isActive: false };
      const req = createMockRequest({ params: { id: 'author-uuid-12345' } });
      const res = createMockResponse();
      (adminService.deactivateAuthor as jest.Mock).mockResolvedValue(deactivatedAuthor);

      // Act
      await deactivateAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        author: deactivatedAuthor,
        message: '著者アカウントを無効化しました',
      });
    });

    /**
     * 【テスト対象】deactivateAuthor コントローラー
     * 【テスト内容】存在しない著者 ID を指定した場合
     * 【期待結果】next に NotFoundError が渡される
     */
    it('should call next with NotFoundError when author not found', async () => {
      // Arrange
      const req = createMockRequest({ params: { id: 'non-existent-uuid' } });
      const res = createMockResponse();
      const notFound = new NotFoundError('著者が見つかりません');
      (adminService.deactivateAuthor as jest.Mock).mockRejectedValue(notFound);

      // Act
      await deactivateAuthor(req as Request, res as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(notFound);
    });
  });
});
