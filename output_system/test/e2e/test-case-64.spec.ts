import { test, expect } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 開発者がDockerCompose環境でフロントエンド・バックエンド・DB・MinIOを起動し、
 * 各サービスが正常に応答することを確認できる
 *
 * 【テストケースIssue】#64
 *
 * 【前提条件】
 * - docker compose up -d が実行済みであること
 *
 * 【期待結果】
 * - フロントエンドがHTTP 200を返す
 * - バックエンドAPIのヘルスチェックエンドポイントがHTTP 200を返す
 * - PostgreSQLのテーブルが作成されている（マイグレーション完了）
 * - MinIOが起動しバケットが存在する
 */
test.describe('Development Environment Health Check', () => {
  /**
   * フロントエンド（Next.js）の起動確認
   * ランディングページが表示されることを確認する
   */
  test('should respond with 200 from frontend (Next.js)', async ({ page }) => {
    const response = await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/');
    expect(response?.status()).toBe(200);

    // ランディングページのロゴが表示される
    await expect(page.getByText('Signia', { exact: true }).first()).toBeVisible();
  });

  /**
   * バックエンドAPIのヘルスチェック
   * /api/health エンドポイントが正常応答することを確認する
   */
  test('should respond with 200 from backend API health endpoint', async ({ request }) => {
    const response = await request.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/health'
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.message).toContain('Signia API');
  });

  /**
   * フロントエンド経由のバックエンドAPIアクセス確認
   * Next.jsのrewritesプロキシ経由でバックエンドAPIにアクセスできることを確認する
   */
  test('should be accessible through frontend proxy', async ({ request }) => {
    // Next.jsのrewritesでプロキシされる /api/* パスを確認
    const response = await request.get(
      'http://okegawaatclink-gaido-signia-output-system:3001/api/health'
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  /**
   * MinIOストレージサービスの起動確認
   * MinIOのヘルスチェックエンドポイントが正常応答することを確認する
   */
  test('should confirm MinIO storage service is running', async ({ request }) => {
    const response = await request.get('http://okegawaatclink-gaido-signia-minio:9000/minio/health/live');
    expect(response.status()).toBe(200);
  });
});
