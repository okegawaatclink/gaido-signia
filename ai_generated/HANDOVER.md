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
│   ├── .npmrc                  # min-release-age=7
│   ├── tsconfig.json
│   └── src/app/
│       ├── layout.tsx          # ルートレイアウト (lang="ja")
│       ├── page.tsx            # ランディングページ
│       └── globals.css
└── backend/
    ├── package.json            # Express + pg + node-pg-migrate
    ├── .npmrc                  # min-release-age=7
    ├── tsconfig.json           # コメント除去済み (node-pg-migrateがJSON.parseで読む)
    ├── tsconfig.migrate.json   # マイグレーション専用tsconfig
    ├── database.json           # node-pg-migrate設定
    └── src/
        ├── index.ts            # Expressサーバー (port 3002)
        ├── routes/index.ts     # /api/health エンドポイント
        ├── config/
        │   ├── auth.ts         # JWT設定
        │   ├── database.ts     # pg Pool
        │   └── storage.ts      # S3Client (MinIO用 forcePathStyle: true)
        ├── services/storage.service.ts  # バケット初期化・CRUD・署名URL
        ├── db/
        │   ├── migrations/     # 1000000000001_create_users.ts 〜 007
        │   └── seeds/index.ts  # 初期データ (admin/author ユーザー)
        └── utils/
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

- **AWS SDK v3 exact pin `3.693.0`**: `^3.693.0` でインストールすると最新版(3.1041.x)の巨大な依存ツリーでnpmがOOM終了する。厳格バージョン固定で回避。今後も `^` は付けない
- **node-pg-migrate のタイムスタンプ prefix**: `001_xxx.ts` ではなく `1000000000001_xxx.ts` 形式が必須。短い数値prefixだと認識されない
- **tsconfig.json コメント禁止**: node-pg-migrate が内部で `JSON.parse` を使ってtsconfig読み込みのため、JS形式コメント (`/* */`, `//`) を書くとパースエラー。コメントなしJSONのみ可
- **JSONB/varchar デフォルト値は `pgm.func()` 必須**: node-pg-migrate が文字列デフォルトをdollar-quotingする (`$pga$...$pga$`) とPostgreSQLがJSONBとして解釈できずエラー。`pgm.func("'{}'")`で生SQLリテラルとして渡す
- **マイグレーション `.d.ts` 除外**: TypeScriptビルド後に生成される宣言ファイルをnode-pg-migrateが拾って `Unexpected token 'export'` エラー。`--ignore-pattern '.*\.(d\.ts|d\.ts\.map|js\.map)'` で除外
- **ubuntu:24.04 ベースイメージ**: constraints.md 規約に従い、AI Agent containerと同一ベースイメージを使用

## はまりポイント

- **ポート競合**: `okegawaatclink-gaido-dataagent-output-system` コンテナが 3001/3002 を占有している場合、先にそのコンテナを停止する
- **npm ci はロックファイル必須**: `npm ci` はpackage-lock.jsonがないと失敗するため、Dockerfile変更前に `npm install` でロックファイルを生成しておく

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
