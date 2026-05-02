/**
 * @file compose.service.test.ts
 * @description サイン合成サービスのユニットテスト
 *
 * テスト対象:
 * - ComposeService.execute: 合成ジョブの実行
 * - ComposeService.getSignedBook: サイン入り書籍取得
 *
 * DBとS3操作はモック化してユニットテストとして実行する
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// DBへの接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

// 各モデルをモック化
jest.mock('../../src/models/book.model');
jest.mock('../../src/models/sign.model');
jest.mock('../../src/models/signed-book.model');

// ストレージサービスをモック化
jest.mock('../../src/services/storage.service');

// PDF/EPUBサービスをモック化
jest.mock('../../src/services/pdf.service');
jest.mock('../../src/services/epub.service');

// dbをモック化（book_access操作のため）
import { db } from '../../src/config/database';

import { ComposeService } from '../../src/services/compose.service';
import * as BookModelModule from '../../src/models/book.model';
import * as SignModelModule from '../../src/models/sign.model';
import * as SignedBookModelModule from '../../src/models/signed-book.model';
import { storageService } from '../../src/services/storage.service';
import * as pdfServiceModule from '../../src/services/pdf.service';
import * as epubServiceModule from '../../src/services/epub.service';
import { Book } from '../../src/models/book.model';
import { Sign } from '../../src/models/sign.model';
import { SignedBook } from '../../src/models/signed-book.model';
// エラークラスをインポート（型参照のみ、モックのinstanceofチェックでは使用しない）
import type { NotFoundError, ForbiddenError, ValidationError } from '../../src/utils/errors';

/** テスト用の書籍データ（PDF形式） */
const mockPdfBook: Book = {
  id: 'book-id-1234',
  authorId: 'author-user-id-1234',
  title: 'テスト書籍',
  description: 'テスト用書籍',
  format: 'pdf',
  fileKey: 'books/uuid-1234/test.pdf',
  coverImageKey: null,
  fileSize: 1024000,
  pageCount: 100,
  status: 'published',
  metadata: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用の書籍データ（EPUB形式） */
const mockEpubBook: Book = {
  ...mockPdfBook,
  id: 'book-id-epub-1234',
  format: 'epub',
  fileKey: 'books/uuid-5678/test.epub',
};

/** テスト用のサインデータ */
const mockSign: Sign = {
  id: 'sign-id-1234',
  authorId: 'author-user-id-1234',
  name: 'テストサイン',
  type: 'common',
  imageKey: 'signs/uuid-1234/sign.png',
  canvasData: null,
  isDefault: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用のサイン入り書籍データ */
const mockSignedBook: SignedBook = {
  id: 'signed-book-id-1234',
  bookId: 'book-id-1234',
  signId: 'sign-id-1234',
  fanId: 'fan-id-1234',
  recipientName: null,
  signedFileKey: null,
  status: 'processing',
  composedAt: null,
  createdAt: new Date('2024-01-01'),
};

/** テスト用の完了済みサイン入り書籍データ */
const mockCompletedSignedBook: SignedBook = {
  ...mockSignedBook,
  status: 'completed',
  signedFileKey: 'signed-books/uuid-5678/book-id-1234_fan-id-1234.pdf',
  composedAt: new Date(),
};

describe('ComposeService', () => {
  let service: ComposeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ComposeService();

    // ストレージのダウンロードをモック（書籍ファイルとサイン画像）
    (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('fake file content'));

    // ストレージのアップロードをモック
    (storageService.upload as jest.Mock).mockResolvedValue('signed-books/uuid/file.pdf');

    // PDF合成のモック
    (pdfServiceModule.composePdf as jest.Mock).mockResolvedValue(
      Buffer.from('composed pdf content')
    );

    // EPUB合成のモック
    (epubServiceModule.composeEpub as jest.Mock).mockResolvedValue(
      Buffer.from('composed epub content')
    );

    // book_access操作のDBモック
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  describe('execute', () => {
    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】PDF書籍の合成が正常に完了する
     * 【期待結果】
     * - BookModel.findByIdとSignModel.findByIdが呼ばれる
     * - SignedBookModel.createが呼ばれる（status: processing）
     * - composePdfが呼ばれる
     * - storageService.uploadで合成済みファイルが保存される
     * - SignedBookModel.updateStatusで completed に更新される
     * - successCount: 1, errorCount: 0 が返される
     */
    it('should successfully compose PDF sign for a fan', async () => {
      // モデルのモック設定
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockPdfBook);
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue(mockSign);
      (SignedBookModelModule.SignedBookModel.create as jest.Mock).mockResolvedValue(mockSignedBook);
      (SignedBookModelModule.SignedBookModel.updateStatus as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );

      const result = await service.execute('author-user-id-1234', {
        bookId: 'book-id-1234',
        signId: 'sign-id-1234',
        fanIds: ['fan-id-1234'],
      });

      // composePdfが呼ばれたことを確認
      expect(pdfServiceModule.composePdf).toHaveBeenCalledWith({
        pdfBuffer: expect.any(Buffer),
        signImageBuffer: expect.any(Buffer),
        recipientName: undefined,
      });

      // S3にアップロードされたことを確認
      expect(storageService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.stringContaining('signed-books/'),
          contentType: 'application/pdf',
        })
      );

      // completedに更新されたことを確認
      expect(SignedBookModelModule.SignedBookModel.updateStatus).toHaveBeenCalledWith(
        mockSignedBook.id,
        expect.objectContaining({ status: 'completed' })
      );

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】EPUB書籍の合成が正常に完了する
     * 【期待結果】
     * - composeEpubが呼ばれる（composePdfは呼ばれない）
     * - S3アップロードのContentTypeがapplication/epub+zip
     */
    it('should call composeEpub for EPUB format book', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockEpubBook);
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue(mockSign);
      (SignedBookModelModule.SignedBookModel.create as jest.Mock).mockResolvedValue({
        ...mockSignedBook,
        bookId: mockEpubBook.id,
      });
      (SignedBookModelModule.SignedBookModel.updateStatus as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );

      await service.execute('author-user-id-1234', {
        bookId: 'book-id-epub-1234',
        signId: 'sign-id-1234',
        fanIds: ['fan-id-1234'],
      });

      // composeEpubが呼ばれ、composePdfは呼ばれないことを確認
      expect(epubServiceModule.composeEpub).toHaveBeenCalled();
      expect(pdfServiceModule.composePdf).not.toHaveBeenCalled();

      // EPUBのMIMEタイプでアップロードされたことを確認
      expect(storageService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'application/epub+zip',
        })
      );
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】個別サインの場合に宛名が渡される
     * 【期待結果】
     * - composePdfに recipientName が渡される
     */
    it('should pass recipient name to compose function for individual sign', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockPdfBook);
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue({
        ...mockSign,
        type: 'individual',
      });
      (SignedBookModelModule.SignedBookModel.create as jest.Mock).mockResolvedValue(mockSignedBook);
      (SignedBookModelModule.SignedBookModel.updateStatus as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );

      await service.execute('author-user-id-1234', {
        bookId: 'book-id-1234',
        signId: 'sign-id-1234',
        fanIds: ['fan-id-1234'],
        recipientNames: { 'fan-id-1234': 'テスト太郎' },
      });

      // recipientNameが渡されたことを確認
      expect(pdfServiceModule.composePdf).toHaveBeenCalledWith(
        expect.objectContaining({ recipientName: 'テスト太郎' })
      );
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】複数ファンへの合成で1名エラーが出ても他は継続する
     * 【期待結果】
     * - results.length: 2（全ファン分）
     * - successCount: 1, errorCount: 1
     */
    it('should continue composing for other fans when one fails', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockPdfBook);
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue(mockSign);

      // 1回目はprocessingのsigned_book、2回目も同様
      (SignedBookModelModule.SignedBookModel.create as jest.Mock)
        .mockResolvedValueOnce({ ...mockSignedBook, id: 'sb-1', fanId: 'fan-id-1' })
        .mockResolvedValueOnce({ ...mockSignedBook, id: 'sb-2', fanId: 'fan-id-2' });

      // 1回目の合成は成功、2回目はエラー
      (pdfServiceModule.composePdf as jest.Mock)
        .mockResolvedValueOnce(Buffer.from('composed pdf 1'))
        .mockRejectedValueOnce(new Error('Compose failed'));

      (SignedBookModelModule.SignedBookModel.updateStatus as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );

      const result = await service.execute('author-user-id-1234', {
        bookId: 'book-id-1234',
        signId: 'sign-id-1234',
        fanIds: ['fan-id-1', 'fan-id-2'],
      });

      expect(result.results.length).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】書籍が存在しない場合にNotFoundErrorが投げられる
     * 【期待結果】「書籍が見つかりません」メッセージのエラーが投げられる
     */
    it('should throw NotFoundError when book does not exist', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.execute('author-user-id-1234', {
          bookId: 'non-existent-book',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
        })
      ).rejects.toThrow('書籍が見つかりません');
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】他の著者の書籍を使用しようとした場合にForbiddenErrorが投げられる
     * 【期待結果】「操作権限がありません」メッセージのエラーが投げられる
     */
    it('should throw ForbiddenError when book belongs to another author', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue({
        ...mockPdfBook,
        authorId: 'other-author-id',  // 別の著者
      });

      await expect(
        service.execute('author-user-id-1234', {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
        })
      ).rejects.toThrow('この書籍に対する操作権限がありません');
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】サインが存在しない場合にNotFoundErrorが投げられる
     * 【期待結果】「サインが見つかりません」メッセージのエラーが投げられる
     */
    it('should throw NotFoundError when sign does not exist', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockPdfBook);
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.execute('author-user-id-1234', {
          bookId: 'book-id-1234',
          signId: 'non-existent-sign',
          fanIds: ['fan-id-1234'],
        })
      ).rejects.toThrow('サインが見つかりません');
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】fanIdsが空配列の場合にValidationErrorが投げられる
     * 【期待結果】バリデーションエラーが投げられる
     */
    it('should throw ValidationError when fanIds is empty', async () => {
      await expect(
        service.execute('author-user-id-1234', {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: [],
        })
      ).rejects.toThrow('対象ファンを1名以上指定してください');
    });

    /**
     * 【テスト対象】ComposeService.execute
     * 【テスト内容】書籍ファイルが未設定の場合にValidationErrorが投げられる
     * 【期待結果】バリデーションエラーが投げられる
     */
    it('should throw ValidationError when book has no file', async () => {
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue({
        ...mockPdfBook,
        fileKey: null,  // ファイル未設定
      });
      (SignModelModule.SignModel.findById as jest.Mock).mockResolvedValue(mockSign);

      await expect(
        service.execute('author-user-id-1234', {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
        })
      ).rejects.toThrow('書籍ファイルが存在しません');
    });
  });

  describe('getSignedBook', () => {
    /**
     * 【テスト対象】ComposeService.getSignedBook
     * 【テスト内容】正常系: サイン入り書籍が取得できる
     * 【期待結果】SignedBookオブジェクトが返される
     */
    it('should return signed book when it exists and author has access', async () => {
      (SignedBookModelModule.SignedBookModel.findById as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue(mockPdfBook);

      const result = await service.getSignedBook('signed-book-id-1234', 'author-user-id-1234');

      expect(result).toEqual(mockCompletedSignedBook);
    });

    /**
     * 【テスト対象】ComposeService.getSignedBook
     * 【テスト内容】存在しないIDの場合にNotFoundErrorが投げられる
     * 【期待結果】「サイン入り書籍が見つかりません」エラーが投げられる
     */
    it('should throw NotFoundError when signed book does not exist', async () => {
      (SignedBookModelModule.SignedBookModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getSignedBook('non-existent-id', 'author-user-id-1234')
      ).rejects.toThrow('サイン入り書籍が見つかりません');
    });

    /**
     * 【テスト対象】ComposeService.getSignedBook
     * 【テスト内容】別の著者がアクセスしようとした場合にForbiddenErrorが投げられる
     * 【期待結果】「アクセスする権限がありません」エラーが投げられる
     */
    it('should throw ForbiddenError when another author tries to access', async () => {
      (SignedBookModelModule.SignedBookModel.findById as jest.Mock).mockResolvedValue(
        mockCompletedSignedBook
      );
      (BookModelModule.BookModel.findById as jest.Mock).mockResolvedValue({
        ...mockPdfBook,
        authorId: 'another-author-id',
      });

      await expect(
        service.getSignedBook('signed-book-id-1234', 'author-user-id-1234')
      ).rejects.toThrow('このサイン入り書籍にアクセスする権限がありません');
    });
  });
});
