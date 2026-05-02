/**
 * @file books.service.test.ts
 * @description 書籍サービスのユニットテスト
 *
 * テスト対象:
 * - BooksService.getBooks: 書籍一覧取得（author/adminのロール制御）
 * - BooksService.getBook: 書籍詳細取得（所有権チェック）
 * - BooksService.createBook: 書籍登録（ファイルアップロード・DB保存）
 * - BooksService.updateBook: 書籍更新（所有権チェック・S3ファイル更新）
 * - BooksService.deleteBook: 書籍削除（所有権チェック・S3ファイル削除）
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

// BookModelをモック化してDB接続不要にする
jest.mock('../../src/models/book.model');

// StorageServiceをモック化してS3接続不要にする
jest.mock('../../src/services/storage.service');

import { BooksService } from '../../src/services/books.service';
import * as BookModelModule from '../../src/models/book.model';
import { storageService } from '../../src/services/storage.service';
import { Book } from '../../src/models/book.model';
import { ForbiddenError, NotFoundError } from '../../src/utils/errors';

/** テスト用の書籍データ */
const mockBook: Book = {
  id: 'book-id-1234',
  authorId: 'author-user-id-1234',
  title: 'テスト書籍',
  description: 'テスト書籍の説明',
  format: 'pdf',
  fileKey: 'uuid-1234/test.pdf',
  coverImageKey: 'uuid-5678/cover.jpg',
  fileSize: 1024 * 1024, // 1MB
  pageCount: null,
  status: 'draft',
  metadata: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用のmulterファイルオブジェクト（PDF） */
const mockPdfFile: Express.Multer.File = {
  fieldname: 'bookFile',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('fake pdf content'),
  size: 1024 * 1024, // 1MB
  stream: {} as never,
  destination: '',
  filename: '',
  path: '',
};

/** テスト用のmulterファイルオブジェクト（EPUB） */
const mockEpubFile: Express.Multer.File = {
  fieldname: 'bookFile',
  originalname: 'test.epub',
  encoding: '7bit',
  mimetype: 'application/epub+zip',
  buffer: Buffer.from('fake epub content'),
  size: 512 * 1024, // 512KB
  stream: {} as never,
  destination: '',
  filename: '',
  path: '',
};

/** テスト用の表紙画像ファイルオブジェクト */
const mockCoverImageFile: Express.Multer.File = {
  fieldname: 'coverImage',
  originalname: 'cover.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from('fake jpg content'),
  size: 256 * 1024, // 256KB
  stream: {} as never,
  destination: '',
  filename: '',
  path: '',
};

describe('BooksService', () => {
  let booksService: BooksService;

  beforeEach(() => {
    jest.clearAllMocks();
    booksService = new BooksService();
  });

  /**
   * 【テスト対象】getBooks
   * 【テスト内容】authorロールでgetBooksを呼び出した場合
   * 【期待結果】findByAuthorIdが自分のuserIdで呼び出される
   */
  describe('getBooks', () => {
    it('should call findByAuthorId for author role', async () => {
      const mockBooks = [mockBook];
      const mockFindByAuthorId = jest.spyOn(BookModelModule.BookModel, 'findByAuthorId')
        .mockResolvedValue(mockBooks);

      const result = await booksService.getBooks('author-user-id-1234', 'author');

      expect(mockFindByAuthorId).toHaveBeenCalledWith('author-user-id-1234');
      expect(result).toEqual(mockBooks);
    });

    /**
     * 【テスト対象】getBooks
     * 【テスト内容】adminロールでgetBooksを呼び出した場合
     * 【期待結果】findAllが呼び出される（全書籍取得）
     */
    it('should call findAll for admin role', async () => {
      const mockBooks = [mockBook];
      const mockFindAll = jest.spyOn(BookModelModule.BookModel, 'findAll')
        .mockResolvedValue(mockBooks);

      const result = await booksService.getBooks('admin-user-id', 'admin');

      expect(mockFindAll).toHaveBeenCalled();
      expect(result).toEqual(mockBooks);
    });
  });

  /**
   * 【テスト対象】getBook
   * 【テスト内容】著者が自分の書籍を取得する場合
   * 【期待結果】書籍オブジェクトが返される
   */
  describe('getBook', () => {
    it('should return book for author accessing own book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);

      const result = await booksService.getBook('book-id-1234', 'author-user-id-1234', 'author');

      expect(result).toEqual(mockBook);
    });

    /**
     * 【テスト対象】getBook
     * 【テスト内容】著者が他者の書籍を取得しようとした場合
     * 【期待結果】ForbiddenError (403) がスローされる
     */
    it('should throw ForbiddenError when author accesses other authors book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);

      await expect(
        booksService.getBook('book-id-1234', 'different-author-id', 'author')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    /**
     * 【テスト対象】getBook
     * 【テスト内容】adminが任意の書籍を取得する場合
     * 【期待結果】書籍オブジェクトが返される（認可チェックなし）
     */
    it('should return book for admin accessing any book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);

      const result = await booksService.getBook('book-id-1234', 'admin-user-id', 'admin');

      expect(result).toEqual(mockBook);
    });

    /**
     * 【テスト対象】getBook
     * 【テスト内容】存在しない書籍IDを指定した場合
     * 【期待結果】NotFoundError (404) がスローされる
     */
    it('should throw NotFoundError when book does not exist', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(null);

      await expect(
        booksService.getBook('non-existent-id', 'author-user-id-1234', 'author')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  /**
   * 【テスト対象】createBook
   * 【テスト内容】PDFファイルで書籍を登録する場合
   * 【期待結果】
   * - storageService.uploadが呼び出される
   * - BookModel.createが呼び出される
   * - 作成された書籍オブジェクトが返される
   */
  describe('createBook', () => {
    it('should create book with PDF file', async () => {
      const mockStorageUpload = jest.spyOn(storageService, 'upload').mockResolvedValue('uuid/test.pdf');
      const mockBookCreate = jest.spyOn(BookModelModule.BookModel, 'create').mockResolvedValue(mockBook);

      const result = await booksService.createBook('author-user-id-1234', {
        title: 'テスト書籍',
        description: 'テスト説明',
        bookFile: mockPdfFile,
      });

      expect(mockStorageUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          body: mockPdfFile.buffer,
          contentType: 'application/pdf',
          // serverSideEncryptionはS3_ENABLE_SSE=trueの場合のみ'AES256'、デフォルトはundefined
          // テスト環境ではS3_ENABLE_SSE未設定のためundefinedになる
          serverSideEncryption: undefined,
        })
      );
      expect(mockBookCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'author-user-id-1234',
          title: 'テスト書籍',
          format: 'pdf',
        })
      );
      expect(result).toEqual(mockBook);
    });

    /**
     * 【テスト対象】createBook
     * 【テスト内容】EPUBファイルで書籍を登録する場合
     * 【期待結果】formatが 'epub' としてDBに保存される
     */
    it('should create book with EPUB file and set format to epub', async () => {
      const mockEpubBook = { ...mockBook, format: 'epub' as const };
      jest.spyOn(storageService, 'upload').mockResolvedValue('uuid/test.epub');
      const mockBookCreate = jest.spyOn(BookModelModule.BookModel, 'create')
        .mockResolvedValue(mockEpubBook);

      const result = await booksService.createBook('author-user-id-1234', {
        title: 'テストEPUB書籍',
        bookFile: mockEpubFile,
      });

      expect(mockBookCreate).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'epub' })
      );
      expect(result.format).toBe('epub');
    });

    /**
     * 【テスト対象】createBook
     * 【テスト内容】表紙画像ありで書籍を登録する場合
     * 【期待結果】storageService.uploadが2回（書籍ファイル + 表紙画像）呼び出される
     */
    it('should upload both book file and cover image when cover is provided', async () => {
      const mockStorageUpload = jest.spyOn(storageService, 'upload').mockResolvedValue('uuid/file');
      jest.spyOn(BookModelModule.BookModel, 'create').mockResolvedValue(mockBook);

      await booksService.createBook('author-user-id-1234', {
        title: 'テスト書籍',
        bookFile: mockPdfFile,
        coverImageFile: mockCoverImageFile,
      });

      // 書籍ファイルと表紙画像の2回アップロードされることを確認
      expect(mockStorageUpload).toHaveBeenCalledTimes(2);
    });

    /**
     * 【テスト対象】createBook
     * 【テスト内容】不正なMIMEタイプのファイルを登録しようとした場合
     * 【期待結果】ValidationError (400) がスローされる
     */
    it('should throw ValidationError for invalid file type', async () => {
      const invalidFile: Express.Multer.File = {
        ...mockPdfFile,
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      };

      await expect(
        booksService.createBook('author-user-id-1234', {
          title: 'テスト書籍',
          bookFile: invalidFile,
        })
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    /**
     * 【テスト対象】createBook
     * 【テスト内容】MIMEタイプはPDFだがファイル拡張子が不正な場合
     * 【期待結果】ValidationError (400) がスローされる（二重チェック）
     */
    it('should throw ValidationError when extension does not match MIME type', async () => {
      const mismatchedFile: Express.Multer.File = {
        ...mockPdfFile,
        mimetype: 'application/pdf',
        originalname: 'test.exe', // 不正な拡張子
      };

      await expect(
        booksService.createBook('author-user-id-1234', {
          title: 'テスト書籍',
          bookFile: mismatchedFile,
        })
      ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  /**
   * 【テスト対象】updateBook
   * 【テスト内容】著者が自分の書籍を更新する場合
   * 【期待結果】BookModel.updateが呼び出されて更新後の書籍が返される
   */
  describe('updateBook', () => {
    it('should update book for author accessing own book', async () => {
      const updatedBook = { ...mockBook, title: '更新後タイトル' };
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);
      const mockUpdate = jest.spyOn(BookModelModule.BookModel, 'update').mockResolvedValue(updatedBook);

      const result = await booksService.updateBook(
        'book-id-1234',
        'author-user-id-1234',
        'author',
        { title: '更新後タイトル' }
      );

      expect(mockUpdate).toHaveBeenCalledWith('book-id-1234', expect.objectContaining({ title: '更新後タイトル' }));
      expect(result.title).toBe('更新後タイトル');
    });

    /**
     * 【テスト対象】updateBook
     * 【テスト内容】著者が他者の書籍を更新しようとした場合
     * 【期待結果】ForbiddenError (403) がスローされる
     */
    it('should throw ForbiddenError when author tries to update other authors book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);

      await expect(
        booksService.updateBook(
          'book-id-1234',
          'different-author-id',
          'author',
          { title: '更新後タイトル' }
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    /**
     * 【テスト対象】updateBook
     * 【テスト内容】新しいファイルを指定して更新する場合
     * 【期待結果】新しいファイルがS3にアップロードされ、古いファイルが削除される
     */
    it('should upload new file and delete old file when bookFile is provided', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);
      jest.spyOn(BookModelModule.BookModel, 'update').mockResolvedValue(mockBook);
      const mockUpload = jest.spyOn(storageService, 'upload').mockResolvedValue('new-uuid/test.pdf');
      const mockDelete = jest.spyOn(storageService, 'delete').mockResolvedValue();

      await booksService.updateBook(
        'book-id-1234',
        'author-user-id-1234',
        'author',
        { bookFile: mockPdfFile }
      );

      expect(mockUpload).toHaveBeenCalledTimes(1);
      // 古いfileKeyが削除されることを確認
      expect(mockDelete).toHaveBeenCalledWith(mockBook.fileKey);
    });
  });

  /**
   * 【テスト対象】deleteBook
   * 【テスト内容】著者が自分の書籍を削除する場合
   * 【期待結果】BookModel.deleteとstorageService.deleteが呼び出される
   */
  describe('deleteBook', () => {
    it('should delete book and S3 files for author', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);
      const mockDelete = jest.spyOn(BookModelModule.BookModel, 'delete').mockResolvedValue(true);
      const mockStorageDelete = jest.spyOn(storageService, 'delete').mockResolvedValue();

      await booksService.deleteBook('book-id-1234', 'author-user-id-1234', 'author');

      expect(mockDelete).toHaveBeenCalledWith('book-id-1234');
      // fileKeyとcoverImageKeyの両方が削除されることを確認
      expect(mockStorageDelete).toHaveBeenCalledWith(mockBook.fileKey);
      expect(mockStorageDelete).toHaveBeenCalledWith(mockBook.coverImageKey);
    });

    /**
     * 【テスト対象】deleteBook
     * 【テスト内容】著者が他者の書籍を削除しようとした場合
     * 【期待結果】ForbiddenError (403) がスローされる
     */
    it('should throw ForbiddenError when author tries to delete other authors book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);

      await expect(
        booksService.deleteBook('book-id-1234', 'different-author-id', 'author')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    /**
     * 【テスト対象】deleteBook
     * 【テスト内容】存在しない書籍を削除しようとした場合
     * 【期待結果】NotFoundError (404) がスローされる
     */
    it('should throw NotFoundError when book does not exist', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(null);

      await expect(
        booksService.deleteBook('non-existent-id', 'author-user-id-1234', 'author')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    /**
     * 【テスト対象】deleteBook
     * 【テスト内容】adminが任意の書籍を削除する場合
     * 【期待結果】認可エラーなしで削除される
     */
    it('should allow admin to delete any book', async () => {
      jest.spyOn(BookModelModule.BookModel, 'findById').mockResolvedValue(mockBook);
      const mockDelete = jest.spyOn(BookModelModule.BookModel, 'delete').mockResolvedValue(true);
      jest.spyOn(storageService, 'delete').mockResolvedValue();

      await booksService.deleteBook('book-id-1234', 'admin-user-id', 'admin');

      expect(mockDelete).toHaveBeenCalledWith('book-id-1234');
    });
  });
});
