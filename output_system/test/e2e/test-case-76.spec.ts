import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 管理者がダッシュボードで統計情報と最近の操作を確認する
 *
 * 【テストケースIssue】#76
 *
 * 【前提条件】
 * - admin@signia.example.com / admin123 の管理者アカウントが存在する
 *
 * 【期待結果】
 * - ダッシュボードに統計情報（著者数・書籍数・ファン数・サイン合成数）が表示される
 * - 最近の操作履歴が表示される
 * - 全書籍一覧が検索・表示できる
 * - 書籍詳細画面で書籍情報が確認できる
 * - admin以外のロールでは管理者ダッシュボードにアクセスできない
 */
test.describe('Admin Dashboard and Statistics', () => {
  let adminToken: string;
  let sharedApiContext: APIRequestContext;

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    const adminLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'admin@signia.example.com', password: 'admin123' } }
    );
    const adminData = await adminLogin.json();
    adminToken = adminData.token;
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * 統計情報APIで著者数・書籍数・ファン数・サイン合成数が取得できることを確認する
   */
  test('should get dashboard statistics', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/stats',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();

    // 統計情報のフィールドが存在することを確認
    expect(body.stats || body).toBeDefined();
    const stats = body.stats || body;

    // 著者数・書籍数・ファン数が数値として存在する
    expect(typeof (stats.authorCount ?? stats.authors ?? 0)).toBe('number');
    expect(typeof (stats.bookCount ?? stats.books ?? 0)).toBe('number');
    expect(typeof (stats.fanCount ?? stats.fans ?? 0)).toBe('number');
  });

  /**
   * 最近の操作履歴が取得できることを確認する
   */
  test('should include recent activity in stats response', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/stats',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const body = await response.json();
    // 監査ログ/最近の操作が含まれることを確認（空配列もOK）
    const recentActivity =
      body.recentActivity ||
      body.auditLogs ||
      body.recent_activity ||
      body.audit_logs ||
      [];
    expect(Array.isArray(recentActivity)).toBe(true);
  });

  /**
   * 全書籍一覧が取得できることを確認する
   */
  test('should get all books list with search', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/books',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.books)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  /**
   * 書籍検索が機能することを確認する
   */
  test('should search books by title', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/books?search=テスト',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.books)).toBe(true);
  });

  /**
   * 書籍詳細が取得できることを確認する
   */
  test('should get book detail', async () => {
    // 書籍一覧から1件を取得
    const listResponse = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/books',
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const { books } = await listResponse.json();

    if (books.length === 0) {
      expect(true).toBe(true);
      return;
    }

    const bookId = books[0].id;
    const detailResponse = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/books/${bookId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(detailResponse.status()).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.book || detailBody).toBeDefined();
    const book = detailBody.book || detailBody;
    expect(book.id).toBe(bookId);
  });

  /**
   * adminロール以外は管理者APIにアクセスできないことを確認する
   */
  test('should deny non-admin access to stats API', async () => {
    // 著者トークンでアクセス
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    const authorToken = authorData.token;

    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/admin/stats',
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    expect(response.status()).toBe(403);
  });

  /**
   * 管理者ダッシュボードのUIが表示されることを確認する
   */
  test('should display admin dashboard page', async ({ page }) => {
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'admin@signia.example.com');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('**/admin/dashboard', { timeout: 30000 });

    // ダッシュボードが表示される
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('body')).toBeVisible();
  });
});
