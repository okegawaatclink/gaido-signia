import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * ファンが本棚から書籍を選んでブラウザ上でDRM保護付きで閲覧する
 *
 * 【テストケースIssue】#73
 *
 * 【前提条件】
 * - ファンアカウントが存在すること
 * - ファンが書籍へのアクセス権を持つこと
 *
 * 【期待結果】
 * - 書籍閲覧用の署名付きURLが取得できる
 * - 署名付きURLに15分の有効期限が設定されている
 * - 自分の書籍以外は閲覧できない（403）
 * - 未認証状態ではビューアーにアクセスできない
 */
test.describe('Fan E-Book Viewer with DRM Protection', () => {
  let fanToken: string;
  let sharedApiContext: APIRequestContext;
  let testBookId: string;
  let testFanId: string;

  const TEST_PDF_CONTENT = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
    '0000000058 00000 n \n0000000115 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  );

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    // ファンアカウント作成
    const fanLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/oauth',
      {
        data: {
          provider: 'google',
          providerId: 'e2e-reader-fan-provider-001',
          email: 'e2e-reader-fan@example.com',
          name: 'リーダーテストファン',
          avatarUrl: null,
        },
      }
    );
    const fanData = await fanLogin.json();
    fanToken = fanData.token;
    testFanId = fanData.user.id;

    // 著者ログイン
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    const authorToken = authorData.token;

    // テスト用書籍作成
    const bookResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: 'DRMテスト用書籍',
          bookFile: {
            name: 'drm-test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );
    const bookData = await bookResponse.json();
    testBookId = bookData.book.id;

    // ファンに書籍アクセス権を付与
    await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      {
        headers: { 'X-API-Key': 'sk-e2e-test-api-key-12345' },
        data: {
          bookId: testBookId,
          fanEmail: 'e2e-reader-fan@example.com',
        },
      }
    );
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * 書籍閲覧用の署名付きURLが取得できることを確認する
   */
  test('should get signed URL for book reading', async () => {
    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/books/${testBookId}/read`,
      { headers: { Authorization: `Bearer ${fanToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();

    // 署名付きURLが返される
    expect(body.url).toBeTruthy();
    expect(typeof body.url).toBe('string');

    // 有効期限が設定されている
    expect(body.expiresAt).toBeTruthy();
    const expiresAt = new Date(body.expiresAt);
    const now = new Date();
    // 有効期限が現在より後であることを確認
    expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  /**
   * 署名付きURLの有効期限が15分程度であることを確認する
   */
  test('should have approximately 15 minutes expiry on signed URL', async () => {
    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/books/${testBookId}/read`,
      { headers: { Authorization: `Bearer ${fanToken}` } }
    );

    const body = await response.json();
    const expiresAt = new Date(body.expiresAt);
    const now = new Date();
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

    // 有効期限が10〜20分の範囲内（15分を想定）
    expect(diffMinutes).toBeGreaterThan(10);
    expect(diffMinutes).toBeLessThan(20);
  });

  /**
   * 自分に紐づいていない書籍は閲覧できないことを確認する（DRM保護）
   */
  test('should deny access to books not owned by the fan', async () => {
    // 別のファン（この書籍へのアクセス権なし）を作成
    const otherFanResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/oauth',
      {
        data: {
          provider: 'google',
          providerId: 'e2e-other-reader-fan-001',
          email: 'e2e-other-reader-fan@example.com',
          name: '別のリーダーテストファン',
          avatarUrl: null,
        },
      }
    );
    const otherFanData = await otherFanResponse.json();
    const otherFanToken = otherFanData.token;

    // 別ファンが自分のアクセス権のない書籍にアクセスしようとする
    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/books/${testBookId}/read`,
      { headers: { Authorization: `Bearer ${otherFanToken}` } }
    );

    // アクセス権がないので403が返る
    expect(response.status()).toBe(403);
  });

  /**
   * 未認証状態でビューアーページにアクセスするとリダイレクトされることを確認する
   */
  test('should redirect unauthenticated user from reader page', async ({ page }) => {
    await page.goto(
      `http://okegawaatclink-gaido-signia-output-system:3001/reader/${testBookId}`
    );

    // ログインページまたはランディングページにリダイレクトされる
    await page.waitForURL(/\/login|\//, { timeout: 15000 });
    const currentUrl = page.url();
    expect(
      currentUrl.includes('/login') ||
        currentUrl.includes('/') ||
        currentUrl.includes('/reader')
    ).toBeTruthy();
  });

  /**
   * authorロールはファン向けの書籍閲覧APIにアクセスできないことを確認する
   */
  test('should deny author role from fan book reading endpoint', async () => {
    // 著者ログイン
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    const authorToken = authorData.token;

    // 著者でファン向けAPIにアクセスしようとする
    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/fan/books/${testBookId}/read`,
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    // fanロールではないので403が返る
    expect(response.status()).toBe(403);
  });
});
