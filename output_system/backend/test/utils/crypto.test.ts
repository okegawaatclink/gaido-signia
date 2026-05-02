/**
 * @file crypto.test.ts
 * @description crypto.tsユーティリティのユニットテスト
 *
 * テスト対象:
 * - hashPassword: パスワードのbcryptハッシュ化
 * - verifyPassword: パスワード検証
 * - generateToken: JWTトークン生成
 * - verifyToken: JWTトークン検証
 * - decodeToken: JWTトークンデコード（検証なし）
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  decodeToken,
  JwtUserPayload,
} from '../../src/utils/crypto';

/** テスト用のJWTシークレット */
const TEST_JWT_SECRET = 'test-secret-key-for-unit-testing-only';

/** テスト用ユーザーペイロード */
const testPayload: JwtUserPayload = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: 'author',
};

// JWT_SECRET環境変数をテスト用に設定
beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// ===== hashPassword / verifyPassword テスト =====

describe('hashPassword', () => {
  /**
   * 【テスト対象】hashPassword関数
   * 【テスト内容】平文パスワードを渡した場合
   * 【期待結果】bcryptハッシュが返り、元のパスワードと異なる文字列になること
   */
  it('should return a bcrypt hash different from the original password', async () => {
    const password = 'mySecurePassword123!';
    const hash = await hashPassword(password);

    // ハッシュは元のパスワードと異なること
    expect(hash).not.toBe(password);
    // bcryptハッシュの形式: $2a$12$... または $2b$12$...
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
  });

  /**
   * 【テスト対象】hashPassword関数
   * 【テスト内容】同じパスワードを2回ハッシュ化した場合
   * 【期待結果】異なるハッシュ値が返ること（saltがランダムなため）
   */
  it('should return different hashes for the same password due to random salt', async () => {
    const password = 'samePassword';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  /**
   * 【テスト対象】verifyPassword関数
   * 【テスト内容】正しいパスワードとハッシュを渡した場合
   * 【期待結果】trueを返すこと
   */
  it('should return true for matching password and hash', async () => {
    const password = 'correctPassword!';
    const hash = await hashPassword(password);

    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  /**
   * 【テスト対象】verifyPassword関数
   * 【テスト内容】間違ったパスワードを渡した場合
   * 【期待結果】falseを返すこと
   */
  it('should return false for non-matching password', async () => {
    const correctPassword = 'correctPassword!';
    const wrongPassword = 'wrongPassword!';
    const hash = await hashPassword(correctPassword);

    const result = await verifyPassword(wrongPassword, hash);
    expect(result).toBe(false);
  });

  /**
   * 【テスト対象】verifyPassword関数
   * 【テスト内容】空文字列をパスワードとして渡した場合
   * 【期待結果】falseを返すこと（空パスワードが一致することはない）
   */
  it('should return false for empty password', async () => {
    const password = 'somePassword';
    const hash = await hashPassword(password);

    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });
});

// ===== generateToken / verifyToken テスト =====

describe('generateToken', () => {
  /**
   * 【テスト対象】generateToken関数
   * 【テスト内容】有効なペイロードを渡した場合
   * 【期待結果】JWT形式（3つのBase64URLセクション、ドット区切り）のトークンが返ること
   */
  it('should return a valid JWT format string', () => {
    const token = generateToken(testPayload);

    // JWT形式: header.payload.signature
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  /**
   * 【テスト対象】generateToken関数
   * 【テスト内容】admin, author, fanの各ロールでトークンを生成した場合
   * 【期待結果】それぞれのロールが正しくペイロードに含まれること
   */
  it('should include correct role in token payload for all roles', () => {
    const roles: Array<'admin' | 'author' | 'fan'> = ['admin', 'author', 'fan'];

    for (const role of roles) {
      const payload = { ...testPayload, role };
      const token = generateToken(payload);
      const decoded = decodeToken(token);

      expect(decoded?.role).toBe(role);
    }
  });

  /**
   * 【テスト対象】generateToken関数
   * 【テスト内容】JWT_SECRET環境変数が設定されていない場合
   * 【期待結果】エラーがthrowされること
   */
  it('should throw error when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;

    expect(() => generateToken(testPayload)).toThrow('JWT_SECRET environment variable is required');
  });
});

describe('verifyToken', () => {
  /**
   * 【テスト対象】verifyToken関数
   * 【テスト内容】有効なJWTトークンを渡した場合
   * 【期待結果】元のペイロード情報が返ること
   */
  it('should return the original payload for a valid token', () => {
    const token = generateToken(testPayload);
    const decoded = verifyToken(token);

    expect(decoded.userId).toBe(testPayload.userId);
    expect(decoded.email).toBe(testPayload.email);
    expect(decoded.role).toBe(testPayload.role);
  });

  /**
   * 【テスト対象】verifyToken関数
   * 【テスト内容】無効な（改ざんされた）トークンを渡した場合
   * 【期待結果】エラーがthrowされること
   */
  it('should throw error for tampered token', () => {
    const token = generateToken(testPayload);
    // 署名部分を改ざん
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.invalidSignature`;

    expect(() => verifyToken(tamperedToken)).toThrow();
  });

  /**
   * 【テスト対象】verifyToken関数
   * 【テスト内容】異なる秘密鍵で署名されたトークンを渡した場合
   * 【期待結果】エラーがthrowされること（署名検証失敗）
   */
  it('should throw error for token signed with different secret', () => {
    // 別の秘密鍵でトークンを生成
    process.env.JWT_SECRET = 'different-secret-key';
    const tokenWithDifferentSecret = generateToken(testPayload);

    // 元の秘密鍵に戻して検証を試みる
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    expect(() => verifyToken(tokenWithDifferentSecret)).toThrow();
  });

  /**
   * 【テスト対象】verifyToken関数
   * 【テスト内容】完全に無効な文字列を渡した場合
   * 【期待結果】エラーがthrowされること
   */
  it('should throw error for completely invalid token string', () => {
    expect(() => verifyToken('not-a-jwt-token')).toThrow();
  });
});

// ===== decodeToken テスト =====

describe('decodeToken', () => {
  /**
   * 【テスト対象】decodeToken関数
   * 【テスト内容】有効なJWTトークンを渡した場合
   * 【期待結果】ペイロードがデコードされること（署名検証なし）
   */
  it('should decode token without verification', () => {
    const token = generateToken(testPayload);
    const decoded = decodeToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(testPayload.userId);
    expect(decoded?.email).toBe(testPayload.email);
  });

  /**
   * 【テスト対象】decodeToken関数
   * 【テスト内容】無効な文字列を渡した場合
   * 【期待結果】nullを返すこと
   */
  it('should return null for invalid token', () => {
    const decoded = decodeToken('invalid-token');
    expect(decoded).toBeNull();
  });
});
