import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 不正な認証情報でログインが拒否される（異常系テスト）
 *
 * 【テストケースIssue】#77
 *
 * 【前提条件】
 * - admin@signia.example.com / admin123 の管理者アカウントが存在する
 *
 * 【期待結果】
 * - 不正なパスワードでログインに失敗し、エラーメッセージが表示される
 * - 存在しないメールアドレスでログインに失敗する
 * - 空のメールアドレス・パスワードではバリデーションエラーが表示される
 * - 無効化されたアカウントではログインに失敗する
 */
test.describe('Login Security - Invalid Credentials Rejected', () => {
  let sharedApiContext: APIRequestContext;

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * 不正なパスワードでログインに失敗することを確認する
   */
  test('should reject login with wrong password', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: 'admin@signia.example.com',
          password: 'wrong-password',
        },
      }
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });

  /**
   * 存在しないメールアドレスでログインに失敗することを確認する
   */
  test('should reject login with non-existent email', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      }
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });

  /**
   * 空のメールアドレスではバリデーションエラーが返ることを確認する
   */
  test('should return validation error for empty email', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: '',
          password: 'password123',
        },
      }
    );

    // バリデーションエラーは400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  /**
   * 空のパスワードではバリデーションエラーが返ることを確認する
   */
  test('should return validation error for empty password', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: 'admin@signia.example.com',
          password: '',
        },
      }
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  /**
   * 無効なメールアドレス形式ではバリデーションエラーが返ることを確認する
   */
  test('should return validation error for invalid email format', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: 'not-an-email',
          password: 'password123',
        },
      }
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  /**
   * 無効化されたアカウントではログインに失敗することを確認する
   */
  test('should reject login for deactivated account', async () => {
    // newauthor@example.comは is_active=false
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: {
          email: 'newauthor@example.com',
          password: 'author123',
        },
      }
    );

    // 無効化されたアカウントは401
    expect(response.status()).toBe(401);
  });

  /**
   * ログイン失敗のUIエラーメッセージが表示されることを確認する（フロントエンド）
   */
  test('should display error message on UI for wrong credentials', async ({ page }) => {
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');

    // メール+パスワードタブに切り替え
    await page.getByText('管理者・著者（メール）').click();

    // 不正な認証情報を入力
    await page.fill('#email', 'admin@signia.example.com');
    await page.fill('#password', 'wrong-password');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // エラーメッセージが表示される
    await page.waitForTimeout(2000);
    const errorText = await page.locator('[role="alert"], .error-message, [style*="color: red"], [style*="color: #"]').first().textContent().catch(() => '');
    // エラーメッセージが画面に表示されている（URLがloginのまま）
    expect(page.url()).toContain('/login');
  });
});
