# WebAPI一覧

## 内部API（フロントエンド → バックエンド）

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

## 外部連携API（外部システム → このシステム）

### 電子書籍ーユーザー紐づけAPI

| メソッド | エンドポイント | 説明 | 認証 |
|---------|---------------|------|------|
| POST | /api/external/book-access | ファンに書籍アクセス権を付与 | API Key |
| DELETE | /api/external/book-access/:id | アクセス権を削除 | API Key |
| GET | /api/external/book-access | アクセス権一覧取得 | API Key |

### サインデータ登録API

| メソッド | エンドポイント | 説明 | 認証 |
|---------|---------------|------|------|
| POST | /api/external/signs | サインデータ登録 | API Key |
| GET | /api/external/signs/:id | サインデータ取得 | API Key |

## OpenAPI定義

```yaml
openapi: 3.0.3
info:
  title: E-Book Signing System API
  version: 1.0.0
  description: 電子書籍サイン合成システムのAPI定義

servers:
  - url: /api
    description: APIサーバー

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    Book:
      type: object
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          maxLength: 200
        description:
          type: string
        format:
          type: string
          enum: [pdf, epub]
        authorId:
          type: string
          format: uuid
        coverImageUrl:
          type: string
          format: uri
        fileSize:
          type: integer
        pageCount:
          type: integer
        status:
          type: string
          enum: [draft, published, archived]
        createdAt:
          type: string
          format: date-time
      required: [id, title, format, authorId, status]

    Sign:
      type: object
      properties:
        id:
          type: string
          format: uuid
        authorId:
          type: string
          format: uuid
        name:
          type: string
          maxLength: 100
        type:
          type: string
          enum: [common, individual]
        imageUrl:
          type: string
          format: uri
        isDefault:
          type: boolean
        createdAt:
          type: string
          format: date-time
      required: [id, authorId, name, type]

    SignedBook:
      type: object
      properties:
        id:
          type: string
          format: uuid
        bookId:
          type: string
          format: uuid
        signId:
          type: string
          format: uuid
        fanId:
          type: string
          format: uuid
        recipientName:
          type: string
        status:
          type: string
          enum: [processing, completed, error]
        composedAt:
          type: string
          format: date-time
      required: [id, bookId, signId, fanId, status]

    BookAccess:
      type: object
      properties:
        id:
          type: string
          format: uuid
        bookId:
          type: string
          format: uuid
        fanId:
          type: string
          format: uuid
        signedBookId:
          type: string
          format: uuid
          nullable: true
        grantedBy:
          type: string
          enum: [api, manual]
        externalReference:
          type: string
        grantedAt:
          type: string
          format: date-time
      required: [id, bookId, fanId, grantedBy]

    ComposeRequest:
      type: object
      properties:
        bookId:
          type: string
          format: uuid
        signId:
          type: string
          format: uuid
        fanIds:
          type: array
          items:
            type: string
            format: uuid
        recipientName:
          type: string
          description: "宛名（個別サインの場合）"
      required: [bookId, signId, fanIds]

    ExternalBookAccessRequest:
      type: object
      properties:
        bookId:
          type: string
          format: uuid
        fanEmail:
          type: string
          format: email
        externalReference:
          type: string
      required: [bookId, fanEmail]

    ExternalSignRequest:
      type: object
      properties:
        authorId:
          type: string
          format: uuid
        name:
          type: string
        type:
          type: string
          enum: [common, individual]
        imageBase64:
          type: string
          format: byte
      required: [authorId, name, type, imageBase64]

    Error:
      type: object
      properties:
        error:
          type: string
        message:
          type: string
        statusCode:
          type: integer

paths:
  /external/book-access:
    post:
      summary: "ファンに書籍アクセス権を付与"
      security:
        - apiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ExternalBookAccessRequest"
      responses:
        "201":
          description: "アクセス権付与成功"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BookAccess"
        "400":
          description: "リクエスト不正"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
        "401":
          description: "認証失敗"
        "404":
          description: "書籍が見つからない"

  /external/signs:
    post:
      summary: "サインデータ登録"
      security:
        - apiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ExternalSignRequest"
      responses:
        "201":
          description: "サイン登録成功"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Sign"
        "400":
          description: "リクエスト不正"
        "401":
          description: "認証失敗"

  /compose:
    post:
      summary: "サイン合成実行"
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ComposeRequest"
      responses:
        "202":
          description: "合成処理開始"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SignedBook"
        "400":
          description: "リクエスト不正"
        "401":
          description: "認証失敗"
        "403":
          description: "権限不足"

  /fan/bookshelf:
    get:
      summary: "本棚（自分の書籍一覧）"
      security:
        - bearerAuth: []
      responses:
        "200":
          description: "書籍一覧"
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    book:
                      $ref: "#/components/schemas/Book"
                    signedBook:
                      $ref: "#/components/schemas/SignedBook"
                    access:
                      $ref: "#/components/schemas/BookAccess"

  /fan/books/{id}/read:
    get:
      summary: "書籍閲覧URL取得"
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: "署名付きURL"
          content:
            application/json:
              schema:
                type: object
                properties:
                  url:
                    type: string
                    format: uri
                  expiresAt:
                    type: string
                    format: date-time
        "403":
          description: "アクセス権なし"
        "404":
          description: "書籍が見つからない"
```
