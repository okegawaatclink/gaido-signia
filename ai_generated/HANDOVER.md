# HANDOVER

## 技術スタック
- フロントエンド: Next.js 15.1.8 App Router, React 18, TypeScript strict mode, NextAuth.js v5 (beta)
- バックエンド: Express.js 4.21.x, TypeScript, Winston logger, Morgan HTTP logger
- DB: PostgreSQL 16 + node-pg-migrate (タイムスタンプ prefix 命名規則)
- ストレージ: MinIO (S3互換) + AWS SDK v3 @3.693.0 (exact pin)
- 認証: JWT (jsonwebtoken) + bcryptjs + NextAuth.js v5 (Google/Apple OAuth)
- インフラ: Docker Compose, ubuntu:24.04 base image

## ディレクトリ構成
```
output_system/
├── docker-compose.yml          # 4サービス統合 (frontend/backend/db/minio)
├── Dockerfile                  # フロントエンド用 (ubuntu:24.04 + Node.js 20 LTS)
├── Dockerfile.backend          # バックエンド用 (ubuntu:24.04 + Node.js 20 LTS)
├── frontend/
│   ├── package.json            # Next.js 15.1.8 + next-auth ^5.0.0-beta.31
│   ├── next.config.js          # /api/* → backend rewritesプロキシ (/api/auth/* 除外)
│   ├── .npmrc                  # min-release-age=7
│   └── src/
│       ├── lib/
│       │   ├── api.ts          # JWTトークン管理・apiRequest()ラッパー
│       │   ├── auth.ts         # NextAuth.js設定 (Google/Apple Provider)
│       │   └── session-provider.tsx  # SessionProviderラッパー (Client Component)
│       └── app/
│           ├── (auth)/login/   # ログインページ (/login) - ソーシャル+メール統合
│           ├── (auth)/callback/ # OAuthコールバック処理ページ
│           ├── api/auth/[...nextauth]/ # NextAuth.js APIルートハンドラー
│           ├── bookshelf/      # 本棚ページ (ファンのログイン後リダイレクト先)
│           ├── admin/login/    # 管理者ログイン (/admin/login URL)
│           ├── admin/dashboard/ # 管理者ダッシュボード
│           └── author/books/  # 著者書籍管理
└── backend/
    ├── package.json            # Express + pg + node-pg-migrate + jest/ts-jest
    ├── .npmrc                  # min-release-age=7
    ├── test/                   # ユニットテスト (jest + ts-jest)
    │   └── services/
    │       ├── auth.service.test.ts
    │       └── oauth.service.test.ts  # OAuthサービスユニットテスト7件
    └── src/
        ├── index.ts            # Expressサーバー (port 3002)
        ├── routes/
        │   ├── index.ts        # /api/health + /api/auth
        │   └── auth.routes.ts  # POST /login /logout /oauth, GET /me
        ├── controllers/
        │   ├── auth.controller.ts
        │   └── oauth.controller.ts   # POST /api/auth/oauth
        ├── services/
        │   ├── auth.service.ts       # login/getMe (タイミング攻撃対策)
        │   └── oauth.service.ts      # OAuthログイン/ファンアカウント作成
        └── models/user.model.ts
```

## ビルド・起動方法
```bash
cd output_system
docker compose up -d
# frontend: http://localhost:3001
# backend:  http://localhost:3002
# minio:    http://localhost:9001 (admin/minioadmin123)
```

## 設計判断

- **NextAuth.js v5 (beta)**: v4ではなくv5を採用。App Routerネイティブ対応でrouteハンドラーが `handlers` エクスポートのみで動作。v4の `[...nextauth].js` パターン不要
- **BACKEND_API_URL**: NextAuth.jsのsignInコールバックはサーバーサイドで実行されるため、バックエンドへのアクセスはコンテナ名（内部URL）を使用。NEXT_PUBLIC_API_URLとは別の環境変数が必要
- **OAuthユーザー識別**: oauth_provider + oauth_provider_idの複合キーでユーザーを識別。同一メールで別プロバイダーの場合はメールで検索してプロバイダー情報を更新（アカウント統合）
- **バックエンドJWT同期**: NextAuth.jsセッションとバックエンドJWTは別物。signInコールバックでバックエンドAPIを呼び出してバックエンドJWTを取得し、NextAuth.jsのJWTに格納する
- **SessionProvider**: App RouterのServer ComponentレイアウトからClient ComponentのSessionProviderを使うためにラッパーが必要。`src/lib/session-provider.tsx` を 'use client' で作成
- **useSearchParams() + Suspense**: App RouterでuseSearchParams()を使うコンポーネントはSuspenseでラップ必須。プリレンダリングエラー防止
- **next.config.js プロキシ除外**: `/api/auth/*` はNextAuth.jsが処理するためバックエンドへのプロキシから除外。正規表現 `/api/:path((?!auth/).*)` を使用
- **NEXT_PUBLIC_API_URL=/api (相対パス)**: ブラウザからバックエンドへの直接アクセスは不可能。`/api/*` をNext.jsサーバーがrewritesでバックエンドにプロキシ転送
- **タイミング攻撃対策**: ユーザーが存在しない場合も必ず `bcrypt.compare(password, DUMMY_HASH)` を実行
- **Jest 30でのカスタムErrorのinstanceof**: `.statusCode === 401` のようなプロパティ検証で代替
- **AWS SDK v3 exact pin `3.693.0`**: `^` は付けない（OOMリスク）

## はまりポイント

- **ポート競合**: `okegawaatclink-gaido-dataagent-output-system` コンテナが 3001/3002 を占有している場合、先に停止
- **npm ci はロックファイル必須**: Dockerfile変更前に `npm install` でロックファイルを生成
- **auth.service.test.ts がDB接続**: `jest.mock('../../src/config/database')` と `jest.mock('../../src/models/user.model')` の両方が必要
- **callback page と useSearchParams**: Suspenseなしで `useSearchParams()` を使うとビルドエラー

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
- PBI #7: 管理者・著者のメール+パスワードログイン (JWT認証・bcrypt・RBAC・監査ログ・レートリミット)
- PBI #8: ファンのGoogle/Apple IDソーシャルログイン (NextAuth.js v5・OAuth 2.0・fanアカウント自動作成)
