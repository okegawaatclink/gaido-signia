/**
 * @file auth.service.test.ts
 * @description 認証サービスのユニットテスト
 *
 * テスト対象:
 * - AuthService.login: メール+パスワード認証
 * - AuthService.getMe: ユーザー情報取得
 *
 * DBモックについて:
 * jest.mock()を使ってuser.modelモジュールをモック化することでDB接続不要にする
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// DBへの接続が発生しないようにモデルモジュールをモック化する
jest.mock('../../src/models/user.model');
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

import { AuthService } from '../../src/services/auth.service';
import * as UserModelModule from '../../src/models/user.model';
import * as CryptoModule from '../../src/utils/crypto';
import { User } from '../../src/models/user.model';

/** テスト用JWTシークレット */
const TEST_JWT_SECRET = 'test-secret-for-auth-service';

/** テスト用ユーザーデータ（adminユーザー） */
const mockAdminUser: User = {
  id: 'admin-user-id-12345',
  email: 'admin@example.com',
  name: 'テスト管理者',
  role: 'admin',
  passwordHash: '$2a$12$test.hash.placeholder',
  oauthProvider: null,
  oauthProviderId: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用ユーザーデータ（authorユーザー） */
const mockAuthorUser: User = {
  id: 'author-user-id-12345',
  email: 'author@example.com',
  name: 'テスト著者',
  role: 'author',
  passwordHash: '$2a$12$test.hash.placeholder',
  oauthProvider: null,
  oauthProviderId: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** 無効化されたユーザー */
const mockDeactivatedUser: User = {
  ...mockAdminUser,
  id: 'deactivated-user-id',
  email: 'deactivated@example.com',
  isActive: false,
};

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  jest.restoreAllMocks();
});

describe('AuthService.login', () => {
  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】正しいメールアドレスとパスワードを渡した場合
   * 【期待結果】JWTトークンとユーザー情報が返ること、パスワードハッシュが含まれないこと
   */
  it('should return token and user without password hash for valid credentials', async () => {
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(mockAdminUser);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(true);

    const result = await AuthService.login('admin@example.com', 'correctPassword');

    expect(result.token).toBeTruthy();
    expect(result.user.id).toBe(mockAdminUser.id);
    expect(result.user.email).toBe(mockAdminUser.email);
    expect(result.user.role).toBe('admin');
    // パスワードハッシュがレスポンスに含まれていないことを確認
    expect((result.user as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】authorロールでログインした場合
   * 【期待結果】JWTトークンにauthorロールが含まれること
   */
  it('should include correct role in token for author user', async () => {
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(mockAuthorUser);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(true);

    const result = await AuthService.login('author@example.com', 'correctPassword');

    expect(result.user.role).toBe('author');
    // JWTをデコードしてロールを確認
    const decoded = CryptoModule.decodeToken(result.token);
    expect(decoded?.role).toBe('author');
  });

  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】存在しないメールアドレスを渡した場合
   * 【期待結果】UnauthorizedError（401）がthrowされること
   * 【注意】タイミング攻撃対策としてverifyPasswordが必ず1回呼ばれること
   */
  it('should throw 401 error for non-existent email', async () => {
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(null);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(false);

    await expect(AuthService.login('unknown@example.com', 'anyPassword')).rejects.toMatchObject({
      statusCode: 401,
    });
    // タイミング攻撃対策としてverifyPasswordが呼ばれていること（ダミーハッシュで）
    expect(CryptoModule.verifyPassword).toHaveBeenCalledTimes(1);
  });

  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】間違ったパスワードを渡した場合
   * 【期待結果】UnauthorizedError（401）がthrowされること
   */
  it('should throw 401 error for wrong password', async () => {
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(mockAdminUser);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(false);

    await expect(AuthService.login('admin@example.com', 'wrongPassword')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】無効化されたアカウントでログインしようとした場合
   * 【期待結果】UnauthorizedError（401）がthrowされること
   */
  it('should throw 401 error for deactivated account', async () => {
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(mockDeactivatedUser);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(true);

    await expect(
      AuthService.login('deactivated@example.com', 'correctPassword')
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  /**
   * 【テスト対象】AuthService.login
   * 【テスト内容】パスワードが設定されていないユーザー（OAuthユーザー）でパスワード認証を試みた場合
   * 【期待結果】UnauthorizedError（401）がthrowされること
   */
  it('should throw 401 error for OAuth-only user attempting password login', async () => {
    const oauthOnlyUser: User = {
      ...mockAdminUser,
      passwordHash: null,
      oauthProvider: 'google',
      oauthProviderId: 'google-id-12345',
    };
    (UserModelModule.findByEmail as jest.Mock).mockResolvedValue(oauthOnlyUser);
    jest.spyOn(CryptoModule, 'verifyPassword').mockResolvedValue(false);

    await expect(
      AuthService.login('oauth@example.com', 'anyPassword')
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('AuthService.getMe', () => {
  /**
   * 【テスト対象】AuthService.getMe
   * 【テスト内容】有効なユーザーIDを渡した場合
   * 【期待結果】ユーザー情報が返ること
   */
  it('should return user information for valid user ID', async () => {
    const userWithoutPassword = {
      id: mockAdminUser.id,
      email: mockAdminUser.email,
      name: mockAdminUser.name,
      role: mockAdminUser.role,
      oauthProvider: null,
      oauthProviderId: null,
      avatarUrl: null,
      isActive: true,
      createdAt: mockAdminUser.createdAt,
      updatedAt: mockAdminUser.updatedAt,
    };
    (UserModelModule.findByIdWithoutPassword as jest.Mock).mockResolvedValue(userWithoutPassword);

    const result = await AuthService.getMe(mockAdminUser.id);

    expect(result.id).toBe(mockAdminUser.id);
    expect(result.email).toBe(mockAdminUser.email);
  });

  /**
   * 【テスト対象】AuthService.getMe
   * 【テスト内容】存在しないユーザーIDを渡した場合
   * 【期待結果】NotFoundError（404）がthrowされること
   */
  it('should throw 404 error for non-existent user ID', async () => {
    (UserModelModule.findByIdWithoutPassword as jest.Mock).mockResolvedValue(null);

    await expect(AuthService.getMe('non-existent-id')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
