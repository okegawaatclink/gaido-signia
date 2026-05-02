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
│   ├── next.config.js          # /api/* → backend rewritesプロキシ (beforeFiles/afterFiles分離)
│   ├── .npmrc                  # min-release-age=7
│   └── src/
│       ├── lib/
│       │   ├── api.ts          # JWTトークン管理・apiRequest()/apiUploadRequest()ラッパー・Book型
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
│               ├── page.tsx        # 書籍一覧（削除機能付き）
│               └── new/page.tsx    # 書籍登録（ドラッグ&ドロップ・進捗バー付き）
└── backend/
    ├── package.json            # Express + pg + node-pg-migrate + jest/ts-jest
    ├── .npmrc                  # min-release-age=7
    ├── test/                   # ユニットテスト (jest + ts-jest)
    │   └── services/
    │       ├── auth.service.test.ts
    │       ├── oauth.service.test.ts  # OAuthサービスユニットテスト7件
    │       └── books.service.test.ts  # 書籍サービスユニットテスト18件
    └── src/
        ├── index.ts            # Expressサーバー (port 3002)
        ├── routes/
        │   ├── index.ts        # /api/health + /api/auth + /api/books
        │   ├── auth.routes.ts  # POST /login /logout /oauth, GET /me
        │   └── books.routes.ts # GET/POST /books, GET/PUT/DELETE /books/:id (multer 50MB)
        ├── controllers/
        │   ├── auth.controller.ts
        │   ├── oauth.controller.ts   # POST /api/auth/oauth
        │   └── books.controller.ts   # 書籍CRUD・ファイルアップロード処理
        ├── services/
        │   ├── auth.service.ts       # login/getMe (タイミング攻撃対策)
        │   ├── oauth.service.ts      # OAuthログイン/ファンアカウント作成
        │   ├── books.service.ts      # 書籍CRUD・S3アップロード・RBAC
        │   └── storage.service.ts    # S3/MinIO ファイル操作 (SSEオプション)
        └── models/
            ├── user.model.ts
            └── book.model.ts         # 書籍モデル (CRUD・動的SET句)
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
- **beforeFiles rewritesでNextAuth.js競合を回避**: `/api/auth/login` 等をバックエンドにプロキシする際、`afterFiles`だと NextAuth.js の `[...nextauth]` ルートハンドラーが先にマッチしてしまう。`beforeFiles` でルートハンドラーより前に評価させることで回避
- **S3 SSEのオプトイン**: MinIOはデフォルトでKMS未設定のため `ServerSideEncryption: 'AES256'` を渡すと500エラー。`S3_ENABLE_SSE=true` 環境変数で明示的に有効化する方式とし、開発環境ではSSEを無効、本番AWS S3では有効にできる
- **multer メモリストレージ**: ファイルをディスクに書かず直接S3アップロード。`memoryStorage()` + `fileSize: 50MB` + `fileFilter`でPDF/EPUBのみ許可
- **ファイルバリデーション二重チェック**: クライアントサイドでMIMEタイプ+拡張子を検証し、サーバーサイドでも `validateBookFileFormat()` で再検証。拡張子偽装対策
- **アップロード進捗バー（シミュレーション）**: fetch APIはネイティブのアップロード進捗イベントを持たないため、`setInterval` で0→90%まで疑似的に進め、完了時に100%にする
- **books.service.ts SSE設定**: `getServerSideEncryption()` ヘルパーで `S3_ENABLE_SSE=true` のときのみ `'AES256'` を返し、それ以外は `undefined`（storage.service.ts側でundefinedなら省略）
- **タイミング攻撃対策**: ユーザーが存在しない場合も必ず `bcrypt.compare(password, DUMMY_HASH)` を実行
- **Jest 30でのカスタムErrorのinstanceof**: `.statusCode === 401` のようなプロパティ検証で代替
- **AWS SDK v3 exact pin `3.693.0`**: `^` は付けない（OOMリスク）

## はまりポイント

- **ポート競合**: `okegawaatclink-gaido-dataagent-output-system` コンテナが 3001/3002 を占有している場合、先に停止
- **npm ci はロックファイル必須**: Dockerfile変更前に `npm install` でロックファイルを生成
- **auth.service.test.ts がDB接続**: `jest.mock('../../src/config/database')` と `jest.mock('../../src/models/user.model')` の両方が必要
- **callback page と useSearchParams**: Suspenseなしで `useSearchParams()` を使うとビルドエラー
- **MinIO KMS未設定エラー**: `storage.service.ts` で `ServerSideEncryption: options.serverSideEncryption || 'AES256'` とすると `undefined` を渡してもAES256が強制される。`||` ではなく `options.serverSideEncryption` をそのまま渡すこと
- **NextAuth.js と `/api/auth/login` の競合**: `afterFiles` rewritesに `/api/auth/login` を入れても NextAuth.jsの `[...nextauth]` が先にマッチして400エラーになる。`beforeFiles` を使うこと
- **multer パッケージ未登録**: Dockerコンテナ内で `npm install multer` しても `package.json` が更新されない。ホスト側のディレクトリで `npm install multer @types/multer --save` を実行すること

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
- PBI #7: 管理者・著者のメール+パスワードログイン (JWT認証・bcrypt・RBAC・監査ログ・レートリミット)
- PBI #8: ファンのGoogle/Apple IDソーシャルログイン (NextAuth.js v5・OAuth 2.0・fanアカウント自動作成)
- PBI #9: 著者による電子書籍アップロード・登録 (multer + MinIO S3・RBAC・AES-256 SSEオプション・ドラッグ&ドロップUI)
