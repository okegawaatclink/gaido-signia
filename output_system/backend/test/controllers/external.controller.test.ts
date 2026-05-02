/**
 * @file external.controller.test.ts
 * @description 外部連携APIコントローラーのユニットテスト
 *
 * テスト対象:
 * - grantBookAccess: 書籍アクセス権付与
 * - deleteBookAccess: アクセス権削除
 * - listBookAccess: アクセス権一覧取得
 * - createExternalSign: サインデータ登録
 * - getExternalSign: サインデータ取得
 */

import { Request, Response, NextFunction } from 'express';
import {
  grantBookAccess,
  deleteBookAccess,
  listBookAccess,
  createExternalSign,
  getExternalSign,
} from '../../src/controllers/external.controller';
import { externalService } from '../../src/services/external.service';
import { NotFoundError } from '../../src/utils/errors';

// external.serviceをモック
jest.mock('../../src/services/external.service', () => ({
  externalService: {
    grantBookAccess: jest.fn(),
    deleteBookAccess: jest.fn(),
    listBookAccess: jest.fn(),
    createExternalSign: jest.fn(),
    getExternalSign: jest.fn(),
  },
}));

// audit.middlewareをモック（DB接続不要）
jest.mock('../../src/middleware/audit.middleware', () => ({
  recordAuditLog: jest.fn().mockResolvedValue(undefined),
  getClientIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
}));

// express-validatorのresult関数をモック
jest.mock('express-validator', () => ({
  validationResult: jest.fn().mockReturnValue({
    isEmpty: () => true,
    array: () => [],
  }),
}));

import { validationResult } from 'express-validator';
const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

/** テスト用APIキー情報 */
const mockApiKey = {
  id: 'api-key-uuid-1234',
  name: 'Test API Key',
  permissions: ['book_access', 'sign_create'],
  isActive: true,
  expiresAt: null,
};

/** テスト用書籍アクセス権レコード */
const mockBookAccessRecord = {
  id: 'access-uuid-1234',
  bookId: 'book-uuid-1234',
  fanId: 'fan-uuid-5678',
  signedBookId: null,
  grantedBy: 'api',
  externalReference: 'ORDER-001',
  grantedAt: new Date('2024-01-01T00:00:00Z'),
  expiresAt: null,
};

/** テスト用サインレコード */
const mockSignRecord = {
  id: 'sign-uuid-1234',
  authorId: 'author-uuid-5678',
  name: 'Test Sign',
  type: 'common',
  imageUrl: 'https://example.com/signs/sign.png',
  isDefault: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

/** Expressのモックリクエストを作成するヘルパー */
function createMockRequest(options?: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  apiKey?: typeof mockApiKey;
}): Partial<Request> {
  return {
    body: options?.body || {},
    params: options?.params || {},
    query: options?.query || {},
    apiKey: options?.apiKey ?? mockApiKey,
    headers: { 'user-agent': 'test-agent' },
    socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
  } as Partial<Request>;
}

/** Expressのモックレスポンスを作成するヘルパー */
function createMockResponse(): { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

/** nextのモック */
function createMockNext(): jest.Mock {
  return jest.fn();
}

beforeEach(() => {
  jest.clearAllMocks();
  // デフォルトでバリデーション成功を返す
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockValidationResult.mockReturnValue({
    isEmpty: () => true,
    array: () => [],
  } as any);
});

// ===== grantBookAccess テスト =====

describe('grantBookAccess', () => {
  /**
   * 【テスト対象】grantBookAccess関数
   * 【テスト内容】有効なリクエストで書籍アクセス権を付与する場合
   * 【期待結果】201ステータスとアクセス権レコードが返ること
   */
  it('should return 201 with book access record', async () => {
    (externalService.grantBookAccess as jest.Mock).mockResolvedValue(mockBookAccessRecord);

    const req = createMockRequest({
      body: {
        bookId: 'book-uuid-1234',
        fanEmail: 'fan@example.com',
        externalReference: 'ORDER-001',
      },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await grantBookAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockBookAccessRecord);
    expect(externalService.grantBookAccess).toHaveBeenCalledWith({
      bookId: 'book-uuid-1234',
      fanEmail: 'fan@example.com',
      externalReference: 'ORDER-001',
    });
  });

  /**
   * 【テスト対象】grantBookAccess関数
   * 【テスト内容】書籍が存在しない場合
   * 【期待結果】NotFoundError が next() に渡されること
   */
  it('should call next with error when book is not found', async () => {
    (externalService.grantBookAccess as jest.Mock).mockRejectedValue(
      new NotFoundError('書籍が見つかりません')
    );

    const req = createMockRequest({
      body: { bookId: 'non-existent-uuid', fanEmail: 'fan@example.com' },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await grantBookAccess(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });

  /**
   * 【テスト対象】grantBookAccess関数
   * 【テスト内容】バリデーションエラーが発生した場合
   * 【期待結果】ValidationError が next() に渡されること
   */
  it('should call next with ValidationError when validation fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockValidationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'bookId は必須です', type: 'field' }],
    } as any);

    const req = createMockRequest({ body: {} }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await grantBookAccess(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
  });
});

// ===== deleteBookAccess テスト =====

describe('deleteBookAccess', () => {
  /**
   * 【テスト対象】deleteBookAccess関数
   * 【テスト内容】存在するアクセス権IDを指定した場合
   * 【期待結果】200ステータスと完了メッセージが返ること
   */
  it('should return 200 with success message', async () => {
    (externalService.deleteBookAccess as jest.Mock).mockResolvedValue(undefined);

    const req = createMockRequest({ params: { id: 'access-uuid-1234' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await deleteBookAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: '書籍アクセス権を削除しました' });
  });

  /**
   * 【テスト対象】deleteBookAccess関数
   * 【テスト内容】存在しないアクセス権IDを指定した場合
   * 【期待結果】404エラーが next() に渡されること
   */
  it('should call next with 404 error when access is not found', async () => {
    (externalService.deleteBookAccess as jest.Mock).mockRejectedValue(
      new NotFoundError('アクセス権が見つかりません')
    );

    const req = createMockRequest({ params: { id: 'non-existent-uuid' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await deleteBookAccess(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });
});

// ===== listBookAccess テスト =====

describe('listBookAccess', () => {
  /**
   * 【テスト対象】listBookAccess関数
   * 【テスト内容】フィルタなしでアクセス権一覧を取得する場合
   * 【期待結果】200ステータスとアクセス権配列が返ること
   */
  it('should return 200 with list of book access records', async () => {
    const mockList = [mockBookAccessRecord];
    (externalService.listBookAccess as jest.Mock).mockResolvedValue(mockList);

    const req = createMockRequest() as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await listBookAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      bookAccess: mockList,
      count: 1,
    });
  });

  /**
   * 【テスト対象】listBookAccess関数
   * 【テスト内容】bookIdでフィルタした場合
   * 【期待結果】サービスに正しいフィルタが渡されること
   */
  it('should pass filters to service when query params are provided', async () => {
    (externalService.listBookAccess as jest.Mock).mockResolvedValue([]);

    const req = createMockRequest({
      query: { bookId: 'book-uuid-1234', externalReference: 'ORDER-001' },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await listBookAccess(req, res, next);

    expect(externalService.listBookAccess).toHaveBeenCalledWith({
      bookId: 'book-uuid-1234',
      fanId: undefined,
      externalReference: 'ORDER-001',
    });
  });
});

// ===== createExternalSign テスト =====

describe('createExternalSign', () => {
  /**
   * 【テスト対象】createExternalSign関数
   * 【テスト内容】有効なBase64PNG画像でサインを登録する場合
   * 【期待結果】201ステータスとサインレコードが返ること
   */
  it('should return 201 with sign record', async () => {
    (externalService.createExternalSign as jest.Mock).mockResolvedValue(mockSignRecord);

    const req = createMockRequest({
      body: {
        authorId: 'author-uuid-5678',
        name: 'Test Sign',
        type: 'common',
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await createExternalSign(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockSignRecord);
  });

  /**
   * 【テスト対象】createExternalSign関数
   * 【テスト内容】著者が存在しない場合
   * 【期待結果】404エラーが next() に渡されること
   */
  it('should call next with 404 error when author is not found', async () => {
    (externalService.createExternalSign as jest.Mock).mockRejectedValue(
      new NotFoundError('著者が見つかりません')
    );

    const req = createMockRequest({
      body: {
        authorId: 'non-existent-uuid',
        name: 'Test Sign',
        type: 'common',
        imageBase64: 'dGVzdA==',
      },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await createExternalSign(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });
});

// ===== getExternalSign テスト =====

describe('getExternalSign', () => {
  /**
   * 【テスト対象】getExternalSign関数
   * 【テスト内容】存在するサインIDを指定した場合
   * 【期待結果】200ステータスとサインレコードが返ること
   */
  it('should return 200 with sign record', async () => {
    (externalService.getExternalSign as jest.Mock).mockResolvedValue(mockSignRecord);

    const req = createMockRequest({ params: { id: 'sign-uuid-1234' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await getExternalSign(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockSignRecord);
  });

  /**
   * 【テスト対象】getExternalSign関数
   * 【テスト内容】存在しないサインIDを指定した場合
   * 【期待結果】404エラーが next() に渡されること
   */
  it('should call next with 404 error when sign is not found', async () => {
    (externalService.getExternalSign as jest.Mock).mockRejectedValue(
      new NotFoundError('サインが見つかりません')
    );

    const req = createMockRequest({ params: { id: 'non-existent-uuid' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await getExternalSign(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });
});
