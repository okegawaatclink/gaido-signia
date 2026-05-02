/**
 * @file admin.service.test.ts
 * @description 管理者サービスのユニットテスト
 *
 * テスト対象:
 * - adminService.createAuthor: 著者アカウント作成
 * - adminService.getAuthors: 著者一覧取得
 * - adminService.getAuthorById: 著者詳細取得
 * - adminService.updateAuthor: 著者情報更新
 * - adminService.deactivateAuthor: 著者アカウント無効化
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

// crypto モジュールのハッシュ化をモック（テストで実際の bcrypt を実行しない）
jest.mock('../../src/utils/crypto', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2a$12$mocked_hash_for_testing'),
  verifyPassword: jest.fn().mockResolvedValue(true),
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
  verifyToken: jest.fn(),
}));

import { adminService } from '../../src/services/admin.service';
import { db } from '../../src/config/database';
import { ConflictError, NotFoundError } from '../../src/utils/errors';

// DB クエリのモック型（テスト内で型安全に使用するため）
const mockDbQuery = db.query as jest.Mock;

/** テスト用著者データ */
const mockAuthorRow = {
  id: 'author-uuid-12345',
  email: 'author@example.com',
  name: 'テスト著者',
  role: 'author',
  is_active: true,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

/** テスト用書籍データ */
const mockBookRow = {
  id: 'book-uuid-12345',
  title: 'テスト書籍',
  status: 'published',
  format: 'pdf',
  created_at: new Date('2024-01-01'),
};

describe('adminService', () => {
  beforeEach(() => {
    // 各テスト前にモックをリセット
    jest.clearAllMocks();
  });

  // ===========================================================================
  // createAuthor テスト
  // ===========================================================================
  describe('createAuthor', () => {
    /**
     * 【テスト対象】adminService.createAuthor
     * 【テスト内容】有効なパラメータで著者アカウントを作成する
     * 【期待結果】著者情報が返る（パスワードハッシュなし）
     */
    it('should create an author account with valid params', async () => {
      // Arrange: メール重複なし → INSERT 成功
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // メール重複チェック
        .mockResolvedValueOnce({ rows: [mockAuthorRow] }); // INSERT RETURNING

      // Act
      const result = await adminService.createAuthor({
        email: 'author@example.com',
        name: 'テスト著者',
        password: 'SecurePassword123',
      });

      // Assert
      expect(result.id).toBe('author-uuid-12345');
      expect(result.email).toBe('author@example.com');
      expect(result.name).toBe('テスト著者');
      expect(result.role).toBe('author');
      expect(result.isActive).toBe(true);
      // パスワードハッシュが含まれていないことを確認（型の安全な確認方法）
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    /**
     * 【テスト対象】adminService.createAuthor
     * 【テスト内容】メールアドレスが既に使用されている場合
     * 【期待結果】ConflictError が throw される
     */
    it('should throw ConflictError when email is already in use', async () => {
      // Arrange: メール重複あり
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      // Act & Assert
      await expect(
        adminService.createAuthor({
          email: 'existing@example.com',
          name: '既存著者',
          password: 'SecurePassword123',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ===========================================================================
  // getAuthors テスト
  // ===========================================================================
  describe('getAuthors', () => {
    /**
     * 【テスト対象】adminService.getAuthors
     * 【テスト内容】著者が存在する場合
     * 【期待結果】著者一覧が返る
     */
    it('should return list of authors', async () => {
      // Arrange
      mockDbQuery.mockResolvedValueOnce({
        rows: [mockAuthorRow, { ...mockAuthorRow, id: 'author-uuid-67890', name: '著者B' }],
      });

      // Act
      const result = await adminService.getAuthors();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('author-uuid-12345');
      expect(result[1].id).toBe('author-uuid-67890');
    });

    /**
     * 【テスト対象】adminService.getAuthors
     * 【テスト内容】著者が存在しない場合
     * 【期待結果】空配列が返る
     */
    it('should return empty array when no authors exist', async () => {
      // Arrange
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      // Act
      const result = await adminService.getAuthors();

      // Assert
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ===========================================================================
  // getAuthorById テスト
  // ===========================================================================
  describe('getAuthorById', () => {
    /**
     * 【テスト対象】adminService.getAuthorById
     * 【テスト内容】存在する著者 ID を指定した場合
     * 【期待結果】著者詳細情報（登録書籍一覧含む）が返る
     */
    it('should return author detail with books', async () => {
      // Arrange: 著者情報 → 書籍一覧
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] })
        .mockResolvedValueOnce({ rows: [mockBookRow] });

      // Act
      const result = await adminService.getAuthorById('author-uuid-12345');

      // Assert
      expect(result.id).toBe('author-uuid-12345');
      expect(result.books).toHaveLength(1);
      expect(result.books[0].id).toBe('book-uuid-12345');
      expect(result.books[0].title).toBe('テスト書籍');
    });

    /**
     * 【テスト対象】adminService.getAuthorById
     * 【テスト内容】書籍がない著者を取得する場合
     * 【期待結果】著者情報は返り、books は空配列
     */
    it('should return author with empty books array when no books registered', async () => {
      // Arrange
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      const result = await adminService.getAuthorById('author-uuid-12345');

      // Assert
      expect(result.id).toBe('author-uuid-12345');
      expect(result.books).toHaveLength(0);
    });

    /**
     * 【テスト対象】adminService.getAuthorById
     * 【テスト内容】存在しない著者 ID を指定した場合
     * 【期待結果】NotFoundError が throw される
     */
    it('should throw NotFoundError when author does not exist', async () => {
      // Arrange: 著者が見つからない
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      // Act & Assert
      await expect(adminService.getAuthorById('non-existent-uuid')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ===========================================================================
  // updateAuthor テスト
  // ===========================================================================
  describe('updateAuthor', () => {
    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】名前を更新する場合
     * 【期待結果】更新後の著者情報が返る
     */
    it('should update author name', async () => {
      // Arrange: 著者存在確認 → UPDATE RETURNING
      const updatedRow = { ...mockAuthorRow, name: '新しい名前' };
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] }) // 存在確認
        .mockResolvedValueOnce({ rows: [updatedRow] }); // UPDATE RETURNING

      // Act
      const result = await adminService.updateAuthor('author-uuid-12345', { name: '新しい名前' });

      // Assert
      expect(result.name).toBe('新しい名前');
    });

    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】メールアドレスを重複しない値に変更する場合
     * 【期待結果】更新後の著者情報が返る
     */
    it('should update author email to a unique address', async () => {
      // Arrange: 著者存在確認 → メール重複なし → UPDATE RETURNING
      const updatedRow = { ...mockAuthorRow, email: 'new@example.com' };
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] }) // 存在確認
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // メール重複チェック
        .mockResolvedValueOnce({ rows: [updatedRow] }); // UPDATE RETURNING

      // Act
      const result = await adminService.updateAuthor('author-uuid-12345', {
        email: 'new@example.com',
      });

      // Assert
      expect(result.email).toBe('new@example.com');
    });

    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】変更後のメールアドレスが既に使用されている場合
     * 【期待結果】ConflictError が throw される
     */
    it('should throw ConflictError when new email is already in use', async () => {
      // Arrange: 著者存在確認 → メール重複あり
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] }) // 存在確認
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // メール重複チェック（重複あり）

      // Act & Assert
      await expect(
        adminService.updateAuthor('author-uuid-12345', { email: 'taken@example.com' })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】著者を無効化（isActive = false）に更新する場合
     * 【期待結果】更新後の著者情報が返り isActive が false になっている
     */
    it('should deactivate author by setting isActive to false', async () => {
      // Arrange
      const updatedRow = { ...mockAuthorRow, is_active: false };
      mockDbQuery
        .mockResolvedValueOnce({ rows: [mockAuthorRow] }) // 存在確認
        .mockResolvedValueOnce({ rows: [updatedRow] }); // UPDATE RETURNING

      // Act
      const result = await adminService.updateAuthor('author-uuid-12345', { isActive: false });

      // Assert
      expect(result.isActive).toBe(false);
    });

    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】存在しない著者 ID を指定した場合
     * 【期待結果】NotFoundError が throw される
     */
    it('should throw NotFoundError when author does not exist', async () => {
      // Arrange: 著者が見つからない
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      // Act & Assert
      await expect(
        adminService.updateAuthor('non-existent-uuid', { name: '新しい名前' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    /**
     * 【テスト対象】adminService.updateAuthor
     * 【テスト内容】更新するフィールドが指定されない場合
     * 【期待結果】現在の著者情報がそのまま返る（DB 更新なし）
     */
    it('should return existing data when no fields to update', async () => {
      // Arrange
      mockDbQuery.mockResolvedValueOnce({ rows: [mockAuthorRow] }); // 存在確認のみ

      // Act
      const result = await adminService.updateAuthor('author-uuid-12345', {});

      // Assert
      expect(result.id).toBe('author-uuid-12345');
      // DB への UPDATE が実行されていないことを確認
      expect(mockDbQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // deactivateAuthor テスト
  // ===========================================================================
  describe('deactivateAuthor', () => {
    /**
     * 【テスト対象】adminService.deactivateAuthor
     * 【テスト内容】有効な著者 ID を指定した場合
     * 【期待結果】著者が無効化され isActive = false の著者情報が返る
     */
    it('should deactivate an existing author', async () => {
      // Arrange
      const deactivatedRow = { ...mockAuthorRow, is_active: false };
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 'author-uuid-12345' }] }) // 存在確認
        .mockResolvedValueOnce({ rows: [deactivatedRow] }); // UPDATE RETURNING

      // Act
      const result = await adminService.deactivateAuthor('author-uuid-12345');

      // Assert
      expect(result.id).toBe('author-uuid-12345');
      expect(result.isActive).toBe(false);
    });

    /**
     * 【テスト対象】adminService.deactivateAuthor
     * 【テスト内容】存在しない著者 ID を指定した場合
     * 【期待結果】NotFoundError が throw される
     */
    it('should throw NotFoundError when author does not exist', async () => {
      // Arrange: 著者が見つからない
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      // Act & Assert
      await expect(adminService.deactivateAuthor('non-existent-uuid')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
