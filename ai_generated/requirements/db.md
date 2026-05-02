# ER図

## データベース: PostgreSQL

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
        varchar file_key "S3��ァイルキー（暗号化済み）"
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

## テーブル補足

### users テーブル
- `role` は `admin` / `author` / `fan` の3値
- 管理側（admin / author）は `password_hash` を使用（メール+パスワード認証）
- ファン（fan）は `oauth_provider` + `oauth_provider_id` を使用（ソーシャルログイン）

### signed_books テーブル
- サイン合成結果を管理。合成処理は非同期で実行される可能性があるため `status` を持つ
- `recipient_name` は個別サイン（宛名付き）の場合のみ使用

### book_access テーブル
- 外部システムからのAPI経由と、著者の手動付与の両方に対応
- `signed_book_id` はサイン合成完了後に紐づけ

### api_keys テーブル
- 外部システム連携APIの認証に使用
- システム管理者がAPI Keyを発行・管理
