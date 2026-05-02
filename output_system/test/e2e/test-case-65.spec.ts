import { test, expect } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * 管理者・著者がメールアドレスとパスワードでログインし、
 * ロールに応じたダッシュボード画面に遷移できる
 *
 * 【テストケースIssue】#65
 *
 * 【前提条件】
 * - admin@signia.example.com / admin123 の管理者アカウントが存在する
 * - author@signia.example.com / author123 の著者アカウントが存在する
 *
 * 【期待結果】
 * - adminロールでログインするとダッシュボードに遷移する
 * - authorロールでログインすると書籍一覧に遷移する
 * - ログアウト後、認証が必要なページにアクセスできない
 */
test.describe('Admin and Author Email+Password Login', () => {
  /**
   * 管理者アカウントでログインし、ダッシュボードに遷移することを確認する
   */
  test('should login as admin and redirect to dashboard', async ({ page }) => {
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');

    // メール+パスワードタブに切り替え
    await page.getByText('管理者・著者（メール）').click();

    // ログインフォームが表示される
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // 管理者のメールアドレスとパスワードを入力
    await page.fill('#email', 'admin@signia.example.com');
    await page.fill('#password', 'admin123');

    // ログインボタンをクリック
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // ダッシュボードにリダイレクトされる
    await page.waitForURL('**/admin/dashboard', { timeout: 30000 });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  /**
   * 著者アカウントでログインし、書籍一覧に遷移することを確認する
   */
  test('should login as author and redirect to books list', async ({ page }) => {
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');

    // メール+パスワードタブに切り替え
    await page.getByText('管理者・著者（メール）').click();

    // 著者のメールアドレスとパスワードを入力
    await page.fill('#email', 'author@signia.example.com');
    await page.fill('#password', 'author123');

    // ログインボタンをクリック
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // 書籍一覧にリダイレクトされる
    await page.waitForURL('**/author/books', { timeout: 30000 });
    await expect(page).toHaveURL(/\/author\/books/);
  });

  /**
   * ログアウト後に保護されたページにアクセスできないことを確認する
   */
  test('should logout and prevent access to protected pages', async ({ page }) => {
    // まず管理者でログイン
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/login');
    await page.getByText('管理者・著者（メール）').click();
    await page.fill('#email', 'admin@signia.example.com');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await page.waitForURL('**/admin/dashboard', { timeout: 30000 });

    // ログアウトボタンをクリック
    await page.getByRole('button', { name: 'ログアウト' }).click();

    // ログインページにリダイレクトされる
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);

    // 保護されたページに直接アクセスするとログインページにリダイレクトされる
    await page.goto('http://okegawaatclink-gaido-signia-output-system:3001/admin/dashboard');
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
