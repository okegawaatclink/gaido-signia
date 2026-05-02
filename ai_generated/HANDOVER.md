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
│       │   ├── api.ts          # JWTトークン管理・apiRequest()/apiUploadRequest()ラッパー・Book/Sign/Fan/SignedBook型
│       │   ├── auth.ts         # NextAuth.js設定 (Google/Apple Provider)
│       │   └── session-provider.tsx  # SessionProviderラッパー (Client Component)
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Header.tsx      # ファン向けヘッダー (ロゴ・ユーザー名・ログアウト)
│       │   │   └── Footer.tsx      # フッター (利用規約・プライバシーポリシー)
│       │   ├── book/
│       │   │   ├── BookCard.tsx    # 著者向け書籍カード (ステータス・削除)
│       │   │   ├── BookList.tsx    # 書籍一覧
│       │   │   └── FanBookCard.tsx # ファン向け書籍カード (署名付きURL表紙・サイン種別・宛名)
│       │   └── sign/
│       │       └── SignComposer.tsx  # サイン合成プレビュー (A4比率・S3画像fetch・宛名表示)
│       └── app/
│           ├── (auth)/login/   # ログインページ (/login) - ソーシャル+メール統合
│           ├── (auth)/callback/ # OAuthコールバック処理ページ
│           ├── api/auth/[...nextauth]/ # NextAuth.js APIルートハンドラー
│           ├── bookshelf/      # 本棚ページ (書籍一覧・空状態・エラー処理、CSR)
│           ├── admin/login/    # 管理者ログイン (/admin/login URL)
│           ├── admin/dashboard/ # 管理者ダッシュボード
│           ├── author/books/  # 著者書籍管理
│           │   ├── page.tsx        # 書籍一覧（削除機能付き）
│           │   └── new/page.tsx    # 書籍登録（ドラッグ&ドロップ・進捗バー付き）
│           ├── author/signs/  # 著者サイン管理
│           │   ├── page.tsx        # サイン一覧（デフォルトバッジ・削除機能付き）
│           │   ├── new/page.tsx    # サイン作成（Canvas手書き・プレビュー・フォーム）
│           │   └── [signId]/page.tsx # サイン詳細・編集（再作成モード・削除確認）
│           └── author/compose/ # サイン合成
│               └── page.tsx        # 合成操作画面（書籍/サイン選択・ファン選択・共通/個別モード）
└── backend/
    ├── package.json            # Express + pg + node-pg-migrate + jest/ts-jest + pdf-lib + jszip
    ├── .npmrc                  # min-release-age=7
    ├── test/                   # ユニットテスト (jest + ts-jest) 130件
    │   ├── services/
    │   │   ├── auth.service.test.ts
    │   │   ├── oauth.service.test.ts  # OAuthサービスユニットテスト7件
    │   │   ├── books.service.test.ts  # 書籍サービスユニットテスト18件
    │   │   ├── pdf.service.test.ts    # PDFサイン合成ユニットテスト5件
    │   │   ├── epub.service.test.ts   # EPUBサイン合成ユニットテスト7件
    │   │   └── compose.service.test.ts # 合成サービスユニットテスト12件
    │   └── controllers/
    │       └── compose.controller.test.ts # 合成コントローラーユニットテスト7件
    └── src/
        ├── index.ts            # Expressサーバー (port 3002)
        ├── routes/
        │   ├── index.ts        # /api/health + /api/auth + /api/books + /api/signs + /api/compose + /api/fan
        │   ├── auth.routes.ts  # POST /login /logout /oauth, GET /me
        │   ├── books.routes.ts # GET/POST /books, GET/PUT/DELETE /books/:id, GET /books/:id/fans
        │   ├── signs.routes.ts # GET/POST /signs, GET/PUT/DELETE /signs/:id (multer 10MB, PNG only, author role only)
        │   ├── compose.routes.ts # POST /compose, GET /compose/:id (author role only)
│   └── fan.routes.ts   # GET /fan/bookshelf, GET /fan/books/:id/read (fan role only)
        ├── controllers/
        │   ├── auth.controller.ts
        │   ├── oauth.controller.ts   # POST /api/auth/oauth
        │   ├── books.controller.ts   # 書籍CRUD・ファイルアップロード処理・getBookFans
        │   ├── signs.controller.ts   # サインCRUD・multipart/form-dataパース
        │   ├── compose.controller.ts # 合成ジョブ実行・状態取得
│   └── fan.controller.ts   # 本棚取得・書籍閲覧URL取得
        ├── services/
        │   ├── auth.service.ts       # login/getMe (タイミング攻撃対策)
        │   ├── oauth.service.ts      # OAuthログイン/ファンアカウント作成
        │   ├── books.service.ts      # 書籍CRUD・S3アップロード・RBAC・getBookFans
        │   ├── signs.service.ts      # サインCRUD・PNG検証・S3アップロード・RBAC
        │   ├── storage.service.ts    # S3/MinIO ファイル操作 (SSEオプション)
        │   ├── pdf.service.ts        # PDFサイン合成 (pdf-lib・2ページ目挿入・画像埋込)
        │   ├── epub.service.ts       # EPUBサイン合成 (JSZip・OPF解析・spine先頭挿入)
        │   ├── compose.service.ts    # 合成オーケストレーション (S3DL→合成→S3UP→book_access付与)
│   └── fan.service.ts      # ファン向け本棚・書籍閲覧URL (book_access+books+signed_booksのJOIN)
        └── models/
            ├── user.model.ts
            ├── book.model.ts         # 書籍モデル (CRUD・動的SET句)
            ├── sign.model.ts         # サインモデル (CRUD・is_defaultトランザクション排他制御)
            └── signed-book.model.ts  # 合成済み書籍モデル (CRUD・signed_booksテーブル)
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
- **EPUBのOPF解析**: EPUB仕様ではcontainer.xmlにOPFパスが記載される。`META-INF/container.xml` の `<rootfile full-path="..."/>` からOPFパスを取得し、JSZipでfile(path).async('string')で読み込む。spine先頭挿入は `<spine...>` タグを正規表現でキャプチャして直後に`<itemref>`を挿入
- **book_access UNIQUEなしSELECT-then-INSERT**: `book_access`テーブルに(book_id,fan_id)のUNIQUE制約がないため、`ON CONFLICT DO UPDATE`は使用不可。SELECT→既存ならUPDATE、なければINSERTのパターン
- **合成エラーの分離**: ComposeServiceでファンごとの合成を個別try-catchでラップし、1ファンのエラーが他ファンの処理を止めない設計。successCount/errorCountを集計して返す
- **JSZip file()メソッドの型曖昧さ**: `file(path)` (読込) と `file(path, content)` (書込) は同名メソッド。ユニットテストでモックする際は引数の数 (content !== undefined) で read/write を区別する
- **Jest ClassのinstanceofがESModuleモックで失敗**: `jest.mock()`でクラスをモックするとprototypeチェーンが切れて`rejects.toThrow(SomeError)`がコンストラクタ比較で失敗する。`rejects.toThrow('エラーメッセージ文字列')`による文字列マッチに変更する
- **validationResult のTypeScript型キャスト**: express-validatorの`validationResult`はジェネリック型`ResultFactory<E>`を返すため`as jest.Mock`への直接キャストがコンパイルエラーになる。`as unknown as jest.Mock`の二段階キャストで回避

- **API Key認証パターン**: `authenticateApiKey` ミドルウェアで `X-API-Key` ヘッダーをSHA-256ハッシュ化してDBと照合。`req.apiKey` にキー情報をセット。JWTの `req.user` と同様のパターン
- **externalApiRateLimitの適用順序**: `authenticateApiKey` の後に `externalApiRateLimit` を適用することで `req.apiKey.id` をレート制限キーに使用できる。逆順ではIPベースになる
- **仮ユーザー登録パターン**: 外部APIでfanEmailが未登録の場合 `findOrCreateFanByEmail()` で fan ロールの仮アカウントを作成。password_hash・oauth情報は設定しない（OAuthログイン時に紐付け）
- **Base64画像バリデーション**: PNGマジックナンバー（`\x89PNG`）を最初の4バイトで確認。`data:image/png;base64,` プレフィックスは `replace(/^data:image\/\w+;base64,/, '')` で除去してからデコード
- **adminルーターへのAPIキー管理追加**: `POST/GET/DELETE /api/admin/api-keys` を既存の著者管理ルーターと同じ `admin.routes.ts` に追加。admin JWT認証 + adminOnly RBAC を適用
- **Jest 30での `expect.any(CustomError)` 失敗**: AppErrorを継承したカスタムエラーは `expect.any(CustomErrorClass)` で instanceof チェックが失敗する（Jest 30のモジュール境界の問題）。`error.statusCode === 404` のようなプロパティ検証で代替すること

- **著者管理: ConflictError (409) 追加**: メールアドレス重複時に409を返すため `utils/errors.ts` に `ConflictError` を追加。`AppError` の既存パターンに従うこと
- **著者無効化は論理削除**: `DELETE /api/admin/authors/:id` は is_active=false に変更するのみ（物理削除なし）。無効化された著者は `auth.service.ts` の is_active チェックでログイン拒否される
- **pdfjs-dist v5 RenderParameters**: v5ではRenderParametersに `canvas` フィールドが必須。`canvasContext` だけでは型エラーになる。`{ canvas, canvasContext: ctx, viewport }` で渡す
- **pdfjs-dist v5 WorkerSrc**: v5ではGlobalWorkerOptions.workerSrcはCDN URLを設定する（node_modules内のworkerはwebpackで直接参照できないため）
- **epub.js 動的インポート**: epub.jsはSSR非対応のため `import('epubjs').default` で動的インポートする。Book/Rendition型はoverloadのせいで `as unknown as EpubBook` でキャストが必要
- **ビューアーページのNext.js routing**: ファン向けビューアーは `(fan)/reader/[bookId]` の Route Groupに配置。URLは `/reader/[bookId]` になる
- **ランディングページSSG**: ランディングページ（`app/page.tsx`）はServer Componentとして実装しSSGで生成。Client Componentをimportする場合でも、イベントハンドラーを持つコンポーネントは `'use client'` を付けること
- **FooterのhoverはClient Component必須**: `onMouseEnter/onMouseLeave` イベントハンドラーはClient Componentでしか使えない。Server Componentのランディングページに使うFooterは `'use client'` が必要
- **FanBookCardのNext.js Image unoptimized**: MinIOの署名付きURLはドメインが動的に変わるため `unoptimized` プロパティを使用。`next.config.js` の `remotePatterns` に加えて `unoptimized` を設定することで外部URLを直接表示できる
- **本棚APIのJOINクエリ設計**: `book_access` をベースに `books`・`signed_books`・`signs` をLEFT JOINする。`fan_id = $1` インデックスを活用するため `WHERE ba.fan_id = $1` でフィルタすること
- **署名付きURL生成のPartial Failure**: 表紙画像の署名付きURL生成が失敗しても、書籍一覧全体が失敗しないよう個別try-catchで `null` を返す設計にすること

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
- **epub.service.test.ts JSZipモックのTupleエラー**: `fileMock.mock.calls.find(...)`で`call[1]`にアクセスするとTypeScriptが`Tuple type '[path: string]' of length '1'`と推論してエラー。モック実装内で`writtenFiles: Record<string, unknown>`マップに書き込みを記録するように設計変更することで回避
- **バックエンドコンテナへの新規ファイル反映**: `docker compose up -d` ではDockerイメージを再ビルドしない。新規TSファイルをコンテナに反映するには `docker compose build && docker compose up -d` を実行すること

## 実装済み機能
- PBI #6: 開発環境セットアップ (Next.js + Express + PostgreSQL + MinIO + Docker Compose)
- PBI #7: 管理者・著者のメール+パスワードログイン (JWT認証・bcrypt・RBAC・監査ログ・レートリミット)
- PBI #8: ファンのGoogle/Apple IDソーシャルログイン (NextAuth.js v5・OAuth 2.0・fanアカウント自動作成)
- PBI #9: 著者による電子書籍アップロード・登録 (multer + MinIO S3・RBAC・AES-256 SSEオプション・ドラッグ&ドロップUI)
- PBI #10: 著者が登録済み書籍を一覧・編集・削除できる (BookCard/BookListコンポーネント・書籍詳細編集画面・ステータス変更・確認ダイアログ付き削除)
- PBI #11: 著者がタブレットで手書きサインを作成・登録できる (Fabric.js v6 Canvas・SignCanvas/SignPreviewコンポーネント・サインCRUD API・PNG専用multer・is_default排他制御)
- PBI #12: 著者が作成済みサインを一覧・編集・削除できる (SignCardコンポーネント・サイン一覧/詳細・編集画面・JWT認証付き画像fetch・再作成モード・削除確認ダイアログ)
- PBI #13: 著者がサインを電子書籍に合成できる (pdf-lib PDF合成・JSZip EPUB合成・ComposeService・合成API・サイン合成画面・SignComposerプレビュー)
- PBI #14: ファンが本棚でサイン入り書籍一覧を確認できる (FanService・本棚API・ランディングページ・本棚画面・Header/Footer/FanBookCardコンポーネント)
- PBI #15: ファンがDRM保護付きで電子書籍を閲覧できる (pdfjs-dist v5 PDFビューアー・epub.js EPUBビューアー・署名付きURL15分・右クリック禁止・印刷制限・ビューアー画面)
- PBI #16: 管理者が著者アカウントを作成・管理できる (adminService・著者CRUD API・著者管理画面・Sidebar・ConflictError追加)
- PBI #17: 外部システムがAPIで書籍アクセス権を付与・サインを登録できる (API Key認証・レート制限・外部連携API CRUD・監査ログ・仮ユーザー登録)
- PBI #18: 管理者がダッシュボードで統計情報を確認できる (statsService・GET /api/admin/stats・GET /api/admin/books・GET /api/admin/books/:id・ダッシュボード統計カード・監査ログテーブル・書籍管理画面・書籍詳細画面)
