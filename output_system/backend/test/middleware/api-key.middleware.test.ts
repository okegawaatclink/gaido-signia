/**
 * @file api-key.middleware.test.ts
 * @description API Key認証ミドルウェアのユニットテスト
 *
 * テスト対象:
 * - authenticateApiKey: API Key認証ミドルウェア
 * - hashApiKey: API KeyのSHA-256ハッシュ化関数
 */

import { Request, Response, NextFunction } from 'express';
import { authenticateApiKey, hashApiKey } from '../../src/middleware/api-key.middleware';
import { UnauthorizedError } from '../../src/utils/errors';

// データベースをモック
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
  },
}));

import { db } from '../../src/config/database';
const mockDb = db as jest.Mocked<typeof db>;

/** Expressのモックリクエストを作成するヘルパー */
function createMockRequest(apiKey?: string): Partial<Request> {
  return {
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
  } as Partial<Request>;
}

/** Expressのモックレスポンスを作成するヘルパー */
function createMockResponse(): Partial<Response> {
  return {};
}

/** nextのモック */
function createMockNext(): jest.Mock {
  return jest.fn();
}

// テスト用APIキー
const TEST_API_KEY = 'test-api-key-1234567890abcdef';
const TEST_KEY_HASH = hashApiKey(TEST_API_KEY);

beforeEach(() => {
  jest.clearAllMocks();
});

// ===== hashApiKey 関数テスト =====

describe('hashApiKey', () => {
  /**
   * 【テスト対象】hashApiKey関数
   * 【テスト内容】同じAPIキーを入力した場合
   * 【期待結果】常に同じハッシュ値を返すこと（決定性）
   */
  it('should return the same hash for the same input', () => {
    const hash1 = hashApiKey('my-api-key');
    const hash2 = hashApiKey('my-api-key');
    expect(hash1).toBe(hash2);
  });

  /**
   * 【テスト対象】hashApiKey関数
   * 【テスト内容】異なるAPIキーを入力した場合
   * 【期待結果】異なるハッシュ値を返すこと
   */
  it('should return different hashes for different inputs', () => {
    const hash1 = hashApiKey('api-key-1');
    const hash2 = hashApiKey('api-key-2');
    expect(hash1).not.toBe(hash2);
  });

  /**
   * 【テスト対象】hashApiKey関数
   * 【テスト内容】SHA-256ハッシュの形式チェック
   * 【期待結果】64文字の16進文字列を返すこと
   */
  it('should return a 64-character hex string (SHA-256)', () => {
    const hash = hashApiKey('test-key');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ===== authenticateApiKey ミドルウェア テスト =====

describe('authenticateApiKey middleware', () => {
  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】有効なAPIキーをX-API-Keyヘッダーに含めた場合
   * 【期待結果】req.apiKeyにキー情報がセットされ、next()が呼ばれること
   */
  it('should authenticate with a valid API key and call next()', async () => {
    // モックDBが有効なキーレコードを返す
    (mockDb.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT') && sql.includes('api_keys')) {
        return Promise.resolve({
          rows: [
            {
              id: 'key-uuid-1234',
              name: 'Test Key',
              permissions: ['book_access', 'sign_create'],
              is_active: true,
              expires_at: null,
            },
          ],
        });
      }
      // last_used_at更新のクエリ
      return Promise.resolve({ rows: [] });
    });

    const req = createMockRequest(TEST_API_KEY) as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    // next()が引数なしで呼ばれること（エラーなし）
    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);

    // req.apiKeyに正しい情報がセットされること
    expect(req.apiKey).toBeDefined();
    expect(req.apiKey?.id).toBe('key-uuid-1234');
    expect(req.apiKey?.name).toBe('Test Key');
    expect(req.apiKey?.permissions).toEqual(['book_access', 'sign_create']);
    expect(req.apiKey?.isActive).toBe(true);
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】X-API-Keyヘッダーが含まれていない場合
   * 【期待結果】UnauthorizedError が next() に渡されること
   */
  it('should call next with UnauthorizedError when X-API-Key header is missing', async () => {
    const req = createMockRequest() as Request; // ヘッダーなし
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    // next()が呼ばれ、渡されたエラーが401であることを確認
    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】存在しないAPIキーが提供された場合
   * 【期待結果】401エラーが next() に渡されること（情報漏洩防止）
   */
  it('should call next with 401 error when API key is not found', async () => {
    // DBがレコードを返さない
    (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

    const req = createMockRequest('invalid-api-key') as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】無効化された（is_active = false）APIキーが提供された場合
   * 【期待結果】401エラーが next() に渡されること
   */
  it('should call next with 401 error when API key is inactive', async () => {
    (mockDb.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          id: 'key-uuid-inactive',
          name: 'Inactive Key',
          permissions: [],
          is_active: false, // 無効化済み
          expires_at: null,
        },
      ],
    });

    const req = createMockRequest(TEST_API_KEY) as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】有効期限が切れたAPIキーが提供された場合
   * 【期待結果】401エラーが next() に渡されること
   */
  it('should call next with 401 error when API key is expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 昨日

    (mockDb.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          id: 'key-uuid-expired',
          name: 'Expired Key',
          permissions: [],
          is_active: true,
          expires_at: pastDate, // 期限切れ
        },
      ],
    });

    const req = createMockRequest(TEST_API_KEY) as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    const error = (next as jest.Mock).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】有効期限が未来のAPIキーが提供された場合
   * 【期待結果】認証が成功し、next()が引数なしで呼ばれること
   */
  it('should authenticate successfully when API key has a future expiry date', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 明日

    (mockDb.query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT')) {
        return Promise.resolve({
          rows: [
            {
              id: 'key-uuid-future',
              name: 'Future Key',
              permissions: [],
              is_active: true,
              expires_at: futureDate,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = createMockRequest(TEST_API_KEY) as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.apiKey?.id).toBe('key-uuid-future');
  });

  /**
   * 【テスト対象】authenticateApiKey関数
   * 【テスト内容】DBクエリが失敗した場合
   * 【期待結果】エラーが next() に渡されること
   */
  it('should call next with error when database query fails', async () => {
    (mockDb.query as jest.Mock).mockRejectedValue(new Error('DB connection error'));

    const req = createMockRequest(TEST_API_KEY) as Request;
    const res = createMockResponse() as Response;
    const next = createMockNext() as NextFunction;

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
