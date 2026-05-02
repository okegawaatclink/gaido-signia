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
│       │   ├── api.ts          # JWTトークン管理・apiRequest()/apiUploadRequest()ラッパー・Book型/Sign型
│       │   ├── auth.ts         # NextAuth.js設定 (Google/Apple Provider)
│       │   └── session-provider.tsx  # SessionProviderラッパー (Client Component)
│       └── app/
│           ├── (auth)/login/   # ログインページ (/login) - ソーシャル+メール統合
│           ├── (auth)/callback/ # OAuthコールバック処理ページ
│           ├── api/auth/[...nextauth]/ # NextAuth.js APIルートハンドラー
│           ├── bookshelf/      # 本棚ページ (ファンのログイン後リダイレクト先)
│           ├── admin/login/    # 管理者ログイン (/admin/login URL)
│           ├── admin/dashboard/ # 管理者ダッシュボード
│           ├── author/books/  # 著者書籍管理
│           │   ├── page.tsx        # 書籍一覧（削除機能付き）
│           │   └── new/page.tsx    # 書籍登録（ドラッグ&ドロップ・進捗バー付き）
│           └── author/signs/  # 著者サイン管理
│               ├── page.tsx        # サイン一覧（デフォルトバッジ・削除機能付き）
│               ├── new/page.tsx    # サイン作成（Canvas手書き・プレビュー・フォーム）
│               └── [signId]/page.tsx # サイン詳細・編集（再作成モード・削除確認）
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
        │   ├── index.ts        # /api/health + /api/auth + /api/books + /api/signs
        │   ├── auth.routes.ts  # POST /login /logout /oauth, GET /me
        │   ├── books.routes.ts # GET/POST /books, GET/PUT/DELETE /books/:id (multer 50MB)
        │   └── signs.routes.ts # GET/POST /signs, GET/PUT/DELETE /signs/:id (multer 10MB, PNG only, author role only)
        ├── controllers/
        │   ├── auth.controller.ts
        │   ├── oauth.controller.ts   # POST /api/auth/oauth
        │   ├── books.controller.ts   # 書籍CRUD・ファイルアップロード処理
        │   └── signs.controller.ts   # サインCRUD・multipart/form-dataパース
        ├── services/
        │   ├── auth.service.ts       # login/getMe (タイミング攻撃対策)
        │   ├── oauth.service.ts      # OAuthログイン/ファンアカウント作成
        │   ├── books.service.ts      # 書籍CRUD・S3アップロード・RBAC
        │   ├── signs.service.ts      # サインCRUD・PNG検証・S3アップロード・RBAC
        │   └── storage.service.ts    # S3/MinIO ファイル操作 (SSEオプション)
        └── models/
            ├── user.model.ts
            ├── book.model.ts         # 書籍モデル (CRUD・動的SET句)
            └── sign.model.ts         # サインモデル (CRUD・is_defaultトランザクション排他制御)
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
- **Jest 30でのカスタムErrorのinstanceof**: `.statusCode === 401` のようなプロパティ検証で代替。`.rejects.toThrow(NotFoundError)` は失敗する。`.rejects.toMatchObject({ statusCode: 404 })` を使うこと
- **AWS SDK v3 exact pin `3.693.0`**: `^` は付けない（OOMリスク）
- **Fabric.js v6とSSR非互換**: Fabric.jsはブラウザのCanvas APIを必要とするためSSR時にエラー。Next.jsでは `dynamic(() => import('./SignCanvas'), { ssr: false })` で動的インポートし、コンポーネント内でも `useEffect` 内で `await import('fabric')` する
- **SignCanvasのforwardRef**: 親コンポーネントから `getCanvasJSON()`, `getCanvasPNGBlob()`, `isEmpty()` を呼び出すため `forwardRef` + `useImperativeHandle` を使用
- **is_default排他制御**: 同一著者で複数のデフォルトサインが生まれないようPostgreSQLトランザクション内でCASEを使って他のサインのis_defaultをfalseに更新してからINSERT/UPDATEを実行
- **multer PNG専用フィルター**: サイン画像は透過PNGである必要があるためfileFilterでimage/png + .png拡張子のみ許可（BooksのPDF/EPUBとは別のmulterインスタンス）
- **サイン画像の表示方法**: `<img src="/api/signs/:id/image" />` はBearerトークンを送れないため401になる。JWTが必要なAPIエンドポイントの画像は `fetch(url, { headers: { Authorization: Bearer... } })` でBlobを取得し `URL.createObjectURL(blob)` でObjectURLを生成してimg.srcに渡す。アンマウント時に `URL.revokeObjectURL()` でメモリ解放必須
- **GET /:id/image エンドポイント**: S3署名付きURLへ302リダイレクト。`/:id` より前に定義しないとExpress の `:id` パラメータに `/image` が吸収される。signsルーターでは `/:id/image` を `/:id` の前に定義済み
- **isDefaultのmultipart文字列パース**: multipart/form-dataで送信される `isDefault` は `'true'/'false'` 文字列。コントローラーで `req.body.isDefault === 'true'` として明示的にbooleanに変換すること
- **タブレットでのスクロール抑止**: iPad Safariで描画中にページスクロールが発生する問題はCanvasラッパーdivに `{ passive: false }` でtouchmoveイベントリスナーを追加し `e.preventDefault()` することで解決
- **SignCanvas型安全性**: `@typescript-eslint/no-explicit-any` を使わずFabric.jsの動的importを型安全にするため `FabricCanvasInstance` / `FabricObject` インターフェースを定義し `as unknown as FabricCanvasInstance` でキャスト

## はまりポイント

- **ポート競合**: `okegawaatclink-gaido-dataagent-output-system` コンテナが 3001/3002 を占有している場合、先に停止
- **npm ci はロックファイル必須**: Dockerfile変更前に `npm install` でロックファイルを生成
- **auth.service.test.ts がDB接続**: `jest.mock('../../src/config/database')` と `jest.mock('../../src/models/user.model')` の両方が必要
- **callback page と useSearchParams**: Suspenseなしで `useSearchParams()` を使うとビルドエラー
- **MinIO KMS未設定エラー**: `storage.service.ts` で `ServerSideEncryption: options.serverSideEncryption || 'AES256'` とすると `undefined` を渡してもAES256が強制される。`||` ではなく `options.serverSideEncryption` をそのまま渡すこと
- **バックエンドコンテナへの新規ファイル反映**: `docker compose up -d` ではDockerイメージを再ビルドしない。新規TSファイルをコンテナに反映するには `docker compose build backend && docker compose up -d backend` を実行すること
- **Fabric.js UndoはCanvas Objectsをスタックで管理**: `canvas.getObjects()` はimmutableではないため、各描画操作後に `[...canvas.getObjects()]` でコピーをスタックに積む。Undoは最後のスナップショットとの差分（追加されたオブジェクト）を除去して前状態に戻す
- **NextAuth.js と `/api/auth/login` の競合**: `afterFiles` rewritesに `/api/auth/login` を入れても NextAuth.jsの `[...nextauth]` が先にマッチして400エラーになる。`beforeFiles` を使うこと
- **multer パッケージ未登録**: Dockerコンテナ内で `npm install multer` しても `package.json` が更新されない。ホスト側のディレクトリで `npm install multer @types/multer --save` を実行すること

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
- PBI #7: 管理者・著者のメール+パスワードログイン (JWT認証・bcrypt・RBAC・監査ログ・レートリミット)
- PBI #8: ファンのGoogle/Apple IDソーシャルログイン (NextAuth.js v5・OAuth 2.0・fanアカウント自動作成)
- PBI #9: 著者による電子書籍アップロード・登録 (multer + MinIO S3・RBAC・AES-256 SSEオプション・ドラッグ&ドロップUI)
- PBI #10: 著者が登録済み書籍を一覧・編集・削除できる (BookCard/BookListコンポーネント・書籍詳細編集画面・ステータス変更・確認ダイアログ付き削除)
- PBI #11: 著者がタブレットで手書きサインを作成・登録できる (Fabric.js v6 Canvas・SignCanvas/SignPreviewコンポーネント・サインCRUD API・PNG専用multer・is_default排他制御)
- PBI #12: 著者が作成済みサインを一覧・編集・削除できる (SignCardコンポーネント・サイン一覧/詳細・編集画面・JWT認証付き画像fetch・再作成モード・削除確認ダイアログ)
