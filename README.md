# Signia - 電子書籍サイン合成システム

## 概要

電子書籍に著者の手書きサインを合成して、ファンに個別に提供するSaaSシステム。著者がタブレット上で手書きしたサインを電子書籍の専用ページとして挿入し、各ファンに個別のサイン入り書籍を配付できます。

## 達成目標

- **MVP範囲**: 電子書籍登録・サイン登録・合成・閲覧の基本フローを実装
- **ビジネス価値**: 著者とファンの特別な繋がりを電子書籍で実現。物理的なサイン会の代替/補完
- **スケーラビリティ**: 中規模SaaS（～1,000人ユーザー）として、クラウドコストを抑えた設計

## システム構成

```mermaid
flowchart TB
    subgraph Client["クライアント"]
        FanBrowser["ファン用ブラウザ"]
        AuthorTablet["著者用タブレット"]
        AdminBrowser["管理者用ブラウザ"]
    end

    subgraph Frontend["フロントエンド（Next.js）"]
        FanApp["ファン向けUI"]
        AuthorApp["著者向けUI"]
        AdminApp["管理者向けUI"]
        Viewer["電子書籍ビューアー（pdf.js / epub.js）"]
        Canvas["手書きCanvas（サイン入力）"]
    end

    subgraph Backend["バックエンドAPI（Express.js）"]
        AuthModule["認証モジュール（OAuth 2.0 / OIDC）"]
        BookModule["電子書籍管理モジュール"]
        SignModule["サイン管理モジュール"]
        CompositeModule["サイン合成エンジン"]
        ExternalAPI["外部連携APIエンドポイント"]
    end

    subgraph Storage["ストレージ"]
        S3["S3互換ストレージ"]
        DB["PostgreSQL"]
    end

    subgraph External["外部サービス"]
        Google["Google OAuth"]
        Apple["Apple Sign In"]
        ExtSystem["外部購入システム"]
    end

    FanBrowser --> FanApp
    AuthorTablet --> AuthorApp
    AdminBrowser --> AdminApp

    FanApp --> Viewer
    AuthorApp --> Canvas

    FanApp --> AuthModule
    AuthorApp --> AuthModule
    AdminApp --> AuthModule

    FanApp --> BookModule
    AuthorApp --> BookModule
    AuthorApp --> SignModule
    AdminApp --> BookModule
    AdminApp --> SignModule

    Viewer --> BookModule
    Canvas --> SignModule

    SignModule --> CompositeModule
    CompositeModule --> BookModule

    BookModule --> S3
    SignModule --> S3
    CompositeModule --> S3

    AuthModule --> DB
    BookModule --> DB
    SignModule --> DB

    AuthModule --> Google
    AuthModule --> Apple
    ExtSystem --> ExternalAPI
    ExternalAPI --> BookModule
    ExternalAPI --> SignModule
```

## 画面フロー

```mermaid
stateDiagram-v2
    [*] --> F1_Landing: "アクセス"

    state "ファン向け" as FanFlow {
        F1_Landing --> F2_Login: "ログインボタン"
        F2_Login --> F3_Bookshelf: "ログイン成功"
        F3_Bookshelf --> F4_Reader: "書籍を選択"
        F4_Reader --> F3_Bookshelf: "戻る"
    }

    state "著者向け" as AuthorFlow {
        A1_AuthorLogin --> A2_BookList: "ログイン成功"
        A2_BookList --> A3_BookNew: "新規登録"
        A2_BookList --> A4_BookDetail: "書籍を選択"
        A3_BookNew --> A2_BookList: "登録完了"
        A4_BookDetail --> A2_BookList: "戻る"
        A2_BookList --> A5_SignList: "サイン管理へ"
        A5_SignList --> A6_SignNew: "新規作成"
        A5_SignList --> A7_SignDetail: "サインを選択"
        A6_SignNew --> A5_SignList: "作成完了"
        A7_SignDetail --> A5_SignList: "戻る"
        A5_SignList --> A8_Compose: "サイン合成へ"
        A8_Compose --> A2_BookList: "合成完了"
    }

    state "システム管理者向け" as AdminFlow {
        A1_AuthorLogin --> S1_Dashboard: "管理者ログイン成功"
        S1_Dashboard --> S2_Authors: "著者管理"
        S2_Authors --> S3_AuthorDetail: "著者を選択"
        S3_AuthorDetail --> S2_Authors: "戻る"
        S1_Dashboard --> S4_Books: "書籍管理"
        S4_Books --> S5_BookDetail: "書籍を選択"
        S5_BookDetail --> S4_Books: "戻る"
    }
```

## 画面詳細

### F1: ランディングページ

- **URL**: `/`

![ランディングページ](ai_generated/readme_screenshots/landing.png)

#### UI要素

| 要素 | 挙動 | 説明 |
|------|------|------|
| ロゴ | 表示のみ | サービスロゴ |
| ログインボタン | クリックでログイン画面へ遷移 | ファン向けログイン |
| ヘッダー | 表示のみ | サービス紹介 |
| 特徴セクション | 表示のみ | 個別サイン、安全な閲覧、かんたんアクセスの3要素を強調 |

#### 画面遷移条件
- ログインボタンをクリック → ログイン画面へ遷移

---

### F2: ログイン画面

- **URL**: `/login`

![ログイン画面](ai_generated/readme_screenshots/login.png)

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ロゴ | 表示のみ | - |
| Googleでログインボタン | クリックでGoogle OAuth認証を開始 | users.oauth_provider = 'google' |
| Apple IDでログインボタン | クリックでApple Sign In認証を開始 | users.oauth_provider = 'apple' |
| 利用規約リンク | クリックで別ウィンドウで利用規約を表示 | - |

#### 画面遷移条件
- Google/Apple認証成功 → 本棚（F3）へ遷移
- キャンセル → ランディングページ（F1）へ戻る

---

### F3: 本棚

- **URL**: `/bookshelf`

#### UI要素

| 要素 | 挙動 | DB対応（テーブル.カラム） |
|------|------|--------------------------|
| ヘッダー | 表示のみ | - |
| ユーザー名 | 表示のみ | users.name |
| ログアウトボタン | クリックでセッション終了、ランディングページへ遷移 | - |
| 書籍リスト | 表示のみ | book_access.fan_id でフィルタされた books |
| 表紙サムネイル | クリックで書籍ビューアー（F4）へ遷移 | books.cover_image_key |
| タイトル | クリックで書籍ビューアー（F4）へ遷移 | books.title |
| 著者名 | 表示のみ | users.name (books.author_id経由) |
| サイン種別 | 表示のみ | signed_books.recipient_name (null = 共通サイン) |

#### 画面遷移条件
- 書籍をクリック → 電子書籍ビューアー（F4）へ遷移
- ログアウトボタン → ランディングページ（F1）へ遷移

---

### F4: 電子書籍ビューアー

- **URL**: `/reader/:bookId`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| 戻るボタン | クリックで本棚（F3）へ遷移 | - |
| 書籍タイトル | 表示のみ | books.title |
| PDFビューアー | pdf.jsで렌더링（DRM保護） | signed_books.signed_file_key |
| EPUBビューアー | epub.jsで렌더링（DRM保護） | signed_books.signed_file_key |
| ページ送りボタン | 次/前ページに移動 | - |
| ズームボタン | ページをズーム | - |
| ページ番号表示 | 현재ページ / 全ページ数 | - |

#### 画面遷移条件
- 戻るボタン → 本棚（F3）へ遷移

---

### A1: 著者ログイン画面

- **URL**: `/admin/login`

![著者ログイン画面](ai_generated/readme_screenshots/admin_login.png)

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ロゴ | 表示のみ | - |
| メールアドレス入力 | テキスト入力 | users.email |
| パスワード入力 | パスワード入力 | users.password_hash |
| ログインボタン | クリックでメール+パスワード認証 | - |
| パスワード忘却リンク | クリックでパスワード再設定画面へ | - |

#### 画面遷移条件
- ログイン成功（著者） → 書籍一覧（A2）へ遷移
- ログイン成功（管理者） → 管理ダッシュボード（S1）へ遷移
- ログイン失敗 → エラーメッセージ表示

---

### A2: 書籍一覧

- **URL**: `/author/books`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| 「新しい書籍を登録」ボタン | クリックで書籍登録画面（A3）へ遷移 | - |
| 書籍リスト | テーブル表示 | books (author_id フィルタ) |
| タイトル | クリックで書籍詳細画面（A4）へ遷移 | books.title |
| フォーマット | 表示のみ | books.format (pdf / epub) |
| ファイルサイズ | 表示のみ | books.file_size |
| ページ数 | 表示のみ | books.page_count |
| ステータス | 表示のみ | books.status (draft / published / archived) |
| 削除ボタン | クリックで削除確認 → 削除実行 | DELETE books.id |
| サイン管理ボタン | クリックでサイン一覧（A5）へ遷移 | - |

#### 画面遷移条件
- 新規登録ボタン → 書籍登録画面（A3）へ遷移
- タイトルをクリック → 書籍詳細・編集画面（A4）へ遷移
- サイン管理ボタン → サイン一覧（A5）へ遷移
- ログアウト → ランディングページ（F1）へ遷移

---

### A3: 書籍登録

- **URL**: `/author/books/new`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| タイトル入力 | テキスト入力（必須、最大200文字） | books.title |
| 説明入力 | テキストエリア | books.description |
| ファイルアップロード | ドラッグ&ドロップでPDF/EPUBをアップロード（最大50MB） | books.file_key, books.file_size, books.format |
| 表紙画像アップロード | 画像ファイルをアップロード（オプション） | books.cover_image_key |
| ISBN入力 | テキスト入力（オプション） | books.metadata ->> 'isbn' |
| 登録ボタン | クリックで登録実行 | INSERT INTO books |
| キャンセルボタン | クリックで書籍一覧（A2）へ遷移 | - |

#### 画面遷移条件
- 登録成功 → 書籍一覧（A2）へ遷移
- キャンセル → 書籍一覧（A2）へ遷移

---

### A5: サイン一覧

- **URL**: `/author/signs`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| 「新しいサインを作成」ボタン | クリックでサイン作成画面（A6）へ遷移 | - |
| サインリスト | サムネイル表示 | signs (author_id フィルタ) |
| サイン画像 | クリックでサイン詳細・編集画面（A7）へ遷移 | signs.image_key |
| サイン名 | 表示のみ | signs.name |
| 種別 | 表示のみ | signs.type (common / individual) |
| 削除ボタン | クリックで削除確認 → 削除実行 | DELETE signs.id |
| サイン合成ボタン | クリックでサイン合成画面（A8）へ遷移 | - |

#### 画面遷移条件
- 新規作成ボタン → サイン作成画面（A6）へ遷移
- サイン画像をクリック → サイン詳細・編集画面（A7）へ遷移
- サイン合成ボタン → サイン合成画面（A8）へ遷移

---

### A6: サイン作成

- **URL**: `/author/signs/new`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| サイン名入力 | テキスト入力（必須、最大100文字） | signs.name |
| Canvas領域 | タブレット対応。ペンで手書き | signs.canvas_data |
| ペン太さスライダー | スライダーでペンの太さを調整 | - |
| 色パレット | クリックでペン色を選択 | - |
| やり直しボタン | 最後の描画ストロークを取消 | - |
| クリアボタン | Canvas全体をクリア | - |
| 種別選択 | ラジオボタンで「共通サイン」または「個別サイン」を選択 | signs.type |
| プレビュー表示 | Canvas内容を画像として表示 | - |
| 保存ボタン | クリックでサイン保存 | INSERT INTO signs |
| キャンセルボタン | クリックでサイン一覧（A5）へ遷移 | - |

#### 画面遷移条件
- 保存成功 → サイン一覧（A5）へ遷移
- キャンセル → サイン一覧（A5）へ遷移

---

### A8: サイン合成画面

- **URL**: `/author/compose`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| 書籍選択ドロップダウン | クリックで著者が登録した書籍一覧から選択 | books (author_id フィルタ) |
| サイン選択ドロップダウン | クリックで著者が作成したサイン一覧から選択 | signs (author_id フィルタ) |
| 合成モード選択 | ラジオボタンで「共通サイン（全員に適用）」または「個別サイン（宛名指定）」を選択 | signed_books.recipient_name |
| 宛名入力 | 個別サインの場合のみ表示。テキスト入力 | signed_books.recipient_name |
| 対象ファン選択 | 複数選択可。チェックボックスまたはマルチセレクト | book_access.fan_id |
| ファン検索フィルタ | テキスト入力でファン一覧を絞込 | users.name / users.email |
| 合成プレビュー | サインページのプレビュー表示 | - |
| 合成実行ボタン | クリックでサイン合成処理を開始 | INSERT INTO signed_books, UPDATE book_access |
| キャンセルボタン | クリックで書籍一覧（A2）へ遷移 | - |

#### 画面遷移条件
- 合成実行成功 → 結果表示「合成が完了しました」
- キャンセル → 書籍一覧（A2）へ遷移

---

### S1: 管理ダッシュボード

- **URL**: `/admin/dashboard`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| 統計情報パネル | 表示のみ | 総著者数、総書籍数、総ファン数、合成処理数 |
| 最近の操作ログ | 表示のみ | audit_logs (ORDER BY created_at DESC LIMIT 10) |
| 著者管理ボタン | クリックで著者管理画面（S2）へ遷移 | - |
| 書籍管理ボタン | クリックで書籍管理画面（S4）へ遷移 | - |

#### 画面遷移条件
- 著者管理ボタン → 著者管理画面（S2）へ遷移
- 書籍管理ボタン → 書籍管理画面（S4）へ遷移

---

### S2: 著者管理

- **URL**: `/admin/authors`

#### UI要素

| 要素 | 挙動 | DB対応 |
|------|------|--------|
| ナビゲーションメニュー | クリックで各ページへ遷移 | - |
| 「新しい著者を作成」ボタン | クリックで著者作成画面へ遷移 | - |
| 著者リスト | テーブル表示 | users (role = 'author') |
| メールアドレス | 表示のみ | users.email |
| 名前 | クリックで著者詳細画面（S3）へ遷移 | users.name |
| 登録日時 | 表示のみ | users.created_at |
| ステータス | 表示のみ | users.is_active (有効 / 無効) |
| 編集ボタン | クリックで著者詳細画面（S3）へ遷移 | - |
| 無効化ボタン | クリックで無効化確認 → 無効化実行 | UPDATE users.is_active = false |

#### 画面遷移条件
- 新規作成ボタン → 著者作成画面へ遷移
- 名前をクリック → 著者詳細画面（S3）へ遷移
- 編集ボタン → 著者詳細画面（S3）へ遷移

---

## ER図

```mermaid
erDiagram
    users {
        uuid id PK "ユーザーID"
        varchar email UK "メールアドレス"
        varchar name "表示名"
        varchar role "ロール: admin / author / fan"
        varchar password_hash "パスワードハッシュ（管理側のみ）"
        varchar oauth_provider "OAuthプロバイダー（fan: google / apple）"
        varchar oauth_provider_id "OAuthプロバイダーID"
        varchar avatar_url "アバターURL"
        boolean is_active "有効フラグ"
        timestamp created_at "作成日時"
        timestamp updated_at "更新日時"
    }

    books {
        uuid id PK "書籍ID"
        uuid author_id FK "著者ID"
        varchar title "書籍タイトル"
        text description "書籍説明"
        varchar format "ファイル形式: pdf / epub"
        varchar file_key "S3ファイルキー（暗号化済み）"
        varchar cover_image_key "表紙画像S3キー"
        bigint file_size "ファイルサイズ（bytes）"
        integer page_count "ページ数"
        varchar status "ステータス: draft / published / archived"
        jsonb metadata "メタデータ（ISBN等）"
        timestamp created_at "作成日時"
        timestamp updated_at "更新日時"
    }

    signs {
        uuid id PK "サインID"
        uuid author_id FK "著者ID"
        varchar name "サイン名（管理用）"
        varchar type "種別: common / individual"
        varchar image_key "サイン画像S3キー（PNG）"
        jsonb canvas_data "Canvas描画データ（JSON）"
        boolean is_default "デフォルトサインフラグ"
        timestamp created_at "作成日時"
        timestamp updated_at "更新日時"
    }

    signed_books {
        uuid id PK "サイン入り書籍ID"
        uuid book_id FK "元書籍ID"
        uuid sign_id FK "使用サインID"
        uuid fan_id FK "対象ファンID"
        varchar recipient_name "宛名（個別サインの場合）"
        varchar signed_file_key "サイン合成済みファイルS3キー"
        varchar status "ステータス: processing / completed / error"
        timestamp composed_at "合成日時"
        timestamp created_at "作成日時"
    }

    book_access {
        uuid id PK "アクセス権ID"
        uuid book_id FK "書籍ID"
        uuid fan_id FK "ファンID"
        uuid signed_book_id FK "サイン入り書籍ID（サイン合成済みの場合）"
        varchar granted_by "付与元: api / manual"
        varchar external_reference "外部システム参照ID"
        timestamp granted_at "付与日時"
        timestamp expires_at "有効期限（nullは無期限）"
    }

    audit_logs {
        uuid id PK "ログID"
        uuid user_id FK "操作ユーザーID"
        varchar action "操作種別"
        varchar resource_type "対象リソース種別"
        uuid resource_id "対象リソースID"
        jsonb details "詳細情報"
        varchar ip_address "IPアドレス"
        varchar user_agent "User-Agent"
        timestamp created_at "記録日時"
    }

    api_keys {
        uuid id PK "APIキーID"
        varchar key_hash UK "APIキーハッシュ"
        varchar name "キー名（管理用）"
        varchar description "説明"
        jsonb permissions "許可されたAPI操作"
        boolean is_active "有効フラグ"
        timestamp last_used_at "最終使用日時"
        timestamp expires_at "有効期限"
        timestamp created_at "作成日時"
    }

    users ||--o{ books : "著者が登録"
    users ||--o{ signs : "著者が作成"
    users ||--o{ book_access : "ファンがアクセス"
    users ||--o{ audit_logs : "ユーザーが操作"
    books ||--o{ signed_books : "元書籍"
    books ||--o{ book_access : "アクセス対象"
    signs ||--o{ signed_books : "使用サイン"
    users ||--o{ signed_books : "対象ファン"
    signed_books ||--o| book_access : "サイン入り書籍"
```

## ディレクトリ構成

```
output_system/
├── frontend/                  # フロントエンド（Next.js）
│   ├── public/
│   ├── src/
│   │   ├── app/              # Next.js App Router
│   │   │   ├── (auth)/       # 認証関連ページ
│   │   │   ├── (fan)/        # ファン向けページ
│   │   │   ├── (author)/     # 著者向けページ
│   │   │   ├── (admin)/      # 管理者向けページ
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/       # React コンポーネント
│   │   ├── lib/             # ユーティリティ関数
│   │   ├── styles/          # CSS/Tailwind
│   │   └── types/           # TypeScript型定義
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
├── backend/                  # バックエンド（Express.js）
│   ├── src/
│   │   ├── controllers/     # リクエストハンドラー
│   │   ├── services/        # ビジネスロジック
│   │   ├── routes/          # APIルーティング
│   │   ├── middleware/      # ミドルウェア
│   │   ├── db/
│   │   │   ├── migrations/  # DBマイグレーション
│   │   │   └── schema.prisma
│   │   ├── config/          # 設定ファイル
│   │   └── main.ts
│   ├── dist/                # コンパイル後
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker-compose.yml       # マルチコンテナ管理
├── Dockerfile               # フロントエンドコンテナ設定
├── .env.example            # 環境変数テンプレート
└── openapi.yaml            # API定義
```

## WebAPIエンドポイント一覧

### 認証API

| メソッド | エンドポイント | 説明 | 認証 |
|---------|---------------|------|------|
| POST | /api/auth/login | 管理側ログイン（メール+パスワード） | 不要 |
| POST | /api/auth/logout | ログアウト | 必要 |
| GET | /api/auth/me | 現在のユーザー情報取得 | 必要 |

### 書籍API

| メソッド | エンドポイント | 説明 | 認証/認可 |
|---------|---------------|------|-----------|
| GET | /api/books | 書籍一覧取得 | author: 自分の書籍, admin: 全書籍 |
| POST | /api/books | 書籍登録（ファイルアップロード） | author |
| GET | /api/books/:id | 書籍詳細取得 | author/admin |
| PUT | /api/books/:id | 書籍情報更新 | author（自分の書籍のみ） |
| DELETE | /api/books/:id | 書籍削除 | author（自分の書籍のみ）/admin |

### サインAPI

| メソッド | エンドポイント | 説明 | 認証/認可 |
|---------|---------------|------|-----------|
| GET | /api/signs | サイン一覧取得 | author: 自分のサイン |
| POST | /api/signs | サイン作成（画像+Canvas JSON） | author |
| GET | /api/signs/:id | サイン詳細取得 | author |
| PUT | /api/signs/:id | サイン更新 | author（自分のサインのみ） |
| DELETE | /api/signs/:id | サイン削除 | author（自分のサインのみ） |

### サイン合成API

| メソッド | エンドポイント | 説明 | 認証/認可 |
|---------|---------------|------|-----------|
| POST | /api/compose | サイン合成実行 | author |
| GET | /api/compose/:id | 合成結果取得 | author |

### ファン向けAPI

| メソッド | エンドポイント | 説明 | 認証/認可 |
|---------|---------------|------|-----------|
| GET | /api/fan/bookshelf | 本棚（自分の書籍一覧） | fan |
| GET | /api/fan/books/:id/read | 書籍閲覧URL取得（署名付きURL） | fan（自分の書籍のみ） |

### 管理者API

| メソッド | エンドポイント | 説明 | 認証/認可 |
|---------|---------------|------|-----------|
| GET | /api/admin/authors | 著者一覧取得 | admin |
| POST | /api/admin/authors | 著者アカウント作成 | admin |
| GET | /api/admin/authors/:id | 著者詳細取得 | admin |
| PUT | /api/admin/authors/:id | 著者情報更新 | admin |
| DELETE | /api/admin/authors/:id | 著者アカウント無効化 | admin |
| GET | /api/admin/stats | 統計情報取得 | admin |

### 外部連携API（外部システム → このシステム）

| メソッド | エンドポイント | 説明 | 認証 |
|---------|---------------|------|------|
| POST | /api/external/book-access | ファンに書籍アクセス権を付与 | API Key |
| DELETE | /api/external/book-access/:id | アクセス権を削除 | API Key |
| GET | /api/external/book-access | アクセス権一覧取得 | API Key |
| POST | /api/external/signs | サインデータ登録 | API Key |
| GET | /api/external/signs/:id | サインデータ取得 | API Key |

詳細は [openapi.yaml](./output_system/openapi.yaml) を参照。

## 起動方法

```bash
cd output_system
docker compose up -d
```

## アクセスURL

- **フロントエンド**: http://localhost:3005
- **バックエンドAPI**: http://localhost:3006

## 技術スタック

### フロントエンド

- **フレームワーク**: Next.js 14（App Router）
- **言語**: TypeScript
- **UI**: React
- **スタイリング**: Tailwind CSS
- **認証**: NextAuth.js（OAuth 2.0 / OIDC対応）
- **PDFビューアー**: pdf.js
- **EPUBビューアー**: epub.js
- **手書きCanvas**: Fabric.js

### バックエンド

- **フレームワーク**: Express.js
- **言語**: TypeScript
- **ORM**: Prisma
- **データベース**: PostgreSQL
- **ファイルストレージ**: S3互換（MinIO / AWS S3）
- **API認証**: JWT + API Key

### インフラ

- **コンテナ管理**: Docker / Docker Compose
- **データベース**: PostgreSQL 16
- **ファイルストレージ**: MinIO（S3互換）

## ライセンス

UNLICENSED
