import { test, expect, request as playwrightRequest, APIRequestContext } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 著者が作成済みサインの一覧表示・再作成（上書き保存）・削除をする
 *
 * 【テストケースIssue】#70
 *
 * 【前提条件】
 * - author@signia.example.com / author123 の著者アカウントが存在する
 *
 * 【期待結果】
 * - 自分のサイン一覧が表示される
 * - サインのプレビュー画像が表示される
 * - サインを再作成（上書き保存）できる
 * - サインを削除できる
 * - 他の著者のサインは表示・操作できない
 */
test.describe('Author Sign List, Edit and Delete', () => {
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
   * 自分のサイン一覧が表示されることを確認する
   */
  test('should list own signs via API', async () => {
    const response = await sharedApiContext.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.signs)).toBe(true);
  });

  /**
   * サインのプレビュー画像URLが取得できることを確認する
   */
  test('should get sign with image key', async () => {
    // テスト用サインを作成
    const createResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: 'プレビューテストサイン',
          type: 'common',
          isDefault: 'false',
          canvasData: JSON.stringify({ version: '5.3.0', objects: [] }),
          signImage: {
            name: 'preview.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );
    const { sign } = await createResponse.json();

    // サイン詳細にimage_keyが含まれることを確認
    const getResponse = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs/${sign.id}`,
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    expect(getResponse.status()).toBe(200);
    const getBody = await getResponse.json();
    // imageKeyまたはimageUrlが存在する
    expect(getBody.sign.imageKey || getBody.sign.imageUrl || getBody.sign.image_key).toBeTruthy();
  });

  /**
   * サインを再作成（上書き保存）できることを確認する
   */
  test('should update (overwrite) a sign', async () => {
    // テスト用サインを作成
    const createResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: '更新前サイン名',
          type: 'common',
          isDefault: 'false',
          canvasData: JSON.stringify({ version: '5.3.0', objects: [] }),
          signImage: {
            name: 'update-before.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );
    const { sign } = await createResponse.json();

    // サインを更新（上書き保存）
    const updateResponse = await sharedApiContext.put(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs/${sign.id}`,
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: '更新後サイン名',
          type: 'individual',
          isDefault: 'false',
          canvasData: JSON.stringify({ version: '5.3.0', objects: [{ type: 'path' }] }),
          signImage: {
            name: 'update-after.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );

    expect(updateResponse.status()).toBe(200);
    const updateBody = await updateResponse.json();
    expect(updateBody.sign.name).toBe('更新後サイン名');
    expect(updateBody.sign.type).toBe('individual');
  });

  /**
   * サインを削除できることを確認する
   */
  test('should delete a sign', async () => {
    // テスト用サインを作成
    const createResponse = await sharedApiContext.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs',
      {
        headers: { Authorization: `Bearer ${authorToken}` },
        multipart: {
          name: '削除テストサイン',
          type: 'common',
          isDefault: 'false',
          canvasData: JSON.stringify({ version: '5.3.0', objects: [] }),
          signImage: {
            name: 'delete.png',
            mimeType: 'image/png',
            buffer: MINIMAL_PNG,
          },
        },
      }
    );
    const { sign } = await createResponse.json();

    // サインを削除
    const deleteResponse = await sharedApiContext.delete(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs/${sign.id}`,
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );

    // 削除成功は200または204
    expect([200, 204]).toContain(deleteResponse.status());

    // 削除後にサイン取得すると404になる
    const getResponse = await sharedApiContext.get(
      `http://okegawaatclink-gaido-signia-output-system-backend:3002/api/signs/${sign.id}`,
      { headers: { Authorization: `Bearer ${authorToken}` } }
    );
    expect(getResponse.status()).toBe(404);
  });
});
