# 画面一覧・遷移図

## 画面一覧

### ファン向け画面

| # | 画面名 | URL | 説明 |
|---|--------|-----|------|
| F1 | ランディングページ | / | サービス紹介・ログインボタン |
| F2 | ログイン画面 | /login | ソーシャルログイン（Google / Apple） |
| F3 | 本棚 | /bookshelf | サイン入り書籍のシンプルなリスト表示 |
| F4 | 電子書籍ビューアー | /reader/:bookId | PDF/EPUB閲覧（DRM保護付き） |

### 著者向け画面

| # | 画面名 | URL | 説明 |
|---|--------|-----|------|
| A1 | 著者ログイン画面 | /admin/login | メール+パスワード認証 |
| A2 | 書籍一覧 | /author/books | 自分の登録書籍一覧 |
| A3 | 書籍登録 | /author/books/new | PDF/EPUBアップロード・メタデータ入力 |
| A4 | 書籍詳細・編集 | /author/books/:bookId | 書籍情報の表示・編集・削除 |
| A5 | サイン一覧 | /author/signs | 作成済みサインの一覧 |
| A6 | サイン作成 | /author/signs/new | タブレット手書きCanvasでサイン作成 |
| A7 | サイン詳細・編集 | /author/signs/:signId | サイン表示・再作成 |
| A8 | サイン合成画面 | /author/compose | 書籍・サイン・ファン選択 → 合成実行 |

### システム管理者向け画面

| # | 画面名 | URL | 説明 |
|---|--------|-----|------|
| S1 | 管理ダッシュボード | /admin/dashboard | 統計情報・最近の操作 |
| S2 | 著者管理 | /admin/authors | 著者アカウント一覧・作成・編集 |
| S3 | 著者詳細 | /admin/authors/:authorId | 著者情報詳細・書籍一覧 |
| S4 | 書籍管理 | /admin/books | 全書籍一覧・検索 |
| S5 | 書籍詳細 | /admin/books/:bookId | 書籍情報詳細 |

## 画面遷移図

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

## 画面ワイヤーフレーム

### F1: ランディングページ

```mermaid
flowchart TB
    subgraph F1["F1: ランディングページ"]
        direction TB
        Header["ヘッダー: ロゴ | ログインボタン"]
        Hero["ヒーローセクション: サービス紹介<br>「あなただけの特別なサイン入り電子書籍」"]
        Features["特徴セクション: 3カラム<br>個別サイン | 安全な閲覧 | かんたんアクセス"]
        CTA["CTAボタン: 「ログインして本棚を見る」"]
        FooterF1["フッター: 利用規約 | プライバシーポリシー"]
    end
```

### F2: ログイン画面

```mermaid
flowchart TB
    subgraph F2["F2: ログイン画面"]
        direction TB
        Logo["ロゴ"]
        Title["「ログイン」"]
        GoogleBtn["Googleでログイン ボタン"]
        AppleBtn["Apple IDでログイン ボタン"]
        FooterF2["利用規約へのリンク"]
    end
```

### F3: 本棚

```mermaid
flowchart TB
    subgraph F3["F3: 本棚"]
        direction TB
        HeaderF3["ヘッダー: ロゴ | ユーザー名 | ログアウト"]
        TitleF3["「あなたの本棚」"]
        BookList["書籍リスト（シンプル）:<br>表紙サムネイル | タイトル | 著者名 | サイン種別"]
        EmptyState["書籍がない場合: 「まだ書籍がありません」"]
    end
```

### F4: 電子書籍ビューアー

```mermaid
flowchart TB
    subgraph F4["F4: 電子書籍ビューアー"]
        direction TB
        ViewerHeader["ヘッダー: 戻るボタン | 書籍タイトル"]
        ViewerArea["ビューアー領域（pdf.js / epub.js）<br>ページ送り | ズーム | 目次"]
        ViewerFooter["フッター: ページ番号 / 全ページ数"]
    end
```

### A3: 書籍登録

```mermaid
flowchart TB
    subgraph A3["A3: 書籍登録"]
        direction TB
        HeaderA3["ヘッダー: ナビゲーション"]
        TitleA3["「新しい書籍を登録」"]
        FormTitle["タイトル入力フィールド"]
        FormDesc["説明入力フィールド（テキストエリア）"]
        FormFile["ファイルアップロード（PDF/EPUB、最大50MB）<br>ドラッグ&ドロップ対応"]
        FormCover["表紙画像アップロード（オプション）"]
        FormMeta["メタデータ入力（ISBN等、オプション）"]
        SubmitBtn["「登録する」ボタン"]
    end
```

### A6: サイン作成

```mermaid
flowchart TB
    subgraph A6["A6: サイン作成"]
        direction TB
        HeaderA6["ヘッダー: ナビゲーション"]
        TitleA6["「新しいサインを作成」"]
        SignName["サイン名入力フィールド"]
        CanvasArea["手書きCanvas領域（タブレット対応）<br>ペン太さ | 色選択 | やり直し | クリア"]
        SignType["種別選択: 共通サイン / 個別サイン"]
        Preview["プレビュー表示"]
        SaveBtn["「保存する」ボタン"]
    end
```

### A8: サイン合成画面

```mermaid
flowchart TB
    subgraph A8["A8: サイン合成画面"]
        direction TB
        HeaderA8["ヘッダー: ナビゲーション"]
        TitleA8["「サインを合成」"]
        BookSelect["書籍選択ドロップダウン"]
        SignSelect["サイン選択ドロップダウン"]
        ModeSelect["合成モード: 共通サイン（全員に適用）/ 個別サイン（宛名指定）"]
        RecipientInput["宛名入力（個別サインの場合）"]
        FanSelect["対象ファン選択（検索・フィルタ付き）"]
        PreviewArea["合成プレビュー（サインページのプレビュー表示）"]
        ComposeBtn["「合成を実行」ボタン"]
        ResultArea["合成結果: 成功/失敗 表示"]
    end
```
