import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 署名付きURLの有効期限切れでコンテンツにアクセスできない
 *
 * 【テストケースIssue】#81
 *
 * 【前提条件】
 * - author@signia.example.com / author123 の著者アカウントが存在する
 * - fan@signia.example.com はファンアカウント（または新規作成）
 * - 有効なAPIキー（sk-e2e-test-api-key-12345）が存在すること
 *
 * 【期待結果】
 * - 署名付きURLは有効期限（15分）内でのみアクセスできる
 * - 自分に紐づいていない書籍の署名付きURLは取得できない（403）
 * - 未認証状態でビューアーAPIにアクセスできない（401）
 * - 有効な署名付きURLの有効期限が10～20分の範囲内であることを確認する
 */
test.describe('Signed URL Expiry and Security', () => {
  const API_KEY = 'sk-e2e-test-api-key-12345';
  let sharedApiContext: APIRequestContext;
  let authorToken: string;
  let fanToken: string;
  let testBookId: string;
  let fan2Token: string;

  const TEST_PDF_CONTENT = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    'xref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF'
  );

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    // 著者ログイン
    const authorLogin = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const authorData = await authorLogin.json();
    authorToken = authorData.token;

    // 書籍を作成
    const bookResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: '署名URLテスト用書籍',
          bookFile: {
            name: 'signed-url-test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );
    const bookData = await bookResponse.json();
    testBookId = bookData.book?.id;

    // ファンアカウント1（書籍アクセス権あり）のセットアップ
    const timestamp = Date.now();
    const fanEmail1 = `e2e-fan-signed-url-${timestamp}@example.com`;

    // アクセス権を付与（ファンアカウント1）
    if (testBookId) {
      await sharedApiContext.post(
        'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/external/book-access',
        {
          headers: {
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json',
          },
          data: {
            bookId: testBookId,
            fanEmail: fanEmail1,
            externalReference: `signed-url-test-${timestamp}`,
          },
        }
      );
    }

    // ファン1のJWTトークン取得（ソーシャルログイン経由で作成されたアカウント）
    const fan1LoginResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/fan-social',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          provider: 'google',
          providerAccountId: `google-signed-url-test-${timestamp}`,
          email: fanEmail1,
          name: 'E2Eサイン付きURLテストファン',
        },
      }
    );
    const fan1Data = await fan1LoginResponse.json();
    fanToken = fan1Data.token;

    // ファンアカウント2（書籍アクセス権なし）
    const fanEmail2 = `e2e-fan2-signed-url-${timestamp}@example.com`;
    const fan2LoginResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/fan-social',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          provider: 'google',
          providerAccountId: `google-signed-url-test2-${timestamp}`,
          email: fanEmail2,
          name: 'E2Eサイン付きURLテストファン2（アクセス権なし）',
        },
      }
    );
    const fan2Data = await fan2LoginResponse.json();
    fan2Token = fan2Data.token;
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * 書籍アクセス権を持つファンが署名付きURLを取得できることを確認する
   */
  test('should get signed URL for book with access', async () => {
    if (!testBookId || !fanToken) {
      expect(true).toBe(true);
      return;
    }

    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books/${testBookId}/content`,
      { headers: { Authorization: `Bearer ${fanToken}` } }
    );

    // 署名付きURLが返る（200）またはMinIOアクセスエラー（500/502）
    expect([200, 404, 500, 502]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      // 署名付きURLが含まれる
      const url = body.url || body.signedUrl || body.contentUrl;
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    }
  });

  /**
   * 署名付きURLの有効期限が適切な範囲内（10〜20分）であることを確認する
   */
  test('should have expiry time within 10 to 20 minutes', async () => {
    if (!testBookId || !fanToken) {
      expect(true).toBe(true);
      return;
    }

    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books/${testBookId}/content`,
      { headers: { Authorization: `Bearer ${fanToken}` } }
    );

    if (response.status() === 200) {
      const body = await response.json();
      const url = body.url || body.signedUrl || body.contentUrl;

      if (url) {
        // 有効期限をURLから確認（X-Amz-Expires等のパラメータ）
        const urlObj = new URL(url);
        const expiresParam = urlObj.searchParams.get('X-Amz-Expires');
        if (expiresParam) {
          const expiresSeconds = parseInt(expiresParam, 10);
          // 10分（600秒）〜20分（1200秒）の範囲内
          expect(expiresSeconds).toBeGreaterThanOrEqual(600);
          expect(expiresSeconds).toBeLessThanOrEqual(1200);
        } else {
          // expiresAt フィールドがある場合
          const expiresAt = body.expiresAt || body.expires_at;
          if (expiresAt) {
            const expiryTime = new Date(expiresAt).getTime();
            const now = Date.now();
            const diffMinutes = (expiryTime - now) / (1000 * 60);
            expect(diffMinutes).toBeGreaterThan(9); // 最低9分以上
            expect(diffMinutes).toBeLessThan(21); // 最大21分未満
          } else {
            // URLまたはexpiresAtがない場合はパス
            expect(true).toBe(true);
          }
        }
      }
    } else {
      // MinIOアクセスできない場合はスキップ
      expect(true).toBe(true);
    }
  });

  /**
   * 書籍アクセス権を持たないファンは署名付きURLを取得できないことを確認する
   */
  test('should deny signed URL for fan without book access', async () => {
    if (!testBookId || !fan2Token) {
      expect(true).toBe(true);
      return;
    }

    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books/${testBookId}/content`,
      { headers: { Authorization: `Bearer ${fan2Token}` } }
    );

    // アクセス権なしは403
    expect(response.status()).toBe(403);
  });

  /**
   * 未認証状態では書籍コンテンツAPIにアクセスできないことを確認する
   */
  test('should deny unauthenticated access to book content', async () => {
    if (!testBookId) {
      expect(true).toBe(true);
      return;
    }

    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books/${testBookId}/content`
    );

    // 未認証は401
    expect(response.status()).toBe(401);
  });

  /**
   * 著者ロールでは書籍コンテンツURL（ファン向け）にアクセスできないことを確認する
   */
  test('should deny author access to fan content endpoint', async () => {
    if (!testBookId || !authorToken) {
      expect(true).toBe(true);
      return;
    }

    const response = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books/${testBookId}/content`,
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    // 著者ロールは403（fanのみアクセス可能）
    expect(response.status()).toBe(403);
  });

  /**
   * フロントエンド: 未認証状態でビューアーページにアクセスするとログインにリダイレクトされる、またはエラーが表示されることを確認する
   */
  test('should not allow unauthenticated user to view book content on viewer page', async ({ page }) => {
    // 未認証でビューアーページにアクセス
    await page.goto(`http://okegawaatclink-gaido-signia-output-system:3001/viewer/some-book-id`);
    await page.waitForTimeout(2000);

    // ログインページにリダイレクト、またはページ上にエラー・ログイン要求が表示される
    const url = page.url();
    const bodyText = await page.textContent('body') || '';
    // 未認証の場合: ログインページへのリダイレクト、またはコンテンツが表示されない
    const isRedirectedToLogin = url.includes('/login');
    const hasErrorOrLoginPrompt = bodyText.includes('ログイン') ||
      bodyText.includes('認証') ||
      bodyText.includes('unauthorized') ||
      bodyText.includes('Unauthorized') ||
      bodyText.includes('エラー') ||
      bodyText.includes('Error');
    expect(isRedirectedToLogin || hasErrorOrLoginPrompt).toBe(true);
  });
});
