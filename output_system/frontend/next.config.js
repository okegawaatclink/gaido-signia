/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript設定: ビルドエラーを有効にする（本番ビルドで型エラーを検出）
  typescript: {
    ignoreBuildErrors: false,
  },

  /**
   * 外部画像の許可設定
   *
   * MinIOの署名付きURLからの画像（表紙サムネイル等）をNext.js Imageコンポーネントで
   * 最適化表示するために設定。
   *
   * 開発環境（localhost:9000）と本番環境の両方を許可する。
   * FanBookCard.tsxでは unoptimized プロパティを使用して署名付きURLをそのまま表示する。
   */
  images: {
    remotePatterns: [
      {
        // MinIO開発環境（localhost経由）
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
      {
        // MinIOコンテナ内アクセス（Docker Composeネットワーク）
        protocol: 'http',
        hostname: 'minio',
        port: '9000',
        pathname: '/**',
      },
    ],
    // 外部ドメインからの画像は unoptimized で直接取得する
    // （署名付きURLは外部URLのため、Next.jsの画像最適化APIを通すとURLが変わる）
    dangerouslyAllowSVG: false,
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

    return {
      // beforeFiles: Next.jsのルートハンドラーより前に評価されるrewrite
      // /api/auth/[...nextauth] (NextAuth.js) より先にバックエンドAPIエンドポイントをプロキシする
      beforeFiles: [
        // バックエンドの認証APIエンドポイントを明示的にプロキシする
        // /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/oauth はバックエンドに転送
        // Note: beforeFilesを使うことでNextAuth.jsのルートハンドラーより先にマッチさせる
        { source: '/api/auth/login', destination: `${backendUrl}/api/auth/login` },
        { source: '/api/auth/logout', destination: `${backendUrl}/api/auth/logout` },
        { source: '/api/auth/me', destination: `${backendUrl}/api/auth/me` },
        { source: '/api/auth/oauth', destination: `${backendUrl}/api/auth/oauth` },
      ],
      // afterFiles: /api/auth/* 以外の全APIをバックエンドにプロキシ
      afterFiles: [
        {
          // /api/auth/[...nextauth] はNextAuth.jsが処理するためプロキシ除外
          // それ以外の /api/* はバックエンドにプロキシ
          source: '/api/:path((?!auth/).*)',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
