# ディレクトリ構成

```
output_system/
├── docker-compose.yml          # フロントエンド・バックエンド・DB・MinIO定義
├── Dockerfile                  # フロントエンド用
├── Dockerfile.backend          # バックエンド用
├── frontend/                   # Next.js フロントエンド
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── app/                # App Router
│   │   │   ├── layout.tsx      # ルートレイアウト
│   │   │   ├── page.tsx        # トップページ（ランディング）
│   │   │   ├── globals.css     # グローバルスタイル
│   │   │   ├── (auth)/         # 認証関連ページ
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── callback/
│   │   │   │       └── page.tsx
│   │   │   ├── (fan)/          # ファン向けページ
│   │   │   │   ├── bookshelf/
│   │   │   │   │   └── page.tsx  # 本棚（書籍一覧）
│   │   │   │   └── reader/
│   │   │   │       └── [bookId]/
│   │   │   │           └── page.tsx  # 電子書籍ビューアー
│   │   │   ├── (admin)/        # 管理者向けページ
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx  # 管理ダッシュボード
│   │   │   │   ├── authors/
│   │   │   │   │   ├── page.tsx  # 著者一覧
│   │   │   │   │   └── [authorId]/
│   │   │   │   │       └── page.tsx  # 著者詳細
│   │   │   │   └── books/
│   │   │   │       ├── page.tsx  # 書籍一覧（管理者）
│   │   │   │       └── [bookId]/
│   │   │   │           └── page.tsx  # 書籍詳細（管理者）
│   │   │   └── (author)/       # 著者向けページ
│   │   │       ├── books/
│   │   │       │   ├── page.tsx  # 自分の書籍一覧
│   │   │       │   ├── new/
│   │   │       │   │   └── page.tsx  # 書籍登録
│   │   │       │   └── [bookId]/
│   │   │       │       └── page.tsx  # 書籍詳細・編集
│   │   │       ├── signs/
│   │   │       │   ├── page.tsx  # サイン一覧
│   │   │       │   ├── new/
│   │   │       │   │   └── page.tsx  # サイン作成（Canvas手書き）
│   │   │       │   └── [signId]/
│   │   │       │       └── page.tsx  # サイン詳細・編集
│   │   │       └── compose/
│   │   │           └── page.tsx  # サイン合成画面
│   │   ├── components/         # 共通コンポーネント
│   │   │   ├── ui/             # UIプリミティブ
│   │   │   ├── layout/         # レイアウトコンポーネント
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Footer.tsx
│   │   │   ├── auth/           # 認証コンポーネント
│   │   │   │   └── LoginButton.tsx
│   │   │   ├── book/           # 書籍関連コンポーネント
│   │   │   │   ├── BookCard.tsx
│   │   │   │   ├── BookList.tsx
│   │   │   │   └── BookUpload.tsx
│   │   │   ├── sign/           # サイン関連コンポーネント
│   │   │   │   ├── SignCanvas.tsx   # 手書きCanvasコンポーネント
│   │   │   │   ├── SignPreview.tsx
│   │   │   │   └── SignComposer.tsx
│   │   │   └── reader/         # ビューアーコンポーネント
│   │   │       ├── PdfViewer.tsx
│   │   │       └── EpubViewer.tsx
│   │   ├── lib/                # ユーティリティ
│   │   │   ├── auth.ts         # NextAuth設定
│   │   │   ├── api.ts          # APIクライアント
│   │   │   └── constants.ts    # 定数
│   │   └── types/              # 型定義
│   │       └── index.ts
│   └── .env.local              # 環境変数（テンプレート）
├── backend/                    # Express.js バックエンドAPI
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # エントリーポイント
│   │   ├── config/
│   │   │   ├── database.ts     # DB接続設定
│   │   │   ├── storage.ts      # S3設定
│   │   │   └── auth.ts         # 認証設定
│   │   ├── routes/
│   │   │   ├── index.ts        # ルーター統合
│   │   │   ├── auth.routes.ts  # 認証ルート
│   │   │   ├── books.routes.ts # 書籍ルート
│   │   │   ├── signs.routes.ts # サインルート
│   │   │   ├── compose.routes.ts # 合成ルート
│   │   │   ├── admin.routes.ts # 管理者ルート
│   │   │   └── external.routes.ts # 外部連携APIルート
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── books.controller.ts
│   │   │   ├── signs.controller.ts
│   │   │   ├── compose.controller.ts
│   │   │   ├── admin.controller.ts
│   │   │   └── external.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── books.service.ts
│   │   │   ├── signs.service.ts
│   │   │   ├── compose.service.ts  # サイン合成ロジック
│   │   │   ├── storage.service.ts  # S3操作
│   │   │   └── pdf.service.ts      # PDF/EPUB処理
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── book.model.ts
│   │   │   ├── sign.model.ts
│   │   │   ├── book-access.model.ts
│   │   │   └── audit-log.model.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts    # 認証ミドルウェア
│   │   │   ├── rbac.middleware.ts    # RBAC
│   │   │   ├── rate-limit.middleware.ts # レート制限
│   │   │   ├── validation.middleware.ts # バリデーション
│   │   │   └── audit.middleware.ts   # 監査ログ
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── errors.ts
│   │   │   └── crypto.ts       # 暗号化ユーティリティ
│   │   └── db/
│   │       ├── migrations/     # DBマイグレーション
│   │       └── seeds/          # シードデータ
│   └── .env                    # 環境変数（テンプレート）
└── test/                       # E2Eテスト
    ├── playwright.config.ts
    └── e2e/
        ├── auth.spec.ts
        ├── bookshelf.spec.ts
        ├── reader.spec.ts
        ├── book-management.spec.ts
        ├── sign-management.spec.ts
        └── compose.spec.ts
```
