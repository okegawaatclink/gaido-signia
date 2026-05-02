/**
 * @file oauth.service.test.ts
 * @description OAuthソーシャルログインサービスのユニットテスト
 *
 * テスト対象:
 * - OAuthService.loginOrRegisterWithOAuth: ソーシャルログイン/新規ファンアカウント作成
 *
 * テスト観点:
 * 1. 既存ユーザー（oauth_provider + oauth_provider_idで検索）のログイン
 * 2. 同じメールで別プロバイダー（メールで検索してプロバイダー更新）
 * 3. 新規ユーザーの自動作成（fanロール付与）
 * 4. 無効化されたアカウントのログイン拒否
 * 5. 複数プロバイダー（Google/Apple）での動作確認
 *
 * DBモックについて:
 * jest.mock()でdbモジュールをモック化してDB接続不要にする
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// DBへの接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

import { OAuthService } from '../../src/services/oauth.service';
import { db } from '../../src/config/database';
import * as CryptoModule from '../../src/utils/crypto';

/** テスト用JWTシークレット */
const TEST_JWT_SECRET = 'test-secret-for-oauth-service';

/**
 * DBクエリモックを作成するヘルパー
 * @param rows - クエリが返す行データ
 */
function mockDbQuery(rows: Record<string, unknown>[]): void {
  (db.query as jest.Mock).mockResolvedValueOnce({ rows });
}

/**
 * 既存のGoogleユーザー行データ（DBレコード形式）
 */
const existingGoogleUserRow = {
  id: 'fan-user-id-001',
  email: 'fan@example.com',
  name: 'テストファン',
  role: 'fan',
  avatar_url: 'https://example.com/avatar.jpg',
  is_active: true,
  oauth_provider: 'google',
  oauth_provider_id: 'google-provider-id-001',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

/**
 * 既存のAppleユーザー行データ
 */
const existingAppleUserRow = {
  ...existingGoogleUserRow,
  id: 'fan-user-id-002',
  email: 'apple-fan@example.com',
  oauth_provider: 'apple',
  oauth_provider_id: 'apple-provider-id-001',
};

/**
 * 無効化されたユーザー行データ
 */
const deactivatedUserRow = {
  ...existingGoogleUserRow,
  id: 'deactivated-fan-id',
  email: 'deactivated@example.com',
  is_active: false,
};

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  jest.restoreAllMocks();
});

describe('OAuthService.loginOrRegisterWithOAuth', () => {
  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】Googleアカウントで既存ユーザーがログインする場合
   * 【期待結果】既存ユーザーのJWTトークンとユーザー情報が返ること
   * 【前提条件】oauth_provider=google, oauth_provider_id=google-provider-id-001 のユーザーが存在
   */
  it('should return token for existing Google user login', async () => {
    // oauth_provider + oauth_provider_id でユーザー検索 → 見つかる
    mockDbQuery([existingGoogleUserRow]);
    // アバターURL更新は同じ値なのでスキップ（実際のコードでは条件チェックあり）

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'google',
      'google-provider-id-001',
      'fan@example.com',
      'テストファン',
      'https://example.com/avatar.jpg'
    );

    expect(result.token).toBeTruthy();
    expect(result.user.id).toBe('fan-user-id-001');
    expect(result.user.role).toBe('fan');
    expect(result.user.oauthProvider).toBe('google');
    expect(result.isNewUser).toBe(false);
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】Apple IDで既存ユーザーがログインする場合
   * 【期待結果】既存ユーザーのJWTトークンとユーザー情報が返ること
   * 【前提条件】oauth_provider=apple, oauth_provider_id=apple-provider-id-001 のユーザーが存在
   */
  it('should return token for existing Apple user login', async () => {
    // apple_provider + apple_provider_id でユーザー検索 → 見つかる
    mockDbQuery([existingAppleUserRow]);

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'apple',
      'apple-provider-id-001',
      'apple-fan@example.com',
      'Apple Fan',
      null
    );

    expect(result.token).toBeTruthy();
    expect(result.user.id).toBe('fan-user-id-002');
    expect(result.user.role).toBe('fan');
    expect(result.user.oauthProvider).toBe('apple');
    expect(result.isNewUser).toBe(false);
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】初回ログインで新規ファンアカウントが作成される場合
   * 【期待結果】fanロールで新規アカウントが作成され、isNewUser=trueが返ること
   * 【前提条件】該当するoauth_provider_id、メールアドレスのユーザーが存在しない
   */
  it('should create new fan account on first login', async () => {
    // oauth_provider + oauth_provider_id でユーザー検索 → 見つからない
    mockDbQuery([]);
    // メールアドレスでユーザー検索 → 見つからない
    mockDbQuery([]);
    // 新規ユーザー作成
    const newUserRow = {
      id: 'new-fan-user-id',
      email: 'newuser@example.com',
      name: 'New Fan',
      role: 'fan',
      avatar_url: null,
      is_active: true,
      oauth_provider: 'google',
      oauth_provider_id: 'new-google-id',
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockDbQuery([newUserRow]);

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'google',
      'new-google-id',
      'newuser@example.com',
      'New Fan',
      null
    );

    expect(result.token).toBeTruthy();
    expect(result.user.id).toBe('new-fan-user-id');
    expect(result.user.role).toBe('fan'); // 必ずfanロールで作成される
    expect(result.isNewUser).toBe(true);

    // DBにINSERTが呼ばれたことを確認
    expect(db.query).toHaveBeenCalledTimes(3); // SELECT x2 + INSERT
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】同じメールで異なるプロバイダーでログインした場合
   * 【期待結果】既存アカウントにプロバイダーが紐付けられること（isNewUser=false）
   * 【前提条件】メールアドレス fan@example.com のユーザーは存在するがApple IDは未紐付け
   */
  it('should link provider to existing account when email matches', async () => {
    // apple_provider_id でユーザー検索 → 見つからない
    mockDbQuery([]);
    // メールアドレスでユーザー検索 → 見つかる（別プロバイダー）
    const existingUserWithDifferentProvider = {
      ...existingGoogleUserRow,
      oauth_provider: 'google',
      oauth_provider_id: 'existing-google-id',
    };
    mockDbQuery([existingUserWithDifferentProvider]);
    // プロバイダー更新のUPDATE
    mockDbQuery([]);

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'apple',
      'new-apple-id',
      'fan@example.com',
      'テストファン',
      null
    );

    expect(result.user.id).toBe('fan-user-id-001');
    expect(result.isNewUser).toBe(false);
    // UPDATEが呼ばれたことを確認（query呼び出し回数: SELECT x2 + UPDATE）
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】無効化されたアカウントでログインしようとした場合
   * 【期待結果】UnauthorizedError（401）がthrowされること
   */
  it('should throw 401 error for deactivated account', async () => {
    // oauth_provider + oauth_provider_id でユーザー検索 → 無効化ユーザーが見つかる
    mockDbQuery([deactivatedUserRow]);

    await expect(
      OAuthService.loginOrRegisterWithOAuth(
        'google',
        'google-provider-id-001',
        'deactivated@example.com',
        'Deactivated Fan',
        null
      )
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】JWTトークンが正しく生成されること
   * 【期待結果】デコードしたトークンにuserId・email・role=fanが含まれること
   */
  it('should generate valid JWT with correct payload', async () => {
    mockDbQuery([existingGoogleUserRow]);

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'google',
      'google-provider-id-001',
      'fan@example.com',
      'テストファン',
      null
    );

    // JWTをデコードしてペイロードを確認
    const decoded = CryptoModule.decodeToken(result.token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe('fan-user-id-001');
    expect(decoded?.email).toBe('fan@example.com');
    expect(decoded?.role).toBe('fan');
  });

  /**
   * 【テスト対象】OAuthService.loginOrRegisterWithOAuth
   * 【テスト内容】アバターURLが変更された場合に更新されること
   * 【期待結果】新しいアバターURLでDBが更新されること
   */
  it('should update avatar URL when it changes', async () => {
    const userWithOldAvatar = {
      ...existingGoogleUserRow,
      avatar_url: 'https://example.com/old-avatar.jpg',
    };
    mockDbQuery([userWithOldAvatar]);
    // アバター更新のUPDATE
    mockDbQuery([]);

    const result = await OAuthService.loginOrRegisterWithOAuth(
      'google',
      'google-provider-id-001',
      'fan@example.com',
      'テストファン',
      'https://example.com/new-avatar.jpg'
    );

    // UPDATEが呼ばれたことを確認
    expect(db.query).toHaveBeenCalledTimes(2); // SELECT + UPDATE
    expect(result.user.avatarUrl).toBe('https://example.com/new-avatar.jpg');
  });
});
