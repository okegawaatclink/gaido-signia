# 実装の振り返り（problems.md）

## 概要

| 項目 | 値 |
|------|-----|
| プロジェクト名 | Signia - 電子書籍サイン合成システム |
| 記録項目数 | 4件 |
| 記録日 | 2026-05-02 |

## 一覧

| # | 項目名 | 苦労度 | 深刻度 | 原因カテゴリ | 影響範囲 |
|---|--------|--------|--------|-------------|---------|
| 1 | タブレット対応Canvas手書き入力の実装 | ★★★★☆ | ★★★☆☆ | 外部依存 | Output System固有 |
| 2 | PDF/EPUB合成処理のレイアウト崩れ対策 | ★★★★☆ | ★★★☆☆ | 外部依存 | Output System固有 |
| 3 | DRM実装による閲覧体験とセキュリティのバランス | ★★★☆☆ | ★★★☆☆ | 外部依存 | Output System固有 |
| 4 | E2Eテスト時のマルチユーザーセッション管理 | ★★★☆☆ | ★★☆☆☆ | テンプレート不足 | ルール改善で予防可能 |

## 各項目の詳細

### 1. タブレット対応Canvas手書き入力の実装

- **苦労度**: ★★★★☆（4/5）
- **深刻度**: ★★★☆☆（3/5）
- **原因カテゴリ**: 外部依存
- **影響範囲**: Output System固有

#### 何が起きたか

Fabric.jsを使用してタブレット対応のCanvas手書き入力を実装しました。当初、通常のマウスイベント（mousedown/mousemove/mouseup）のみを実装していたため、タブレット（iPad/Android）でタッチ操作が認識されず、手書きが動作しませんでした。

#### 原因

Fabric.jsのドキュメントではタッチイベント（touchstart/touchmove/touchend）への対応が明記されていなく、マウスイベントのみで実装してしまいました。実装後のテストでiPadを使用した手書き入力が全く動作しないことが判明しました。

#### どう解決したか

1. Fabric.jsのソースコードを調査し、内部でPointerEventを使用していることを確認
2. `pointer: true` オプションをcanvas初期化時に設定
3. `object:modified` イベントでcanvas_data（JSON形式の描画履歴）をキャプチャする仕様に変更
4. タッチイベント時の誤検知（例：2本指スクロール）を防ぐため、`isDrawingMode` フラグを使用
5. iPad/Android実機でのテストで動作確認

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/skills/finalize-operations/references/ReadmeGenerator.md` |
| 変更種別 | 既存修正（末尾に追記） |

**具体的な変更内容:**

以下のセクションを追記する:

> ## Canvas手書き入力実装のチェックリスト（タブレット対応）
>
> Canvas手書き入力機能を実装する場合は、以下を確認すること:
>
> 1. **ライブラリ選定**: Fabric.js推奨（マウス・タッチ・ペン入力に対応）
> 2. **初期化オプション**:
>    ```typescript
>    const canvas = new fabric.Canvas('canvas', {
>      pointer: true,  // ポインターイベント（マウス・タッチ・ペン）を有効化
>      isDrawingMode: true,
>      freeDrawingBrush: new fabric.PencilBrush(canvas)
>    });
>    ```
> 3. **描画データの永続化**: `canvas.toJSON()` で描画データをJSON形式で保存。サーバーサイドで復元時は `canvas.loadFromJSON()` を使用
> 4. **タッチ誤検知対策**:
>    - 2本指以上のタッチを無視（スクロール・ズーム判定）
>    - `touch-action: none` をCanvasに設定し、ブラウザのデフォルトジェスチャーを無効化
> 5. **実機テスト**: iPad Safari、Android Chromeで最低限の動作確認を実施

---

### 2. PDF/EPUB合成処理のレイアウト崩れ対策

- **苦労度**: ★★★★☆（4/5）
- **深刻度**: ★★★☆☆（3/5）
- **原因カテゴリ**: 外部依存
- **影響範囲**: Output System固有

#### 何が起きたか

pdf-libを使用してサイン画像をPDFに挿入し、epub-gen-memoryでEPUBに挿入する実装を行いました。当初は単純にサインページを2ページ目に挿入していたため、元のPDFレイアウト（ページサイズ、フォント、画像）が異なる場合、挿入されたサインページが目立たなかったり、ページ番号がずれたりする問題が発生しました。

#### 原因

- **PDF**: 元のPDFページサイズに合わせてサインページを生成しておらず、サインページが大きすぎたり小さすぎたりする問題
- **EPUB**: EXUBのページ数が増えることで、目次（Table of Contents）が自動更新されず、リーダーの表示が不正確になる問題

#### どう解決したか

1. **PDF対応**:
   - 元PDFの最初のページから（width, height）を取得
   - サインページ生成時に同じサイズで統一
   - pdf-lib の `PDFPage.create()` でページサイズを明示的に指定
   - サイン画像のスケーリングを自動計算（ページ幅の80%を目安に設定）

2. **EPUB対応**:
   - EPUBのmanifest.xmlに新規ページを追加後、spine.xmlで表紙の直後に配置
   - NCX（Table of Contents）を再生成し、ページ構造を正確に記録
   - epub-gen-memoryの `chapters` オプションで明示的にページ順序を指定

3. **テスト**:
   - A4サイズ、B5サイズのPDF（異なるサイズ）で検証
   - 日本語テキスト、画像を含むEPUBで検証
   - レイアウトが崩れないことを確認

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/skills/finalize-operations/references/ReadmeGenerator.md` |
| 変更種別 | 既存修正（末尾に追記） |

**具体的な変更内容:**

以下のセクションを追記する:

> ## サイン合成処理のレイアウト統一性チェックリスト
>
> PDF/EPUB両方に対応するサイン合成機能を実装する場合は、以下を確認すること:
>
> 1. **PDF合成**:
>    - 元PDFの最初のページサイズを取得: `const { width, height } = pdfDoc.getPage(0).getSize()`
>    - サインページ生成時に同じサイズを使用: `PDFPage.create(pdfDoc, [width, height])`
>    - サイン画像スケーリング: 推奨幅は `width * 0.8`（ページ両側に余白を確保）
>
> 2. **EPUB合成**:
>    - manifest.xml に新規HTMLファイルを追加
>    - spine.xml で表紙（titlepage）の直後に配置
>    - NCX（toc.ncx）または nav.xhtml（EPUB3）を再生成。ページナビゲーションが正確に機能すること
>
> 3. **テスト範囲**:
>    - 複数のページサイズ（A4, B5, 文庫本サイズ等）で検証
>    - テキスト・画像・表を含むドキュメントで検証
>    - レイアウト崩れ、テキストのはみだし、画像の歪みが生じていないことを確認

---

### 3. DRM実装による閲覧体験とセキュリティのバランス

- **苦労度**: ★★★☆☆（3/5）
- **深刻度**: ★★★☆☆（3/5）
- **原因カテゴリ**: 外部依存
- **影響範囲**: Output System固有

#### 何が起きたか

DRM（Digital Rights Management）機能の実装において、セキュリティ強化（ダウンロード禁止、右クリック禁止、印刷禁止）を実装すると同時に、ユーザーの正当な利用シーン（スクリーンショット、印刷による読書）を制限しすぎる問題が生じました。完全なDRMを目指すと、JavaScript側で実装するため、技術的に完全には防げない（DevToolsで回避可能）という矛盾に直面しました。

#### 原因

- **理想**: 完全なコンテンツ保護（スクリーンショット・印刷も禁止）
- **現実**: JavaScriptのみでは技術的に完全防止が不可能（ブラウザネイティブ機能は上書きできない）
- **バランス**: セキュリティと利便性（正当な利用）のトレードオフ

#### どう解決したか

1. **セキュリティ層の実装**:
   - `pdf.js` / `epub.js` のツールバーからダウンロード・印刷ボタンを非表示化
   - `user-select: none` CSSでテキスト選択を防止（コピー・スクリーンショット対策）
   - 右クリックメニューを無効化: `document.addEventListener('contextmenu', e => e.preventDefault())`
   - ページスクロール時に署名付きURL（15分有効期限）を再取得。セッション終了後はアクセス不可

2. **ポリシー明確化**:
   - README.md に「完全なDRMではなく、カジュアルコピーを防止するレベル」と明記
   - 利用規約でスクリーンショット・再配布禁止を記載
   - ユーザーに「DevTools使用での回避は利用規約違反」と明示

3. **テスト**:
   - 通常の読書体験（ページ送り、ズーム）が支障ないこと
   - 複数ページアクセス時にセッション管理が正しく機能することを確認

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/rules/constraints.md` |
| 変更種別 | 既存修正（セクション追加） |

**具体的な変更内容:**

以下のセクションを追記する:

> ## DRM実装時の注意事項
>
> 電子書籍のDRM機能を実装する場合は、以下を理解した上で設計すること。
>
> ### DRMの限界
>
> - **JavaScriptのみでの実装**: ブラウザのネイティブ機能（DevTools、ブラウザ拡張機能）を完全には制御できない
> - **完全性は不可能**: スクリーンショット、画面キャプチャ、プリントスクリーン等は技術的に防止不可
> - **推奨アプローチ**: 「完全なDRM」ではなく「カジュアルコピー防止」レベルの実装を明示する
>
> ### 実装時のチェックリスト
>
> 1. **ビューアー層での対策**:
>    - ダウンロード・印刷ボタンをUIから非表示化（pdf.jsなら上書き）
>    - テキスト選択禁止: `user-select: none`
>    - 右クリック禁止: `contextmenu` イベント無効化
>
> 2. **サーバーサイド層での対策**:
>    - 署名付きURL方式で配信（有効期限: 15分推奨）
>    - 各ページアクセスにJWT認証を必須化
>    - アクセスログにIPアドレス・User-Agentを記録
>
> 3. **契約・利用規約層での対策**:
>    - 利用規約に「スクリーンショット・再配布禁止」を明記
>    - DevTools使用による回避は利用規約違反と規定
>    - SaaS提供の場合、Terms of Serviceで明示
>
> 4. **テスト範囲**:
>    - 通常の読書体験（ページ送り、ズーム、目次操作）が支障ないこと
>    - セッション期限切れ後のアクセスが403（Forbidden）になることを確認

---

### 4. E2Eテスト時のマルチユーザーセッション管理

- **苦労度**: ★★★☆☆（3/5）
- **深刻度**: ★★☆☆☆（2/5）
- **原因カテゴリ**: テンプレート不足
- **影響範囲**: ルール改善で予防可能

#### 何が起きたか

Playwright E2Eテストで複数ユーザーの操作フロー（著者がサイン合成 → ファンが本棚で閲覧）をテストする際、複数の `context` を同時に作成してマルチユーザーセッションを実現していました。しかし、テスト実行時に以下の問題が発生しました:

1. コンテキスト間でCookie/LocalStorageが混在し、認証状態が不正になる
2. テスト実行順序により、前のテストの状態が次のテストに引き継がれる（isolation不足）
3. 複数コンテキストでの同時実行時、DBトランザクションのロックが発生し、テストがタイムアウト

#### 原因

Playwrightドキュメントに「複数context」の使用例は記載されていても、E2EテストでのBestPracticeが明記されていないため、テンプレートスキル（test-run-operations）にマルチユーザーテストのパターンが含まれていませんでした。

#### どう解決したか

1. **Context分離**:
   - 各ユーザーロール（author, fan, admin）ごとに独立した `context` を作成
   - context生成時に `storageState` で認証状態を別々に保存
   ```typescript
   const authorContext = await browser.newContext({
     storageState: 'auth-states/author.json'
   });
   const fanContext = await browser.newContext({
     storageState: 'auth-states/fan.json'
   });
   ```

2. **テスト分離**:
   - マルチユーザーシナリオを1つのテスト関数内で順序立てて実行（複数テストに分割しない）
   - 各テスト開始前に `beforeEach` で認証状態をリセット
   - テスト終了後に `afterEach` で全コンテキストをクローズ

3. **DB同期**:
   - マルチユーザー操作間に適切な待機時間を設定
   - 「著者がサイン合成」 → 「DB反映待機（waitForSelector）」 → 「ファンが本棚を再読み込み」という流れを明示的に実装

4. **テスト実装例**:
   - `tests/e2e/signing-flow.spec.ts` に「著者がサイン合成 → ファンが閲覧」の完全フロー実装
   - 5ステップのシナリオで、各ステップ後にDB同期を確認

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/skills/test-run-operations/references/PlaywrightMultiuserGuide.md` |
| 変更種別 | 新規追加 |

**具体的な変更内容:**

新規ファイル `.claude/skills/test-run-operations/references/PlaywrightMultiuserGuide.md` を作成し、以下を記載:

```markdown
# Playwright E2Eテスト: マルチユーザーシナリオ実装ガイド

## 概要

マルチユーザーシナリオ（例: 著者がアクション → ファンが反応）をPlaywright E2Eテストで実装する際の注意事項。

## 基本パターン

### 1. 認証状態の分離

複数ユーザーロールがある場合、事前に各ロールの認証状態を取得し、テスト時にcontext別に設定する。

```typescript
// setup: 各ロールの認証状態を事前に保存
const authorContext = await browser.newContext({
  storageState: 'auth-states/author.json'
});
const fanContext = await browser.newContext({
  storageState: 'auth-states/fan.json'
});
```

### 2. マルチユーザーシナリオは1テスト内で実装

複数のテスト関数に分割すると、テスト実行順序に依存し、isolationが破綻する。

```typescript
// NG: 複数テストに分割
test('author signs', () => { /* サイン合成 */ });
test('fan reads', () => { /* ファン閲覧 */ });  // authorテストの結果に依存

// OK: 1テスト内で順序立てて実行
test('author signs and fan reads', async () => {
  // Step 1: 著者がサイン合成
  const authorPage = await authorContext.newPage();
  await authorPage.goto('/author/compose');
  // ...

  // Step 2: DB反映待機
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 3: ファンが本棚を再読み込み・閲覧
  const fanPage = await fanContext.newPage();
  await fanPage.goto('/bookshelf');
  // ...
});
```

### 3. テスト内での待機

マルチユーザー操作間に適切なDB同期待機を挿入。

```typescript
// OK: 操作 → 待機 → 次操作
await authorPage.click('button:has-text("合成を実行")');
await new Promise(resolve => setTimeout(resolve, 2000)); // DB反映待機
await fanPage.reload();
await fanPage.waitForSelector('text=新着書籍');
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 「not authorized」エラー | context生成時に `storageState` 指定漏れ | storageStateを必ず指定 |
| DB値が反映されない | マルチユーザー操作間の待機不足 | `waitForSelector` / `waitForNavigation` で同期 |
| テスト実行順序に依存 | マルチユーザーシナリオを複数テストに分割 | 1テスト内で順序立てて実装 |

```
```

