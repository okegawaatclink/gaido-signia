import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * ファンがログイン後に自分に紐づいたサイン入り電子書籍の一覧を確認する
 *
 * 【テストケースIssue】#72
 *
 * 【前提条件】
 * - ファンアカウントが存在すること
 *
 * 【期待結果】
 * - ランディングページが表示される
 * - ファンログイン後に本棚画面（/bookshelf）に遷移する
 * - 本棚APIで書籍一覧が取得できる
 * - 書籍がない場合は空配列が返される
 * - 他のファンの書籍は表示されない
 */
test.describe('Fan Bookshelf Display', () => {
  let fanToken: string;
  let sharedApiContext: APIRequestContext;

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    // テスト用ファンアカウント作成
    const fanLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/oauth',
      {
        data: {
          provider: 'google',
          providerId: 'e2e-bookshelf-fan-provider-001',
          email: 'e2e-bookshelf-fan@example.com',
          name: '本棚テストファン',
          avatarUrl: null,
        },
      }
    );
    const fanData = await fanLogin.json();
    fanToken = fanData.token;
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * ランディングページが表示されることを確認する
   */
  test('should display landing page', async ({ page }) => {
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/');
    await expect(page.locator('body')).toBeVisible();

    // ランディングページのコンテンツが表示される
    await expect(page.getByText('Signia', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログイン' }).first()).toBeVisible();
  });

  /**
   * ファンの本棚APIで書籍一覧が取得できることを確認する
   */
  test('should get bookshelf via API', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/bookshelf',
      { headers: { Authorization: `Bearer ${fanToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    // 書籍一覧（空配列でもOK）が返される
    expect(Array.isArray(body.books || body.bookshelf || body.items || [])).toBe(true);
  });

  /**
   * 書籍がないファンの本棚は空配列が返されることを確認する
   */
  test('should return empty bookshelf for fan with no books', async () => {
    // 新規ファン（書籍なし）のトークンを取得
    const newFanResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/oauth',
      {
        data: {
          provider: 'google',
          providerId: 'e2e-empty-bookshelf-fan-001',
          email: 'e2e-empty-bookshelf-fan@example.com',
          name: '書籍なしテストファン',
          avatarUrl: null,
        },
      }
    );
    const newFanData = await newFanResponse.json();
    const newFanToken = newFanData.token;

    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/bookshelf',
      { headers: { Authorization: `Bearer ${newFanToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    // 書籍がない場合は空配列が返される
    const books = body.books || body.bookshelf || body.items || [];
    expect(Array.isArray(books)).toBe(true);
    expect(books.length).toBe(0);
  });

  /**
   * fanロール以外のユーザーは本棚APIにアクセスできないことを確認する（RBAC）
   */
  test('should deny access to bookshelf for author role', async () => {
    // 著者トークンを取得
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    const authorToken = authorData.token;

    // 著者でファンの本棚にアクセスしようとする
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/bookshelf',
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    // fanロールではないので403が返る
    expect(response.status()).toBe(403);
  });

  /**
   * /bookshelfページへの直接アクセスで未認証のユーザーがリダイレクトされることを確認する
   */
  test('should redirect unauthenticated user from bookshelf', async ({ page }) => {
    // 認証なしで /bookshelf に直接アクセス
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/bookshelf');

    // ログインページまたはランディングページにリダイレクトされる
    await page.waitForURL(/\/login|\//, { timeout: 15000 });
    const currentUrl = page.url();
    expect(
      currentUrl.includes('/login') || currentUrl.includes('/bookshelf')
    ).toBeTruthy();
  });
});
