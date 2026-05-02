import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 【ユーザーストーリー】
 * 著者がPDF/EPUBファイルをアップロードしてメタデータとともに書籍を登録する
 *
 * 【テストケースIssue】#67
 *
 * 【前提条件】
 * - author@signia.example.com / author123 の著者アカウントが存在する
 *
 * 【期待結果】
 * - 著者ログイン後、書籍一覧画面（/author/books）が表示される
 * - 新規登録ボタンから書籍登録画面（/author/books/new）に遷移できる
 * - バックエンドAPIでPDFファイルのマルチパートアップロードが成功する
 * - 書籍登録後、書籍一覧に登録した書籍が表示される
 */
test.describe('Author Book Upload and Registration', () => {
  // テスト用PDFバイナリ（最小限のPDF）
  const TEST_PDF_CONTENT = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
    '0000000058 00000 n \n0000000115 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  );

  /**
   * 著者が書籍一覧画面を表示できることを確認する
   */
  test('should display author books list after login', async ({ page }) => {
    // 著者としてログイン
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'author@signia.example.com');
    await page.fill('#password', 'author123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // 書籍一覧ページに遷移
    await page.waitForURL('**/author/books', { timeout: 30000 });
    await expect(page).toHaveURL(/\/author\/books/);

    // 書籍一覧ページが表示される（ヘッダー等が確認できる）
    await expect(page.getByRole('heading', { name: /書籍|マイブック/ }).first()).toBeVisible();
  });

  /**
   * 新規書籍登録ページへの遷移確認
   */
  test('should navigate to new book registration page', async ({ page }) => {
    // 著者としてログイン
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'author@signia.example.com');
    await page.fill('#password', 'author123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('**/author/books', { timeout: 30000 });

    // 新規登録ボタンをクリック（router.push使用のボタン）
    await page.getByRole('button', { name: /書籍を登録/ }).click();

    // 書籍登録画面に遷移
    await page.waitForURL('**/author/books/new', { timeout: 15000 });
    await expect(page).toHaveURL(/\/author\/books\/new/);
  });

  /**
   * バックエンドAPIで書籍（PDF）を登録できることを確認する
   */
  test('should successfully upload PDF book via backend API', async ({ request }) => {
    // 著者トークン取得
    const loginResponse = await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: { email: 'author@signia.example.com', password: 'author123' },
      }
    );
    const loginBody = await loginResponse.json();
    const authorToken = loginBody.token;

    // 書籍（PDF）をアップロードして登録
    const response = await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
        multipart: {
          title: 'E2Eテスト書籍（PDF）',
          description: 'E2EテストでアップロードされたPDFの書籍',
          bookFile: {
            name: 'e2e-test.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.book).toBeDefined();
    expect(body.book.title).toBe('E2Eテスト書籍（PDF）');
    expect(body.book.format).toBe('pdf');
  });

  /**
   * EPUBファイルで書籍を登録できることを確認する
   */
  test('should successfully upload EPUB book via backend API', async ({ request }) => {
    // 著者トークン取得
    const loginResponse = await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: { email: 'author@signia.example.com', password: 'author123' },
      }
    );
    const loginBody = await loginResponse.json();
    const authorToken = loginBody.token;

    // 最小限のEPUBファイル（ZIPファイル形式）
    const epubContent = Buffer.from(
      'PK\x03\x04\x14\x00\x00\x00\x00\x00',
      'binary'
    );

    const response = await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
        multipart: {
          title: 'E2Eテスト書籍（EPUB）',
          description: 'E2EテストでアップロードされたEPUBの書籍',
          bookFile: {
            name: 'e2e-test.epub',
            mimeType: 'application/epub+zip',
            buffer: epubContent,
          },
        },
      }
    );

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.book).toBeDefined();
    expect(body.book.title).toBe('E2Eテスト書籍（EPUB）');
    expect(body.book.format).toBe('epub');
  });

  /**
   * 書籍登録後に書籍一覧に表示されることを確認する
   */
  test('should show newly registered book in books list', async ({ request }) => {
    // 著者トークン取得
    const loginResponse = await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/auth/login',
      {
        data: { email: 'author@signia.example.com', password: 'author123' },
      }
    );
    const loginBody = await loginResponse.json();
    const authorToken = loginBody.token;

    const bookTitle = `E2E確認書籍_${Date.now()}`;

    // 書籍を登録
    await request.post(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
        multipart: {
          title: bookTitle,
          bookFile: {
            name: 'check.pdf',
            mimeType: 'application/pdf',
            buffer: TEST_PDF_CONTENT,
          },
        },
      }
    );

    // 書籍一覧を取得して登録された書籍が含まれることを確認
    const listResponse = await request.get(
      'http://okegawaatclink-gaido-signia-output-system-backend:3002/api/books',
      {
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
      }
    );

    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    const bookTitles = listBody.books.map((b: { title: string }) => b.title);
    expect(bookTitles).toContain(bookTitle);
  });
});
