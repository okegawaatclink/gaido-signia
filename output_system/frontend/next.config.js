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
};

module.exports = nextConfig;
