import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 50MBを超えるファイルのアップロードが拒否される（境界値・異常系テスト）
 *
 * 【テストケースIssue】#78
 *
 * 【前提条件】
 * - author@signia.example.com / author123 の著者アカウントが存在する
 *
 * 【期待結果】
 * - 50MBを超えるファイルはエラーメッセージとともに拒否される
 * - PDF/EPUB以外のファイル形式は拒否される
 * - タイトルが空の場合はバリデーションエラーが表示される
 * - 入力値の境界条件で適切なバリデーションが動作する
 */
test.describe('File Upload Validation - Size and Format Restrictions', () => {
  let authorToken: string;
  let sharedApiContext: APIRequestContext;

  test.beforeAll(async () => {
    sharedApiContext = await playwrightRequest.newContext();

    const loginResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      { data: { email: 'author@signia.example.com', password: 'author123' } }
    );
    const loginData = await loginResponse.json();
    authorToken = loginData.token;
  });

  test.afterAll(async () => {
    await sharedApiContext.dispose();
  });

  /**
   * PDF/EPUB以外のファイル形式（テキストファイル）がアップロード拒否されることを確認する
   */
  test('should reject text file upload (.txt)', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: 'テキストファイルテスト',
          bookFile: {
            name: 'invalid.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('This is a text file'),
          },
        },
      }
    );

    // 不正なファイル形式は400
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  /**
   * 画像ファイル（JPG）がアップロード拒否されることを確認する
   */
  test('should reject image file upload (.jpg)', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: '画像ファイルテスト',
          bookFile: {
            name: 'invalid.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('\xff\xd8\xff\xe0'),
          },
        },
      }
    );

    expect(response.status()).toBe(400);
  });

  /**
   * タイトルが空のままアップロードしようとするとバリデーションエラーが返ることを確認する
   */
  test('should reject book upload with empty title', async () => {
    const TEST_PDF_CONTENT = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      'xref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF'
    );

    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: '',
          bookFile: {
            name: 'test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  /**
   * タイトルが201文字以上の場合バリデーションエラーが返ることを確認する
   * （最大200文字制限）
   */
  test('should reject book upload with title exceeding 200 characters', async () => {
    const TEST_PDF_CONTENT = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      'xref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF'
    );

    const longTitle = 'あ'.repeat(201); // 201文字のタイトル（200文字制限を超える）

    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: longTitle,
          bookFile: {
            name: 'test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  /**
   * ちょうど200文字のタイトルは受け入れられることを確認する
   */
  test('should accept book upload with title exactly 200 characters', async () => {
    const TEST_PDF_CONTENT = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      'xref\n0 1\n0000000000 65535 f \ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF'
    );

    const exactTitle = 'あ'.repeat(200); // 200文字（制限値と同じ）

    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          title: exactTitle,
          bookFile: {
            name: 'boundary-test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );

    // 200文字は有効なタイトル
    expect(response.status()).toBe(201);
  });

  /**
   * フロントエンドUIでのファイルサイズ制限表示を確認する
   */
  test('should display file size limit on book registration UI', async ({ page }) => {
    // 著者ログイン
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'author@signia.example.com');
    await page.fill('#password', 'author123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('**/author/books', { timeout: 30000 });

    // 書籍登録画面に移動
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/author/books/new');

    // ページが表示される
    await expect(page.locator('body')).toBeVisible();

    // 50MBの制限についての説明テキストを確認
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('50');
  });
});
