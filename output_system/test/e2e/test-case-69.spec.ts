import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 著者がタブレット上でCanvas手書きサインを作成し保存する
 *
 * 【テストケースIssue】#69
 *
 * 【前提条件】
 * - author@signia.example.com / author123 の著者アカウントが存在する
 *
 * 【期待結果】
 * - サイン作成画面（/author/signs/new）が表示される
 * - 共通サイン（common）種別でサインを作成・保存できる
 * - 個別サイン（individual）種別でサインを作成・保存できる
 * - サインがPNG画像としてS3に保存される
 * - Canvas描画データ（JSON）も保存される
 * - デフォルトサインを設定できる
 */
test.describe('Author Handwritten Sign Creation', () => {
  // テスト用PNG画像（1x1ピクセルの最小PNG）
  const MINIMAL_PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex'
  );

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
   * サイン作成ページへの遷移確認（UIテスト）
   */
  test('should navigate to sign creation page', async ({ page }) => {
    // 著者としてログイン
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'author@signia.example.com');
    await page.fill('#password', 'author123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('**/author/books', { timeout: 30000 });

    // サイン一覧ページへ遷移
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/author/signs');
    await expect(page).toHaveURL(/\/author\/signs/);

    // サイン一覧ページが表示される
    await expect(page.locator('body')).toBeVisible();
  });

  /**
   * 共通サイン（common）をバックエンドAPIで作成できることを確認する
   */
  test('should create a common sign via API', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: 'E2Eテスト共通サイン',
          type: 'common',
          isDefault: 'false',
          canvasData: JSON.stringify({
            version: '5.3.0',
            objects: [{ type: 'path', path: 'M 10 10 L 50 50' }],
          }),
          signImage: {
            name: 'sign-common.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.sign).toBeDefined();
    expect(body.sign.name).toBe('E2Eテスト共通サイン');
    expect(body.sign.type).toBe('common');
  });

  /**
   * 個別サイン（individual）をバックエンドAPIで作成できることを確認する
   */
  test('should create an individual sign via API', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: 'E2Eテスト個別サイン',
          type: 'individual',
          isDefault: 'false',
          canvasData: JSON.stringify({
            version: '5.3.0',
            objects: [{ type: 'path', path: 'M 20 20 L 80 80' }],
          }),
          signImage: {
            name: 'sign-individual.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.sign).toBeDefined();
    expect(body.sign.name).toBe('E2Eテスト個別サイン');
    expect(body.sign.type).toBe('individual');
  });

  /**
   * デフォルトサインを設定できることを確認する
   */
  test('should create a default sign via API', async () => {
    const response = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: 'E2Eテストデフォルトサイン',
          type: 'common',
          isDefault: 'true',
          canvasData: JSON.stringify({
            version: '5.3.0',
            objects: [],
          }),
          signImage: {
            name: 'sign-default.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.sign.isDefault).toBe(true);
  });

  /**
   * サイン作成後にサイン一覧に表示されることを確認する
   */
  test('should show newly created sign in signs list', async () => {
    const signName = `E2Eテストサイン一覧確認_${Date.now()}`;

    // サインを作成
    const createResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: signName,
          type: 'common',
          isDefault: 'false',
          type: 'common',
          isDefault: 'false',
          canvasData: JSON.stringify({ version: '5.3.0', objects: [] }),
          signImage: {
            name: 'sign-list.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.sign.name).toBe(signName);

    // サイン一覧を取得して作成したサインが含まれることを確認
    const listResponse = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    const signNames = listBody.signs.map((s: { name: string }) => s.name);
    expect(signNames).toContain(signName);
  });
});
