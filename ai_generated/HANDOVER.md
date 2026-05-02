# HANDOVER

## 技術スタック
- フロントエンド: Next.js 15.1.8 App Router, React 18, TypeScript strict mode
- バックエンド: Express.js 4.21.x, TypeScript, Winston logger, Morgan HTTP logger
- DB: PostgreSQL 16 + node-pg-migrate (タイムスタンプ prefix 命名規則)
- ストレージ: MinIO (S3互換) + AWS SDK v3 @3.693.0 (exact pin)
- 認証: JWT (jsonwebtoken) + bcryptjs
- インフラ: Docker Compose, ubuntu:24.04 base image

## ディレクトリ構成
```
output_system/
├── docker-compose.yml          # 4サービス統合 (frontend/backend/db/minio)
├── Dockerfile                  # フロントエンド用 (ubuntu:24.04 + Node.js 20 LTS)
├── Dockerfile.backend          # バックエンド用 (ubuntu:24.04 + Node.js 20 LTS)
├── frontend/
│   ├── package.json            # Next.js 15.1.8
│   ├── next.config.js          # /api/* → backendへのrewritesプロキシ
│   ├── .npmrc                  # min-release-age=7
│   └── src/
│       ├── lib/api.ts          # JWTトークン管理・apiRequest()ラッパー
│       └── app/
│           ├── (auth)/login/   # ログインページ (/login URL)
│           ├── admin/login/    # 管理者ログイン (/admin/login URL)
│           ├── admin/dashboard/ # 管理者ダッシュボード
│           └── author/books/  # 著者書籍管理
└── backend/
    ├── package.json            # Express + pg + node-pg-migrate + jest/ts-jest
    ├── .npmrc                  # min-release-age=7
    ├── tsconfig.json
    ├── test/                   # ユニットテスト (jest + ts-jest)
    │   ├── utils/crypto.test.ts
    │   ├── middleware/auth.middleware.test.ts
    │   ├── middleware/rbac.middleware.test.ts
    │   └── services/auth.service.test.ts
    └── src/
        ├── index.ts            # Expressサーバー (port 3002)
        ├── routes/
        │   ├── index.ts        # /api/health + /api/auth
        │   └── auth.routes.ts  # POST /login /logout, GET /me
        ├── controllers/auth.controller.ts
        ├── services/auth.service.ts  # login/getMe (タイミング攻撃対策)
        ├── models/user.model.ts
        ├── middleware/
        │   ├── auth.middleware.ts    # JWT認証 (必須・オプション)
        │   ├── rbac.middleware.ts    # RBACロール検証
        │   └── audit.middleware.ts  # 監査ログ記録
        ├── config/
        │   ├── auth.ts         # JWT設定
        │   ├── database.ts     # pg Pool
        │   └── storage.ts      # S3Client (MinIO用 forcePathStyle: true)
        ├── services/storage.service.ts  # バケット初期化・CRUD・署名URL
        ├── db/
        │   ├── migrations/     # 1000000000001_create_users.ts 〜 007
        │   └── seeds/index.ts  # 初期データ (admin/author ユーザー)
        └── utils/
            ├── crypto.ts       # hashPassword/verifyPassword/generateToken/verifyToken
            ├── errors.ts       # AppError カスタムエラー
            └── logger.ts       # Winston設定
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

- **NEXT_PUBLIC_API_URL=/api (相対パス)**: ブラウザからバックエンドへの直接アクセスは不可能（コンテナ名はブラウザから解決不可）。`/api/*` をNext.jsサーバーがrewritesでバックエンドにプロキシ転送する設計。NEXT_PUBLIC_*変数はビルド時埋め込みのためDockerfile ARGで設定
- **タイミング攻撃対策**: ユーザーが存在しない場合も必ず `bcrypt.compare(password, DUMMY_HASH)` を実行。これによりレスポンス時間でユーザー存在を推測できない
- **Jest 30でのカスタムErrorのinstanceof**: `expect.any(CustomError)` がJest 30で失敗する。`Object.setPrototypeOf()` でもinstanceof判定が通らない。`.statusCode === 401` のようなプロパティ検証で代替
- **(auth) Routeグループ**: `app/(auth)/login/` は `/login` URLにマッピング。`/admin/login` へのアクセスには `app/admin/login/page.tsx` を別途作成して再エクスポート
- **AWS SDK v3 exact pin `3.693.0`**: `^3.693.0` でインストールすると最新版(3.1041.x)の巨大な依存ツリーでnpmがOOM終了する。厳格バージョン固定で回避。今後も `^` は付けない
- **node-pg-migrate のタイムスタンプ prefix**: `001_xxx.ts` ではなく `1000000000001_xxx.ts` 形式が必須。短い数値prefixだと認識されない
- **tsconfig.json コメント禁止**: node-pg-migrate が内部で `JSON.parse` を使ってtsconfig読み込みのため、JS形式コメント (`/* */`, `//`) を書くとパースエラー。コメントなしJSONのみ可
- **JSONB/varchar デフォルト値は `pgm.func()` 必須**: node-pg-migrate が文字列デフォルトをdollar-quotingする (`$pga$...$pga$`) とPostgreSQLがJSONBとして解釈できずエラー。`pgm.func("'{}'")`で生SQLリテラルとして渡す
- **マイグレーション `.d.ts` 除外**: TypeScriptビルド後に生成される宣言ファイルをnode-pg-migrateが拾って `Unexpected token 'export'` エラー。`--ignore-pattern '.*\.(d\.ts|d\.ts\.map|js\.map)'` で除外
- **ubuntu:24.04 ベースイメージ**: constraints.md 規約に従い、AI Agent containerと同一ベースイメージを使用

## はまりポイント

- **ポート競合**: `okegawaatclink-gaido-dataagent-output-system` コンテナが 3001/3002 を占有している場合、先にそのコンテナを停止する
- **npm ci はロックファイル必須**: `npm ci` はpackage-lock.jsonがないと失敗するため、Dockerfile変更前に `npm install` でロックファイルを生成しておく
- **auth.service.test.ts がDB接続**: `jest.spyOn(UserModel, 'findByEmail')` だけではモジュールimport時にDB接続が発生。`jest.mock('../../src/config/database', ...)` と `jest.mock('../../src/models/user.model')` の両方が必要

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
- PBI #7: 管理者・著者のメール+パスワードログイン (JWT認証・bcrypt・RBAC・監査ログ・レートリミット)
