/**
 * @file pdf.service.ts
 * @description PDF サイン合成サービス
 *
 * pdf-lib を使用してPDFファイルにサインページを挿入する。
 *
 * 処理フロー:
 * 1. 元PDFをBufferとしてロード
 * 2. サイン画像（PNG）を埋め込む
 * 3. 元PDFと同じページサイズのサインページを新規作成
 * 4. サインページにサイン画像（中央配置）と宛名テキストを描画
 * 5. サインページを2ページ目として挿入（index 1）
 * 6. 合成済みPDFをBufferとして返す
 *
 * サインページレイアウト:
 * - 背景: 白
 * - サイン画像: ページ中央に最大幅80%・最大高さ50%でアスペクト比を保って配置
 * - 宛名テキスト（個別サインの場合）: サイン画像の下に標準フォントで表示
 */

import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

/**
 * PDF合成オプション
 */
export interface PdfComposeOptions {
  /** 元PDFのBuffer */
  pdfBuffer: Buffer;
  /** サイン画像のBuffer（PNG形式） */
  signImageBuffer: Buffer;
  /** 宛名テキスト（個別サインの場合。未指定の場合は宛名なし） */
  recipientName?: string;
}

/**
 * サインページの描画設定
 * ページサイズに対する比率で定義する
 */
const SIGN_PAGE_LAYOUT = {
  /** サイン画像の最大幅（ページ幅の割合） */
  maxSignWidthRatio: 0.7,
  /** サイン画像の最大高さ（ページ高さの割合） */
  maxSignHeightRatio: 0.5,
  /** 宛名テキストのフォントサイズ */
  recipientFontSize: 24,
  /** サイン画像と宛名テキストの間隔 */
  recipientTextMargin: 30,
  /** 宛名テキストの色（黒） */
  recipientTextColor: rgb(0.1, 0.1, 0.1),
  /** 背景色（白） */
  backgroundColor: rgb(1, 1, 1),
};

/**
 * サイン画像の描画サイズを計算する
 * 元画像のアスペクト比を維持しながら、ページ内の最大サイズに収める
 *
 * @param imageWidth - サイン画像の元の幅
 * @param imageHeight - サイン画像の元の高さ
 * @param maxWidth - 描画可能な最大幅
 * @param maxHeight - 描画可能な最大高さ
 * @returns 描画サイズ { width, height }
 */
function calculateFitSize(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  // アスペクト比を計算
  const aspectRatio = imageWidth / imageHeight;

  // 幅基準でスケーリング
  let width = maxWidth;
  let height = width / aspectRatio;

  // 高さが超える場合は高さ基準に変更
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return { width, height };
}

/**
 * サインページを作成してPDFの2ページ目に挿入する
 *
 * サインページの構成:
 * - 元PDFの1ページ目と同じサイズで作成
 * - サイン画像をページ中央に配置
 * - 個別サインの場合は宛名をサイン画像の下に表示
 *
 * @param options - PDF合成オプション
 * @returns 合成済みPDFのBuffer
 * @throws {AppError} PDF読み込みやサイン画像の埋め込みに失敗した場合
 */
export async function composePdf(options: PdfComposeOptions): Promise<Buffer> {
  const { pdfBuffer, signImageBuffer, recipientName } = options;

  try {
    // 元PDFをロード
    // ignoreEncryption: DRM保護PDFでも読み込めるようにする（閲覧者向けのため）
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // 元PDFの1ページ目のサイズを取得（サインページのサイズとして使用）
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new AppError('PDFにページが存在しません', 400, 'INVALID_PDF');
    }

    const firstPage: PDFPage = pages[0];
    const { width: pageWidth, height: pageHeight } = firstPage.getSize();

    logger.info('PDF loaded for composition', {
      pageCount: pages.length,
      pageWidth,
      pageHeight,
    });

    // サイン画像（PNG）をPDFドキュメントに埋め込む
    // PDFドキュメントに埋め込まれたリソースとして管理されるため、Bufferとして渡す
    const signImage = await pdfDoc.embedPng(signImageBuffer);
    const { width: imageWidth, height: imageHeight } = signImage.size();

    // サインページを挿入する（index 1 = 2ページ目）
    // insertPage(1): 0-indexedで1番目、つまり元の2ページ目の前に挿入
    const signPage = pdfDoc.insertPage(1, [pageWidth, pageHeight]);

    // 背景を白で塗りつぶす（デフォルトは透明のため）
    signPage.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: SIGN_PAGE_LAYOUT.backgroundColor,
    });

    // サイン画像の描画サイズを計算（ページに収まるように調整）
    const maxSignWidth = pageWidth * SIGN_PAGE_LAYOUT.maxSignWidthRatio;
    const maxSignHeight = pageHeight * SIGN_PAGE_LAYOUT.maxSignHeightRatio;
    const { width: signWidth, height: signHeight } = calculateFitSize(
      imageWidth,
      imageHeight,
      maxSignWidth,
      maxSignHeight
    );

    // 宛名テキストの有無によってサイン画像の縦位置を調整
    // 宛名あり: ページ上半分の中心にサイン配置
    // 宛名なし: ページ垂直中心にサイン配置
    const hasRecipient = !!recipientName;
    const signCenterY = hasRecipient
      ? pageHeight * 0.6  // 宛名スペース確保のため少し上に
      : pageHeight * 0.5; // ページ中央

    // サイン画像をページ中央に配置
    // pdf-libはy座標が下から上（底辺基準）なので、中心からheight/2引いた位置がbottom-left
    const signX = (pageWidth - signWidth) / 2;
    const signY = signCenterY - signHeight / 2;

    signPage.drawImage(signImage, {
      x: signX,
      y: signY,
      width: signWidth,
      height: signHeight,
    });

    logger.info('Sign image drawn on sign page', {
      imageWidth,
      imageHeight,
      signWidth,
      signHeight,
      signX,
      signY,
    });

    // 宛名テキストの描画（個別サインの場合のみ）
    if (hasRecipient && recipientName) {
      // 標準フォントを使用（フォントサブセットが不要で簡単に使える）
      // HelveticaはASCII文字のみ対応。日本語宛名はHelveticaで文字化けするため注意
      // 将来的には日本語対応フォントの埋め込みが必要（現在の仕様では宛名はASCII想定）
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const text = `To: ${recipientName}`;
      const textWidth = font.widthOfTextAtSize(text, SIGN_PAGE_LAYOUT.recipientFontSize);

      // テキストをページ水平中央、サイン画像の下に配置
      const textX = (pageWidth - textWidth) / 2;
      const textY = signY - SIGN_PAGE_LAYOUT.recipientTextMargin;

      signPage.drawText(text, {
        x: textX,
        y: textY,
        size: SIGN_PAGE_LAYOUT.recipientFontSize,
        font,
        color: SIGN_PAGE_LAYOUT.recipientTextColor,
      });

      logger.info('Recipient name drawn on sign page', { recipientName, textX, textY });
    }

    // 合成済みPDFをBufferとして出力
    const resultBytes = await pdfDoc.save();
    const resultBuffer = Buffer.from(resultBytes);

    logger.info('PDF composition completed', {
      originalSize: pdfBuffer.length,
      composedSize: resultBuffer.length,
    });

    return resultBuffer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = (error as Error).message;
    logger.error('PDF composition failed', { error: message });
    throw new AppError(`PDF合成に失敗しました: ${message}`, 500, 'PDF_COMPOSE_ERROR');
  }
}
