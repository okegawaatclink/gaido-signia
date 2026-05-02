/**
 * @file epub.service.ts
 * @description EPUB サイン合成サービス
 *
 * JSZip を使用してEPUBファイルにサインページ（HTMLページ）を挿入する。
 *
 * EPUBの構造:
 * - EPUBファイルはZIPアーカイブ形式
 * - OPF（Open Packaging Format）: content.opf にメタデータ・読み順が定義される
 * - manifest: OPFの全リソース一覧（HTMLページ、画像、CSSなど）
 * - spine: manifestアイテムの読み順定義
 *
 * 処理フロー:
 * 1. EPUBバッファをJSZipで展開する
 * 2. META-INF/container.xml から content.opf のパスを取得する
 * 3. content.opf を解析してmanifest/spineを取得する
 * 4. サイン画像（PNG）をEPUBのZIP内に保存する
 * 5. サインページHTMLを生成してZIPに追加する
 * 6. content.opf のmanifestとspineにサインページ情報を追加する
 *   （spine先頭に挿入 = 表紙の次のページとして表示）
 * 7. 更新されたEPUBをBufferとして返す
 */

import JSZip from 'jszip';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

/**
 * EPUB合成オプション
 */
export interface EpubComposeOptions {
  /** 元EPUBのBuffer */
  epubBuffer: Buffer;
  /** サイン画像のBuffer（PNG形式） */
  signImageBuffer: Buffer;
  /** 宛名テキスト（個別サインの場合。未指定の場合は宛名なし） */
  recipientName?: string;
}

/**
 * EPUBのcontainer.xmlを解析してOPFファイルのパスを取得する
 *
 * container.xmlの形式:
 * ```xml
 * <container>
 *   <rootfiles>
 *     <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
 *   </rootfiles>
 * </container>
 * ```
 *
 * @param containerXml - container.xmlの文字列
 * @returns OPFファイルのパス
 * @throws {AppError} container.xmlの形式が不正な場合
 */
function parseContainerXml(containerXml: string): string {
  // full-path 属性を正規表現で取得（XMLパーサーなし）
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match) {
    throw new AppError(
      'META-INF/container.xmlにOPFファイルパスが見つかりません',
      500,
      'EPUB_PARSE_ERROR'
    );
  }
  return match[1];
}

/**
 * EPUBのOPFファイルを解析して spine の先頭アイテムIDを取得する
 *
 * OPFの spine 形式:
 * ```xml
 * <spine toc="ncx">
 *   <itemref idref="cover" />
 *   <itemref idref="chapter1" />
 * </spine>
 * ```
 *
 * @param opfContent - content.opfの文字列
 * @returns spine の先頭itemref の idref 属性値（見つからない場合はnull）
 */
function getFirstSpineItemIdref(opfContent: string): string | null {
  const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
  if (!spineMatch) return null;

  const firstItemMatch = spineMatch[1].match(/<itemref[^>]+idref="([^"]+)"/);
  return firstItemMatch ? firstItemMatch[1] : null;
}

/**
 * サインページのHTMLを生成する
 *
 * EPUBビューアーでのレンダリングを考慮した構成:
 * - viewport meta タグでモバイル表示に対応
 * - flexboxで画像と宛名を中央配置
 * - サイン画像はviewportに収まるように max-width/max-height を指定
 *
 * @param signImageRelativePath - OPFからの相対パス（HTMLファイルからの相対パス）
 * @param recipientName - 宛名テキスト（オプション）
 * @returns サインページのHTML文字列
 */
function generateSignPageHtml(
  signImageRelativePath: string,
  recipientName?: string
): string {
  // 宛名テキストのHTMLブロック（個別サインの場合のみ表示）
  const recipientHtml = recipientName
    ? `<p class="recipient">To: ${escapeHtml(recipientName)}</p>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>著者サイン</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 90vh;
      background-color: #ffffff;
      font-family: serif;
    }
    .sign-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      max-width: 100%;
    }
    .sign-image {
      max-width: 70vw;
      max-height: 50vh;
      object-fit: contain;
    }
    .recipient {
      font-size: 1.2em;
      color: #333333;
      margin: 0;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="sign-container">
    <img class="sign-image" src="${signImageRelativePath}" alt="著者サイン" />
    ${recipientHtml}
  </div>
</body>
</html>`;
}

/**
 * HTMLエスケープ（XSS対策）
 * 宛名テキストをHTMLに埋め込む際に使用する
 *
 * @param str - エスケープする文字列
 * @returns エスケープ済み文字列
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * OPFファイルにサインページのmanifestアイテムを追加する
 *
 * manifest の形式:
 * ```xml
 * <manifest>
 *   <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
 * </manifest>
 * ```
 *
 * @param opfContent - content.opfの文字列
 * @param signPageItem - manifest に追加するアイテムのXML文字列
 * @param signImageItem - manifest に追加するサイン画像アイテムのXML文字列
 * @returns 更新後のOPFコンテンツ
 */
function addManifestItems(
  opfContent: string,
  signPageItem: string,
  signImageItem: string
): string {
  // </manifest> タグの直前にアイテムを追加
  return opfContent.replace(
    /<\/manifest>/,
    `  ${signPageItem}\n  ${signImageItem}\n  </manifest>`
  );
}

/**
 * OPFファイルのspineにサインページのitemrefを先頭に追加する
 *
 * spine の先頭に挿入することで、EPUBの読み順の先頭（表紙の次）に配置される。
 *
 * @param opfContent - content.opfの文字列
 * @param signPageItemref - spine に追加するitemrefのXML文字列
 * @returns 更新後のOPFコンテンツ
 */
function insertSignPageAtSpineHead(opfContent: string, signPageItemref: string): string {
  // <spine...> タグの直後にitemrefを挿入
  return opfContent.replace(
    /(<spine[^>]*>)/,
    `$1\n    ${signPageItemref}`
  );
}

/**
 * EPUBファイルにサインページを挿入する
 *
 * @param options - EPUB合成オプション
 * @returns 合成済みEPUBのBuffer
 * @throws {AppError} EPUB解析やファイル追加に失敗した場合
 */
export async function composeEpub(options: EpubComposeOptions): Promise<Buffer> {
  const { epubBuffer, signImageBuffer, recipientName } = options;

  try {
    // EPUBをZIPとして展開
    const zip = await JSZip.loadAsync(epubBuffer);

    // META-INF/container.xml を取得してOPFファイルのパスを特定
    const containerXmlFile = zip.file('META-INF/container.xml');
    if (!containerXmlFile) {
      throw new AppError(
        'META-INF/container.xmlが見つかりません。有効なEPUBファイルか確認してください',
        400,
        'INVALID_EPUB'
      );
    }

    const containerXml = await containerXmlFile.async('string');
    const opfPath = parseContainerXml(containerXml);

    logger.info('EPUB OPF path resolved', { opfPath });

    // OPFファイルを取得
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new AppError(
        `OPFファイルが見つかりません: ${opfPath}`,
        500,
        'EPUB_PARSE_ERROR'
      );
    }

    let opfContent = await opfFile.async('string');

    // OPFファイルのディレクトリパスを取得（相対パス解決のため）
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // サイン画像とHTMLページをZIP内のどこに配置するか決定
    // OPFと同じディレクトリに配置することで相対パスが簡潔になる
    const signImageZipPath = `${opfDir}sign_image.png`;
    const signPageZipPath = `${opfDir}sign_page.xhtml`;

    // HTMLから見たサイン画像の相対パス（同じディレクトリ）
    const signImageRelativePath = 'sign_image.png';

    // サイン画像をZIPに追加
    zip.file(signImageZipPath, signImageBuffer);

    // サインページHTMLを生成してZIPに追加
    const signPageHtml = generateSignPageHtml(signImageRelativePath, recipientName);
    zip.file(signPageZipPath, signPageHtml);

    logger.info('Sign files added to EPUB zip', {
      signImageZipPath,
      signPageZipPath,
    });

    // OPFのmanifestにサインページとサイン画像を追加
    const signPageManifestItem = `<item id="signia-sign-page" href="sign_page.xhtml" media-type="application/xhtml+xml"/>`;
    const signImageManifestItem = `<item id="signia-sign-image" href="sign_image.png" media-type="image/png"/>`;

    opfContent = addManifestItems(opfContent, signPageManifestItem, signImageManifestItem);

    // OPFのspine先頭にサインページを追加（=読み順の最初 / 表紙の次）
    const signPageSpineItem = `<itemref idref="signia-sign-page"/>`;
    opfContent = insertSignPageAtSpineHead(opfContent, signPageSpineItem);

    // 更新したOPFをZIPに書き戻す
    zip.file(opfPath, opfContent);

    logger.info('OPF manifest and spine updated', {
      firstSpineItem: getFirstSpineItemIdref(opfContent),
    });

    // EPUBをBufferとして生成（nodebuffer = Node.jsのBufferとして出力）
    const resultBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      // EPUBのMIMEタイプを維持するためにZIPの圧縮設定を保持
      // mimetypeファイルは圧縮しない（EPUB仕様: 先頭ファイルは非圧縮）
      streamFiles: false,
    });

    logger.info('EPUB composition completed', {
      originalSize: epubBuffer.length,
      composedSize: resultBuffer.length,
    });

    return resultBuffer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = (error as Error).message;
    logger.error('EPUB composition failed', { error: message });
    throw new AppError(`EPUB合成に失敗しました: ${message}`, 500, 'EPUB_COMPOSE_ERROR');
  }
}
