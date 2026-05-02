/**
 * @file rbac.middleware.test.ts
 * @description RBACミドルウェアのユニットテスト
 *
 * テスト対象:
 * - requireRole: ロール検証ミドルウェア
 * - adminOnly: adminのみ許可
 * - authorOrAdmin: author/admin許可
 * - fanOnly: fanのみ許可
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { Request, Response } from 'express';
import { requireRole, adminOnly, authorOrAdmin, fanOnly } from '../../src/middleware/rbac.middleware';
import { AppError } from '../../src/utils/errors';
import { JwtUserPayload } from '../../src/utils/crypto';

/** ロールごとのテスト用ユーザー */
const adminUser: JwtUserPayload = {
  userId: 'admin-user-id',
  email: 'admin@example.com',
  role: 'admin',
};

const authorUser: JwtUserPayload = {
  userId: 'author-user-id',
  email: 'author@example.com',
  role: 'author',
};

const fanUser: JwtUserPayload = {
  userId: 'fan-user-id',
  email: 'fan@example.com',
  role: 'fan',
};

/** テスト用リクエスト作成ヘルパー */
function createMockRequest(user?: JwtUserPayload): Partial<Request> {
  return { user } as Partial<Request>;
}

function createMockResponse(): Partial<Response> {
  return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockNext(): jest.Mock<any> {
  return jest.fn();
}

afterEach(() => {
  jest.clearAllMocks();
});

// ===== requireRole テスト =====

describe('requireRole', () => {
  /**
   * 【テスト対象】requireRole関数
   * 【テスト内容】許可されたロールを持つユーザーでアクセスした場合
   * 【期待結果】エラーなしでnext()が呼ばれること
   */
  it('should call next without error for user with allowed role', () => {
    const middleware = requireRole('author');
    const req = createMockRequest(authorUser);
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  /**
   * 【テスト対象】requireRole関数
   * 【テスト内容】複数ロールを許可し、そのいずれかのロールを持つユーザーでアクセスした場合
   * 【期待結果】エラーなしでnext()が呼ばれること
   *
   * 【前提条件】
   * - requireRole('author', 'admin')で設定
   */
  it('should call next without error when user role is one of multiple allowed roles', () => {
    const middleware = requireRole('author', 'admin');

    // authorでアクセス
    const reqAuthor = createMockRequest(authorUser);
    const nextAuthor = createMockNext();
    middleware(reqAuthor as Request, createMockResponse() as Response, nextAuthor);
    expect(nextAuthor).toHaveBeenCalledWith();

    // adminでアクセス
    const reqAdmin = createMockRequest(adminUser);
    const nextAdmin = createMockNext();
    middleware(reqAdmin as Request, createMockResponse() as Response, nextAdmin);
    expect(nextAdmin).toHaveBeenCalledWith();
  });

  /**
   * 【テスト対象】requireRole関数
   * 【テスト内容】許可されていないロールを持つユーザーでアクセスした場合
   * 【期待結果】403 ForbiddenのAppErrorでnextが呼ばれること
   */
  it('should call next with 403 error for user with disallowed role', () => {
    const middleware = requireRole('admin');
    const req = createMockRequest(fanUser);
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.statusCode).toBe(403);
  });

  /**
   * 【テスト対象】requireRole関数
   * 【テスト内容】認証されていない（req.userが未設定）ユーザーでアクセスした場合
   * 【期待結果】401 UnauthorizedのAppErrorでnextが呼ばれること
   */
  it('should call next with 401 error for unauthenticated user', () => {
    const middleware = requireRole('author');
    const req = createMockRequest(undefined);
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.statusCode).toBe(401);
  });
});

// ===== 各ショートカットミドルウェア テスト =====

describe('adminOnly', () => {
  /**
   * 【テスト対象】adminOnly
   * 【テスト内容】admin, author, fanの各ロールでアクセスした場合
   * 【期待結果】adminのみnextが正常呼び出し、author/fanは403エラー
   */
  it('should allow admin and deny author and fan', () => {
    const users = [
      { user: adminUser, shouldPass: true },
      { user: authorUser, shouldPass: false },
      { user: fanUser, shouldPass: false },
    ];

    for (const { user, shouldPass } of users) {
      const req = createMockRequest(user);
      const res = createMockResponse();
      const next = createMockNext();

      adminOnly(req as Request, res as Response, next);

      if (shouldPass) {
        expect(next).toHaveBeenCalledWith();
      } else {
        const errorArg = (next as jest.Mock).mock.calls[0][0] as AppError;
        expect(errorArg).toBeInstanceOf(Error);
        expect(errorArg.statusCode).toBe(403);
      }
    }
  });
});

describe('authorOrAdmin', () => {
  /**
   * 【テスト対象】authorOrAdmin
   * 【テスト内容】admin, author, fanの各ロールでアクセスした場合
   * 【期待結果】admin/authorがnextを正常呼び出し、fanは403エラー
   */
  it('should allow admin and author but deny fan', () => {
    const users = [
      { user: adminUser, shouldPass: true },
      { user: authorUser, shouldPass: true },
      { user: fanUser, shouldPass: false },
    ];

    for (const { user, shouldPass } of users) {
      const req = createMockRequest(user);
      const res = createMockResponse();
      const next = createMockNext();

      authorOrAdmin(req as Request, res as Response, next);

      if (shouldPass) {
        expect(next).toHaveBeenCalledWith();
      } else {
        const errorArg = (next as jest.Mock).mock.calls[0][0] as AppError;
        expect(errorArg).toBeInstanceOf(Error);
        expect(errorArg.statusCode).toBe(403);
      }
    }
  });
});

describe('fanOnly', () => {
  /**
   * 【テスト対象】fanOnly
   * 【テスト内容】admin, author, fanの各ロールでアクセスした場合
   * 【期待結果】fanのみnextが正常呼び出し、admin/authorは403エラー
   */
  it('should allow fan and deny admin and author', () => {
    const users = [
      { user: adminUser, shouldPass: false },
      { user: authorUser, shouldPass: false },
      { user: fanUser, shouldPass: true },
    ];

    for (const { user, shouldPass } of users) {
      const req = createMockRequest(user);
      const res = createMockResponse();
      const next = createMockNext();

      fanOnly(req as Request, res as Response, next);

      if (shouldPass) {
        expect(next).toHaveBeenCalledWith();
      } else {
        const errorArg = (next as jest.Mock).mock.calls[0][0] as AppError;
        expect(errorArg).toBeInstanceOf(Error);
        expect(errorArg.statusCode).toBe(403);
      }
    }
  });
});
