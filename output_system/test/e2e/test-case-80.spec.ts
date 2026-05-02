import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 外部APIで不正なAPI Keyが拒否されレート制限が適用される
 *
 * 【テストケースIssue】#80
 *
 * 【前提条件】
 * - 有効なAPIキー（sk-e2e-test-api-key-12345）が存在すること
 *
 * 【期待結果】
 * - 不正なAPI Keyでは401 Unauthorizedが返る
 * - API Keyなしでは401 Unauthorizedが返る
 * - 存在しない書籍IDでアクセス権を付与しようとすると適切なエラーが返る
 * - 存在しないアクセス権IDを削除しようとすると404が返る
 */
test.describe('External API Security - Invalid API Keys and Error Handling', () => {
  const VALID_API_KEY = 'sk-e2e-test-api-key-12345';
  const INVALID_API_KEY = 'sk-invalid-api-key-99999';
  let sharedApiContext: APIRequestContext;
  let testBookId: string;
  let authorToken: string;

  const TEST_PDF_CONTENT = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    'xref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF'
  );

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    // 著者ログインして書籍を作成
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    authorToken = authorData.token;

    const bookResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: '外部APIセキュリティテスト用書籍',
          bookFile: {
            name: 'security-test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );
    const bookData = await bookResponse.json();
    testBookId = bookData.book?.id;
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * 不正なAPI Keyで外部APIにアクセスすると401が返ることを確認する
   */
  test('should return 401 for invalid API key on book-access GET', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      { headers: { 'X-API-Key': INVALID_API_KEY } }
    );

    expect(response.status()).toBe(401);
  });

  /**
   * API Keyなしで外部APIにアクセスすると401が返ることを確認する
   */
  test('should return 401 when no API key is provided', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access'
    );

    expect(response.status()).toBe(401);
  });

  /**
   * 不正なAPI Keyでアクセス権付与APIにアクセスすると401が返ることを確認する
   */
  test('should return 401 for invalid API key on book-access POST', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      {
        headers: {
          'X-API-Key': INVALID_API_KEY,
          'Content-Type': 'application/json',
        },
        data: {
          bookId: testBookId || 'nonexistent-id',
          fanEmail: 'testfan@example.com',
          externalReference: 'security-test-invalid-key',
        },
      }
    );

    expect(response.status()).toBe(401);
  });

  /**
   * 不正なAPI KeyでサインAPIにアクセスすると401が返ることを確認する
   */
  test('should return 401 for invalid API key on signs API', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/signs',
      {
        headers: {
          'X-API-Key': INVALID_API_KEY,
          'Content-Type': 'application/json',
        },
        data: {
          authorId: 'some-author-id',
          name: '不正なサイン',
          type: 'common',
          imageBase64: 'dGVzdA==',
        },
      }
    );

    expect(response.status()).toBe(401);
  });

  /**
   * 空文字のAPI Keyで外部APIにアクセスすると401が返ることを確認する
   */
  test('should return 401 for empty API key', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      { headers: { 'X-API-Key': '' } }
    );

    expect(response.status()).toBe(401);
  });

  /**
   * 存在しない書籍IDでアクセス権を付与しようとすると適切なエラーが返ることを確認する
   */
  test('should return error for non-existent book ID', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      {
        headers: {
          'X-API-Key': VALID_API_KEY,
          'Content-Type': 'application/json',
        },
        data: {
          bookId: '00000000-0000-0000-0000-000000000000',
          fanEmail: 'testfan@example.com',
          externalReference: `security-test-nonexistent-book-${Date.now()}`,
        },
      }
    );

    // 存在しない書籍は400または404
    expect([400, 404]).toContain(response.status());
  });

  /**
   * 存在しないアクセス権IDを削除しようとすると404が返ることを確認する
   */
  test('should return 404 when deleting non-existent book access', async () => {
    const response = await sharedApiContext.delete(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access/00000000-0000-0000-0000-000000000000',
      { headers: { 'X-API-Key': VALID_API_KEY } }
    );

    expect(response.status()).toBe(404);
  });

  /**
   * 有効なAPI Keyで書籍アクセス一覧が正常に取得できることを確認する（正常系の念押し）
   */
  test('should succeed with valid API key', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
      { headers: { 'X-API-Key': VALID_API_KEY } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.bookAccess)).toBe(true);
  });
});
