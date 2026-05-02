/**
 * @file api-key.controller.test.ts
 * @description API Key管理コントローラーのユニットテスト
 *
 * テスト対象:
 * - listApiKeys: APIキー一覧取得
 * - createApiKey: APIキー発行
 * - getApiKey: APIキー詳細取得
 * - deactivateApiKey: APIキー無効化
 */

import { Request, Response, NextFunction } from 'express';
import {
  listApiKeys,
  createApiKey,
  getApiKey,
  deactivateApiKey,
} from '../../src/controllers/api-key.controller';
import { apiKeyService } from '../../src/services/api-key.service';
import { NotFoundError } from '../../src/utils/errors';

// api-key.serviceをモック
jest.mock('../../src/services/api-key.service', () => ({
  apiKeyService: {
    listApiKeys: jest.fn(),
    createApiKey: jest.fn(),
    getApiKey: jest.fn(),
    deactivateApiKey: jest.fn(),
  },
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

/** テスト用のAPIキーレコード */
const mockApiKeyRecord = {
  id: 'api-key-uuid-1234',
  name: 'Test API Key',
  description: 'Integration test key',
  permissions: ['book_access', 'sign_create'],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

/** Expressのモックリクエストを作成するヘルパー */
function createMockRequest(options?: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  user?: { userId: string; email: string; role: 'admin' | 'author' | 'fan' };
}): Partial<Request> {
  return {
    body: options?.body || {},
    params: options?.params || {},
    user: options?.user || { userId: 'admin-uuid', email: 'admin@example.com', role: 'admin' },
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

// ===== listApiKeys テスト =====

describe('listApiKeys', () => {
  /**
   * 【テスト対象】listApiKeys関数
   * 【テスト内容】APIキーが存在する場合の一覧取得
   * 【期待結果】200ステータスとAPIキー配列が返ること
   */
  it('should return 200 with list of API keys', async () => {
    const mockKeys = [mockApiKeyRecord];
    (apiKeyService.listApiKeys as jest.Mock).mockResolvedValue(mockKeys);

    const req = createMockRequest() as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await listApiKeys(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      apiKeys: mockKeys,
      count: 1,
    });
  });

  /**
   * 【テスト対象】listApiKeys関数
   * 【テスト内容】APIキーが存在しない場合の一覧取得
   * 【期待結果】200ステータスと空配列が返ること
   */
  it('should return 200 with empty list when no API keys exist', async () => {
    (apiKeyService.listApiKeys as jest.Mock).mockResolvedValue([]);

    const req = createMockRequest() as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await listApiKeys(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ apiKeys: [], count: 0 });
  });

  /**
   * 【テスト対象】listApiKeys関数
   * 【テスト内容】サービスがエラーをスローした場合
   * 【期待結果】next()にエラーが渡されること
   */
  it('should call next with error when service throws', async () => {
    (apiKeyService.listApiKeys as jest.Mock).mockRejectedValue(new Error('DB error'));

    const req = createMockRequest() as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await listApiKeys(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ===== createApiKey テスト =====

describe('createApiKey', () => {
  /**
   * 【テスト対象】createApiKey関数
   * 【テスト内容】有効なリクエストでAPIキーを発行する場合
   * 【期待結果】201ステータスとAPIキー情報（plainKey含む）が返ること
   */
  it('should return 201 with new API key including plainKey', async () => {
    const createResult = {
      apiKey: mockApiKeyRecord,
      plainKey: 'plain-text-api-key-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    };
    (apiKeyService.createApiKey as jest.Mock).mockResolvedValue(createResult);

    const req = createMockRequest({
      body: {
        name: 'Test API Key',
        description: 'Integration test key',
        permissions: ['book_access'],
      },
    }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await createApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: mockApiKeyRecord,
        plainKey: createResult.plainKey,
        message: expect.stringContaining('APIキーが発行されました'),
      })
    );
  });

  /**
   * 【テスト対象】createApiKey関数
   * 【テスト内容】バリデーションエラーが発生した場合
   * 【期待結果】ValidationError が next() に渡されること
   */
  it('should call next with ValidationError when validation fails', async () => {
    // バリデーション失敗をシミュレート
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockValidationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'キー名は必須です', type: 'field' }],
    } as any);

    const req = createMockRequest({ body: {} }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await createApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error.statusCode).toBe(400);
  });
});

// ===== getApiKey テスト =====

describe('getApiKey', () => {
  /**
   * 【テスト対象】getApiKey関数
   * 【テスト内容】存在するAPIキーIDを指定した場合
   * 【期待結果】200ステータスとAPIキー情報が返ること
   */
  it('should return 200 with API key details', async () => {
    (apiKeyService.getApiKey as jest.Mock).mockResolvedValue(mockApiKeyRecord);

    const req = createMockRequest({ params: { id: 'api-key-uuid-1234' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await getApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ apiKey: mockApiKeyRecord });
  });

  /**
   * 【テスト対象】getApiKey関数
   * 【テスト内容】存在しないAPIキーIDを指定した場合
   * 【期待結果】NotFoundError が next() に渡されること
   */
  it('should call next with NotFoundError when API key does not exist', async () => {
    (apiKeyService.getApiKey as jest.Mock).mockRejectedValue(
      new NotFoundError('APIキーが見つかりません')
    );

    const req = createMockRequest({ params: { id: 'non-existent-uuid' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await getApiKey(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });
});

// ===== deactivateApiKey テスト =====

describe('deactivateApiKey', () => {
  /**
   * 【テスト対象】deactivateApiKey関数
   * 【テスト内容】存在するAPIキーを無効化する場合
   * 【期待結果】200ステータスと無効化後のAPIキー情報が返ること
   */
  it('should return 200 with deactivated API key', async () => {
    const deactivatedKey = { ...mockApiKeyRecord, isActive: false };
    (apiKeyService.deactivateApiKey as jest.Mock).mockResolvedValue(deactivatedKey);

    const req = createMockRequest({ params: { id: 'api-key-uuid-1234' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await deactivateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: deactivatedKey,
        message: 'APIキーを無効化しました',
      })
    );
  });

  /**
   * 【テスト対象】deactivateApiKey関数
   * 【テスト内容】存在しないAPIキーIDを指定した場合
   * 【期待結果】NotFoundError が next() に渡されること
   */
  it('should call next with NotFoundError when API key does not exist', async () => {
    (apiKeyService.deactivateApiKey as jest.Mock).mockRejectedValue(
      new NotFoundError('APIキーが見つかりません')
    );

    const req = createMockRequest({ params: { id: 'non-existent-uuid' } }) as Request;
    const res = createMockResponse() as unknown as Response;
    const next = createMockNext() as NextFunction;

    await deactivateApiKey(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(404);
  });
});
