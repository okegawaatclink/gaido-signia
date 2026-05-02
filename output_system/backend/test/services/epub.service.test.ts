/**
 * @file epub.service.test.ts
 * @description EPUBサイン合成サービスのユニットテスト
 *
 * テスト対象:
 * - composeEpub: EPUBにサインページ（HTML）を挿入する
 *
 * JSZipをモック化してユニットテストとして実行する。
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// JSZipをモック化してZIP操作を制御する
jest.mock('jszip');

import { composeEpub } from '../../src/services/epub.service';
import JSZip from 'jszip';

/** テスト用の最小限EPUB container.xml */
const MOCK_CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

/** テスト用の最小限OPFコンテンツ */
const MOCK_OPF_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata></metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`;

/**
 * JSZipのモックインスタンスを作成するヘルパー
 * EPUB解凍・再圧縮のフローをシミュレートする
 */
function createMockZipInstance() {
  // 書き込まれたZIPエントリを追跡するマップ
  const writtenFiles: Record<string, unknown> = {};

  // ZIPファイルエントリのモック（async()でコンテンツを返す）
  const containerXmlFile = {
    async: jest.fn().mockResolvedValue(MOCK_CONTAINER_XML),
  };
  const opfFile = {
    async: jest.fn().mockResolvedValue(MOCK_OPF_CONTENT),
  };

  // file()の呼び出しを記録するモック
  // 2引数呼び出し = 書き込み、1引数呼び出し = 読み取り
  const fileMock = jest.fn((path: string, content?: unknown) => {
    if (content !== undefined) {
      // 書き込み
      writtenFiles[path] = content;
      return undefined;
    }
    // 読み取り
    if (path === 'META-INF/container.xml') return containerXmlFile;
    if (path === 'OEBPS/content.opf') return opfFile;
    return null;
  });

  // generateAsync: ZIPのBuffer出力をモック
  const generateAsyncMock = jest.fn().mockResolvedValue(Buffer.from('generated epub'));

  const mockZipInstance = {
    file: fileMock,
    generateAsync: generateAsyncMock,
  };

  return { mockZipInstance, writtenFiles, generateAsyncMock };
}

describe('epub.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('composeEpub', () => {
    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】正常系: EPUBにサインページが追加される
     * 【期待結果】
     * - JSZip.loadAsyncが呼ばれる
     * - sign_page.xhtmlとsign_image.pngがZIPに追加される
     * - generateAsyncが呼ばれてBufferが返される
     */
    it('should add sign page and image to EPUB', async () => {
      const { mockZipInstance, writtenFiles, generateAsyncMock } = createMockZipInstance();

      // JSZip.loadAsyncをモック化
      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      const result = await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
      });

      // ZIPのロードが呼ばれたことを確認
      expect(JSZip.loadAsync).toHaveBeenCalled();

      // サイン画像とHTMLページがZIPに追加されたことを確認
      expect(writtenFiles['OEBPS/sign_image.png']).toBeDefined();
      expect(writtenFiles['OEBPS/sign_page.xhtml']).toBeDefined();

      // generateAsyncが呼ばれてBufferが返されたことを確認
      expect(generateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'nodebuffer' })
      );
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】OPFのmanifestとspineが更新される
     * 【期待結果】
     * - 更新されたOPFにsignia-sign-pageのmanifestアイテムが含まれる
     * - 更新されたOPFのspineにsignia-sign-pageが追加される
     */
    it('should update OPF manifest and spine with sign page entries', async () => {
      const { mockZipInstance, writtenFiles } = createMockZipInstance();

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
      });

      const updatedOpf = writtenFiles['OEBPS/content.opf'] as string;
      expect(updatedOpf).toBeDefined();

      // manifestにサインページとサイン画像が追加されたことを確認
      expect(updatedOpf).toContain('id="signia-sign-page"');
      expect(updatedOpf).toContain('id="signia-sign-image"');

      // spineにサインページのitemrefが追加されたことを確認
      expect(updatedOpf).toContain('<itemref idref="signia-sign-page"/>');
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】spineの先頭にサインページが挿入される
     * 【期待結果】
     * - spineタグの直後にsignia-sign-pageのitemrefが配置される（chapter1の前）
     */
    it('should insert sign page at the beginning of spine', async () => {
      const { mockZipInstance, writtenFiles } = createMockZipInstance();

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
      });

      const updatedOpf = writtenFiles['OEBPS/content.opf'] as string;

      // spine セクション内でsignia-sign-pageがchapter1より前に出現することを確認
      const spineMatch = updatedOpf.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
      expect(spineMatch).not.toBeNull();
      const spineContent = spineMatch![1];

      const signPagePos = spineContent.indexOf('signia-sign-page');
      const chapter1Pos = spineContent.indexOf('"chapter1"');

      expect(signPagePos).toBeGreaterThan(-1);
      expect(signPagePos).toBeLessThan(chapter1Pos);
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】個別サイン: サインページHTMLに宛名が含まれる
     * 【期待結果】
     * - 書き込まれたHTMLに "To: テスト太郎" が含まれる
     */
    it('should include recipient name in sign page HTML when provided', async () => {
      const { mockZipInstance, writtenFiles } = createMockZipInstance();

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
        recipientName: 'テスト太郎',
      });

      const htmlContent = writtenFiles['OEBPS/sign_page.xhtml'] as string;
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('To: テスト太郎');
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】共通サイン: サインページHTMLに宛名ブロックが含まれない
     * 【期待結果】
     * - 書き込まれたHTMLに "To:" が含まれない
     */
    it('should NOT include recipient block in sign page HTML when not provided', async () => {
      const { mockZipInstance, writtenFiles } = createMockZipInstance();

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
        // recipientName: 未指定（共通サイン）
      });

      const htmlContent = writtenFiles['OEBPS/sign_page.xhtml'] as string;
      expect(htmlContent).not.toContain('To:');
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】container.xmlが存在しない場合にエラーが投げられる
     * 【期待結果】AppErrorが投げられる
     */
    it('should throw AppError when container.xml is missing', async () => {
      const mockZipNoContainer = {
        file: jest.fn().mockReturnValue(null), // どのファイルも存在しない
        generateAsync: jest.fn(),
      };

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipNoContainer);

      await expect(
        composeEpub({
          epubBuffer: Buffer.from('fake epub'),
          signImageBuffer: Buffer.from('fake png'),
        })
      ).rejects.toThrow('META-INF/container.xmlが見つかりません');
    });

    /**
     * 【テスト対象】composeEpub
     * 【テスト内容】HTMLの宛名にXSS脆弱性がないこと
     * 【期待結果】
     * - 特殊文字がHTMLエスケープされてHTMLに埋め込まれる
     */
    it('should escape HTML special characters in recipient name', async () => {
      const { mockZipInstance, writtenFiles } = createMockZipInstance();

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

      // XSS攻撃に使われる特殊文字を含む宛名
      await composeEpub({
        epubBuffer: Buffer.from('fake epub'),
        signImageBuffer: Buffer.from('fake png'),
        recipientName: '<script>alert("xss")</script>',
      });

      const htmlContent = writtenFiles['OEBPS/sign_page.xhtml'] as string;

      // 生のscriptタグが含まれないことを確認
      expect(htmlContent).not.toContain('<script>');
      // エスケープされた文字列が含まれることを確認
      expect(htmlContent).toContain('&lt;script&gt;');
    });
  });
});
