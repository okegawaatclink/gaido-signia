/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript設定: ビルドエラーを有効にする（本番ビルドで型エラーを検出）
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint設定: ビルド時にLintエラーを検出
  eslint: {
    ignoreDuringBuilds: false,
  },

  // 開発サーバーのポート設定はpackage.jsonのdevスクリプトで指定
  // Next.jsのApp Routerを使用（デフォルト）

  /**
   * リバースプロキシ設定
   * フロントエンドの /api/* リクエストをバックエンドコンテナにプロキシする
   *
   * コンテナ内からバックエンドへのアクセス:
   * - コンテナ名: okegawaatclink-gaido-signia-output-system-backend
   * - ポート: 3002
   *
   * これにより、フロントエンドはCORSの問題なくバックエンドAPIにアクセスできる
   *
   * 注意: /api/auth/* はNextAuth.jsのAPIルートとして処理するため
   * バックエンドへのプロキシから除外する
   */
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL
      || 'http://okegawaatclink-gaido-signia-output-system-backend:3002';

    return [
      {
        // /api/auth/* はNextAuth.jsが処理するためプロキシしない（除外設定）
        // このルールより前にNextAuth.jsのルートがマッチするため、プロキシから除外される
        // /api/* のリクエストをバックエンドの /api/* にプロキシ
        // ただし /api/auth/* はNextAuth.jsのルートハンドラーが先にキャッチするため
        // 実際にはバックエンドにはプロキシされない
        source: '/api/:path((?!auth/).*)',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
