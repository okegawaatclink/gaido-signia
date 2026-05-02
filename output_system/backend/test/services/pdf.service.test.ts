/**
 * @file pdf.service.test.ts
 * @description PDFサイン合成サービスのユニットテスト
 *
 * テスト対象:
 * - composePdf: PDFにサインページを2ページ目として挿入する
 *
 * pdf-libをモック化してユニットテストとして実行する。
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// pdf-libをモック化してBuffer依存を排除する
jest.mock('pdf-lib');

import { composePdf } from '../../src/services/pdf.service';
import * as pdfLib from 'pdf-lib';

/** テスト用ダミーのPDFバッファ */
const mockPdfBuffer = Buffer.from('fake pdf content');

/** テスト用ダミーのサイン画像バッファ（PNG） */
const mockSignImageBuffer = Buffer.from('fake png content');

/**
 * pdf-libのモックオブジェクト設定
 * 実際のPDF操作をスタブ化してテスト可能にする
 */
function createMockPdfDoc() {
  const mockSignImage = {
    size: jest.fn().mockReturnValue({ width: 400, height: 200 }),
  };

  const mockFont = {};

  const mockPage = {
    getSize: jest.fn().mockReturnValue({ width: 595, height: 842 }),
    drawRectangle: jest.fn(),
    drawImage: jest.fn(),
    drawText: jest.fn(),
    setFont: jest.fn(),
    setFontColor: jest.fn(),
  };

  const mockPdfDoc = {
    getPages: jest.fn().mockReturnValue([mockPage]),
    embedPng: jest.fn().mockResolvedValue(mockSignImage),
    insertPage: jest.fn().mockReturnValue(mockPage),
    embedFont: jest.fn().mockResolvedValue(mockFont),
    save: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  };

  return { mockPdfDoc, mockPage, mockSignImage };
}

describe('pdf.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('composePdf', () => {
    /**
     * 【テスト対象】composePdf
     * 【テスト内容】正常系: PDFにサインページが挿入される
     * 【期待結果】
     * - PDFDocument.loadが元PDFのバッファで呼ばれる
     * - embedPngでサイン画像が埋め込まれる
     * - insertPage(1, ...)で2ページ目の位置にページが挿入される
     * - Bufferが返される
     */
    it('should insert sign page into PDF at index 1', async () => {
      const { mockPdfDoc } = createMockPdfDoc();

      // PDFDocument.loadをモック化
      jest.spyOn(pdfLib.PDFDocument, 'load').mockResolvedValue(
        mockPdfDoc as unknown as pdfLib.PDFDocument
      );

      const result = await composePdf({
        pdfBuffer: mockPdfBuffer,
        signImageBuffer: mockSignImageBuffer,
      });

      // PDFのロードが呼ばれたことを確認
      expect(pdfLib.PDFDocument.load).toHaveBeenCalledWith(mockPdfBuffer);

      // サイン画像が埋め込まれたことを確認
      expect(mockPdfDoc.embedPng).toHaveBeenCalledWith(mockSignImageBuffer);

      // 2ページ目（index 1）にページが挿入されたことを確認
      expect(mockPdfDoc.insertPage).toHaveBeenCalledWith(1, [595, 842]);

      // saveが呼ばれてBufferが返されたことを確認
      expect(mockPdfDoc.save).toHaveBeenCalled();
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    /**
     * 【テスト対象】composePdf
     * 【テスト内容】個別サイン: 宛名テキストが描画される
     * 【期待結果】
     * - embedFontが呼ばれる（宛名テキスト描画のため）
     * - サインページのdrawTextが宛名テキストを含めて呼ばれる
     */
    it('should draw recipient name when recipientName is provided', async () => {
      const { mockPdfDoc, mockPage } = createMockPdfDoc();

      // widthOfTextAtSizeをフォントモックに追加
      const mockFontWithWidth = {
        widthOfTextAtSize: jest.fn().mockReturnValue(100),
      };
      mockPdfDoc.embedFont = jest.fn().mockResolvedValue(mockFontWithWidth);

      jest.spyOn(pdfLib.PDFDocument, 'load').mockResolvedValue(
        mockPdfDoc as unknown as pdfLib.PDFDocument
      );

      await composePdf({
        pdfBuffer: mockPdfBuffer,
        signImageBuffer: mockSignImageBuffer,
        recipientName: 'テスト太郎',
      });

      // フォント埋め込みが呼ばれたことを確認（宛名描画には標準フォントが必要）
      expect(mockPdfDoc.embedFont).toHaveBeenCalled();

      // drawTextが呼ばれたことを確認
      expect(mockPage.drawText).toHaveBeenCalledWith(
        expect.stringContaining('テスト太郎'),
        expect.objectContaining({ size: expect.any(Number) })
      );
    });

    /**
     * 【テスト対象】composePdf
     * 【テスト内容】共通サイン: 宛名なしの場合にdrawTextが呼ばれない
     * 【期待結果】
     * - drawTextが呼ばれない（宛名テキストを描画しない）
     */
    it('should NOT draw recipient text when recipientName is not provided', async () => {
      const { mockPdfDoc, mockPage } = createMockPdfDoc();

      jest.spyOn(pdfLib.PDFDocument, 'load').mockResolvedValue(
        mockPdfDoc as unknown as pdfLib.PDFDocument
      );

      await composePdf({
        pdfBuffer: mockPdfBuffer,
        signImageBuffer: mockSignImageBuffer,
        // recipientName: 未指定（共通サイン）
      });

      // drawTextが呼ばれないことを確認
      expect(mockPage.drawText).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】composePdf
     * 【テスト内容】PDFが空ページ（ページ数0）の場合にエラーが投げられる
     * 【期待結果】AppErrorが投げられる
     */
    it('should throw AppError when PDF has no pages', async () => {
      const mockPdfDocEmpty = {
        getPages: jest.fn().mockReturnValue([]), // ページなし
        embedPng: jest.fn(),
        insertPage: jest.fn(),
        embedFont: jest.fn(),
        save: jest.fn(),
      };

      jest.spyOn(pdfLib.PDFDocument, 'load').mockResolvedValue(
        mockPdfDocEmpty as unknown as pdfLib.PDFDocument
      );

      await expect(
        composePdf({
          pdfBuffer: mockPdfBuffer,
          signImageBuffer: mockSignImageBuffer,
        })
      ).rejects.toThrow('PDFにページが存在しません');
    });

    /**
     * 【テスト対象】composePdf
     * 【テスト内容】PDF.loadが失敗した場合にAppErrorが投げられる
     * 【期待結果】AppErrorとして伝播する
     */
    it('should throw AppError when PDF loading fails', async () => {
      jest.spyOn(pdfLib.PDFDocument, 'load').mockRejectedValue(
        new Error('Invalid PDF format')
      );

      await expect(
        composePdf({
          pdfBuffer: mockPdfBuffer,
          signImageBuffer: mockSignImageBuffer,
        })
      ).rejects.toThrow('PDF合成に失敗しました');
    });
  });
});
