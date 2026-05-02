/**
 * @file auth.middleware.test.ts
 * @description JWT認証ミドルウェアのユニットテスト
 *
 * テスト対象:
 * - authenticate: 必須認証ミドルウェア
 * - optionalAuthenticate: 任意認証ミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { authenticate, optionalAuthenticate } from '../../src/middleware/auth.middleware';
import { generateToken, JwtUserPayload } from '../../src/utils/crypto';
import { UnauthorizedError } from '../../src/utils/errors';

/** テスト用JWTシークレット */
const TEST_JWT_SECRET = 'test-secret-key-for-auth-middleware-testing';

/** テスト用ユーザーペイロード */
const testPayload: JwtUserPayload = {
  userId: '123e4567-e89b-12d3-a456-426614174001',
  email: 'author@example.com',
  role: 'author',
};

/** Expressのモックリクエストを作成するヘルパー */
function createMockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
  } as Partial<Request>;
}

/** Expressのモックレスポンスを作成するヘルパー */
function createMockResponse(): Partial<Response> {
  return {};
}

/** nextのモック */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockNext(): jest.Mock {
  return jest.fn();
}

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  jest.clearAllMocks();
});

// ===== authenticate ミドルウェア テスト =====

describe('authenticate middleware', () => {
  /**
   * 【テスト対象】authenticate関数
   * 【テスト内容】有効なJWTトークンをAuthorizationヘッダーに含めた場合
   * 【期待結果】req.userにペイロードがセットされ、next()が呼ばれること
   */
  it('should set req.user and call next for valid token', () => {
    const token = generateToken(testPayload);
    const req = createMockRequest(`Bearer ${token}`);
    const res = createMockResponse();
    const next = createMockNext();

    authenticate(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user).toBeDefined();
    expect((req as Request).user?.userId).toBe(testPayload.userId);
    expect((req as Request).user?.role).toBe(testPayload.role);
  });

  /**
   * 【テスト対象】authenticate関数
   * 【テスト内容】Authorizationヘッダーがない場合
   * 【期待結果】UnauthorizedErrorでnextが呼ばれること
   */
  it('should call next with UnauthorizedError when no authorization header', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    authenticate(req as Request, res as Response, next);

    const errorArg = (next as jest.Mock).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as UnauthorizedError).statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticate関数
   * 【テスト内容】Bearer形式でない不正なヘッダーを渡した場合
   * 【期待結果】UnauthorizedErrorでnextが呼ばれること
   *
   * 【入力例】
   * - "Token abc123" (Bearer以外)
   * - "abc123" (プレフィックスなし)
   */
  it('should call next with UnauthorizedError for invalid authorization format', () => {
    const invalidHeaders = ['Token abc123', 'abc123', 'Basic dXNlcjpwYXNz'];

    for (const header of invalidHeaders) {
      const req = createMockRequest(header);
      const res = createMockResponse();
      const next = createMockNext();

      authenticate(req as Request, res as Response, next);

      const errorArg = (next as jest.Mock).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as UnauthorizedError).statusCode).toBe(401);
    }
  });

  /**
   * 【テスト対象】authenticate関数
   * 【テスト内容】期限切れのJWTトークンを渡した場合
   * 【期待結果】UnauthorizedErrorでnextが呼ばれること
   */
  it('should call next with UnauthorizedError for expired token', async () => {
    // jsonwebtokenで有効期限1秒のトークンを生成
    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.sign(
      { ...testPayload, iat: Math.floor(Date.now() / 1000) - 3600 },
      TEST_JWT_SECRET,
      { expiresIn: 1, algorithm: 'HS256' }
    );

    // 少し待ってトークンを期限切れにする
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const req = createMockRequest(`Bearer ${expiredToken}`);
    const res = createMockResponse();
    const next = createMockNext();

    authenticate(req as Request, res as Response, next);

    const errorArg = (next as jest.Mock).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as UnauthorizedError).statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticate関数
   * 【テスト内容】改ざんされたトークンを渡した場合
   * 【期待結果】UnauthorizedErrorでnextが呼ばれること
   */
  it('should call next with UnauthorizedError for tampered token', () => {
    const token = generateToken(testPayload);
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.invalidSignatureXXX`;
    const req = createMockRequest(`Bearer ${tamperedToken}`);
    const res = createMockResponse();
    const next = createMockNext();

    authenticate(req as Request, res as Response, next);

    const errorArg = (next as jest.Mock).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as UnauthorizedError).statusCode).toBe(401);
  });
});

// ===== optionalAuthenticate ミドルウェア テスト =====

describe('optionalAuthenticate middleware', () => {
  /**
   * 【テスト対象】optionalAuthenticate関数
   * 【テスト内容】有効なJWTトークンを渡した場合
   * 【期待結果】req.userがセットされ、エラーなしでnext()が呼ばれること
   */
  it('should set req.user for valid token', () => {
    const token = generateToken(testPayload);
    const req = createMockRequest(`Bearer ${token}`);
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuthenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user?.userId).toBe(testPayload.userId);
  });

  /**
   * 【テスト対象】optionalAuthenticate関数
   * 【テスト内容】Authorizationヘッダーがない場合
   * 【期待結果】req.userはundefinedのまま、エラーなしでnext()が呼ばれること
   */
  it('should call next without error when no authorization header', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuthenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user).toBeUndefined();
  });

  /**
   * 【テスト対象】optionalAuthenticate関数
   * 【テスト内容】無効なトークンを渡した場合
   * 【期待結果】エラーなしでnext()が呼ばれること（req.userはundefined）
   */
  it('should call next without error for invalid token', () => {
    const req = createMockRequest('Bearer invalid-token');
    const res = createMockResponse();
    const next = createMockNext();

    optionalAuthenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user).toBeUndefined();
  });
});
