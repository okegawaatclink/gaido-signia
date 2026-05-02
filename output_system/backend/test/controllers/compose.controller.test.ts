/**
 * @file compose.controller.test.ts
 * @description サイン合成コントローラーのユニットテスト
 *
 * テスト対象:
 * - createCompose: POST /api/compose 合成リクエスト受付
 * - getCompose: GET /api/compose/:id 合成結果取得
 *
 * ComposeServiceをモック化してHTTPリクエスト処理のみをテストする
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// ComposeServiceをモック化してサービス依存を排除する
jest.mock('../../src/services/compose.service');

// DBへの接続が発生しないようにモック化する
jest.mock('../../src/config/database', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  },
}));

// express-validatorのvalidationResultをモック化
jest.mock('express-validator', () => ({
  ...jest.requireActual('express-validator'),
  validationResult: jest.fn(),
}));

import { createCompose, getCompose } from '../../src/controllers/compose.controller';
import { composeService } from '../../src/services/compose.service';
import { validationResult } from 'express-validator';
import { NotFoundError, ForbiddenError } from '../../src/utils/errors';
import { ComposeJobResult, ComposeResult } from '../../src/services/compose.service';
import { SignedBook } from '../../src/models/signed-book.model';

/**
 * モック用のExpressリクエストオブジェクトを生成する
 *
 * @param overrides - 上書きするプロパティ
 */
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: {
      userId: 'author-user-id-1234',
      email: 'author@example.com',
      role: 'author',
    },
    params: {},
    body: {},
    ...overrides,
  };
}

/**
 * モック用のExpressレスポンスオブジェクトを生成する
 */
function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

/** テスト用の合成結果データ */
const mockComposeResult: ComposeJobResult = {
  bookId: 'book-id-1234',
  signId: 'sign-id-1234',
  results: [
    {
      signedBookId: 'signed-book-id-1234',
      fanId: 'fan-id-1234',
      status: 'completed',
    } as ComposeResult,
  ],
  successCount: 1,
  errorCount: 0,
};

/** テスト用のサイン入り書籍データ */
const mockSignedBook: SignedBook = {
  id: 'signed-book-id-1234',
  bookId: 'book-id-1234',
  signId: 'sign-id-1234',
  fanId: 'fan-id-1234',
  recipientName: null,
  signedFileKey: 'signed-books/uuid/file.pdf',
  status: 'completed',
  composedAt: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
};

/**
 * バリデーション成功のモックを設定する
 */
function mockValidationSuccess(): void {
  // validationResultをunknownを経由してjest.Mockにキャスト（型安全なモック設定）
  (validationResult as unknown as jest.Mock).mockReturnValue({
    isEmpty: jest.fn().mockReturnValue(true),
    array: jest.fn().mockReturnValue([]),
  });
}

/**
 * バリデーション失敗のモックを設定する
 *
 * @param errors - バリデーションエラーメッセージの配列
 */
function mockValidationFailure(errors: { msg: string }[]): void {
  (validationResult as unknown as jest.Mock).mockReturnValue({
    isEmpty: jest.fn().mockReturnValue(false),
    array: jest.fn().mockReturnValue(errors),
  });
}

describe('compose.controller', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  describe('createCompose', () => {
    /**
     * 【テスト対象】createCompose
     * 【テスト内容】正常系: 合成リクエストが202 Acceptedで受け付けられる
     * 【期待結果】
     * - composeService.executeが呼ばれる
     * - res.status(202).json()で合成結果が返される
     */
    it('should return 202 with compose result on success', async () => {
      mockValidationSuccess();
      (composeService.execute as jest.Mock).mockResolvedValue(mockComposeResult);

      const req = createMockRequest({
        body: {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
        },
      });
      const res = createMockResponse();

      await createCompose(req as Request, res as Response, next);

      // 202 Acceptedが返されたことを確認
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(mockComposeResult);

      // composeService.executeが正しいパラメータで呼ばれたことを確認
      expect(composeService.execute).toHaveBeenCalledWith('author-user-id-1234', {
        bookId: 'book-id-1234',
        signId: 'sign-id-1234',
        fanIds: ['fan-id-1234'],
        recipientNames: undefined,
      });
    });

    /**
     * 【テスト対象】createCompose
     * 【テスト内容】個別サイン: recipientNamesが渡される
     * 【期待結果】composeService.executeにrecipientNamesが渡される
     */
    it('should pass recipientNames to compose service when provided', async () => {
      mockValidationSuccess();
      (composeService.execute as jest.Mock).mockResolvedValue(mockComposeResult);

      const recipientNames = { 'fan-id-1234': 'テスト太郎' };
      const req = createMockRequest({
        body: {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
          recipientNames,
        },
      });
      const res = createMockResponse();

      await createCompose(req as Request, res as Response, next);

      expect(composeService.execute).toHaveBeenCalledWith(
        'author-user-id-1234',
        expect.objectContaining({ recipientNames })
      );
    });

    /**
     * 【テスト対象】createCompose
     * 【テスト内容】バリデーションエラーの場合に400エラーがnextに渡される
     * 【期待結果】next(ValidationError)が呼ばれる
     */
    it('should call next with ValidationError when validation fails', async () => {
      mockValidationFailure([
        { msg: '書籍IDは必須です' },
        { msg: 'fanIdsは1件以上のUUID配列を指定してください' },
      ]);

      const req = createMockRequest({
        body: {},
      });
      const res = createMockResponse();

      await createCompose(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('書籍IDは必須です'),
          statusCode: 400,
        })
      );
    });

    /**
     * 【テスト対象】createCompose
     * 【テスト内容】author以外（fan）が呼んだ場合はnextにエラーが渡される
     * 【テスト内容】コントローラー層ではロールチェックはルーター層で行うため、
     *               ここでは composeService.execute がForbiddenErrorを投げるケースをテスト
     * 【期待結果】next(ForbiddenError)が呼ばれる
     */
    it('should call next with ForbiddenError when service throws it', async () => {
      mockValidationSuccess();
      (composeService.execute as jest.Mock).mockRejectedValue(
        new ForbiddenError('この書籍に対する操作権限がありません')
      );

      const req = createMockRequest({
        body: {
          bookId: 'book-id-1234',
          signId: 'sign-id-1234',
          fanIds: ['fan-id-1234'],
        },
      });
      const res = createMockResponse();

      await createCompose(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });
  });

  describe('getCompose', () => {
    /**
     * 【テスト対象】getCompose
     * 【テスト内容】正常系: サイン入り書籍の詳細が200で返される
     * 【期待結果】
     * - composeService.getSignedBookが呼ばれる
     * - res.status(200).json({ signedBook })が返される
     */
    it('should return 200 with signed book detail on success', async () => {
      (composeService.getSignedBook as jest.Mock).mockResolvedValue(mockSignedBook);

      const req = createMockRequest({
        params: { id: 'signed-book-id-1234' },
      });
      const res = createMockResponse();

      await getCompose(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ signedBook: mockSignedBook });
      expect(composeService.getSignedBook).toHaveBeenCalledWith(
        'signed-book-id-1234',
        'author-user-id-1234'
      );
    });

    /**
     * 【テスト対象】getCompose
     * 【テスト内容】存在しないIDの場合にnextにNotFoundErrorが渡される
     * 【期待結果】next(NotFoundError)が呼ばれる
     */
    it('should call next with NotFoundError when signed book not found', async () => {
      (composeService.getSignedBook as jest.Mock).mockRejectedValue(
        new NotFoundError('サイン入り書籍が見つかりません')
      );

      const req = createMockRequest({
        params: { id: 'non-existent-id' },
      });
      const res = createMockResponse();

      await getCompose(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    /**
     * 【テスト対象】getCompose
     * 【テスト内容】他の著者のリソースアクセス時にnextにForbiddenErrorが渡される
     * 【期待結果】next(ForbiddenError)が呼ばれる
     */
    it('should call next with ForbiddenError when accessing another authors resource', async () => {
      (composeService.getSignedBook as jest.Mock).mockRejectedValue(
        new ForbiddenError('このサイン入り書籍にアクセスする権限がありません')
      );

      const req = createMockRequest({
        params: { id: 'signed-book-id-1234' },
      });
      const res = createMockResponse();

      await getCompose(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });
  });
});
