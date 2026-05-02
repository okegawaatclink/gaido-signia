/**
 * @file signs.service.test.ts
 * @description サインサービスのユニットテスト
 *
 * テスト対象:
 * - SignsService.getSigns: サイン一覧取得
 * - SignsService.getSign: サイン詳細取得（所有権チェック）
 * - SignsService.createSign: サイン作成（S3アップロード・DB保存）
 * - SignsService.updateSign: サイン更新（所有権チェック・S3更新）
 * - SignsService.deleteSign: サイン削除（所有権チェック・S3削除）
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

// SignModelをモック化してDB接続不要にする
jest.mock('../../src/models/sign.model');

// StorageServiceをモック化してS3接続不要にする
jest.mock('../../src/services/storage.service');

import { SignsService } from '../../src/services/signs.service';
import * as SignModelModule from '../../src/models/sign.model';
import { storageService } from '../../src/services/storage.service';
import { Sign } from '../../src/models/sign.model';

/** テスト用のサインデータ */
const mockSign: Sign = {
  id: 'sign-id-1234',
  authorId: 'author-user-id-1234',
  name: 'テストサイン',
  type: 'common',
  imageKey: 'signs/uuid-1234/sign.png',
  canvasData: { version: '5.3.0', objects: [] },
  isDefault: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** テスト用のmulterファイルオブジェクト（PNG画像） */
const mockPngFile: Express.Multer.File = {
  fieldname: 'signImage',
  originalname: 'sign.png',
  encoding: '7bit',
  mimetype: 'image/png',
  buffer: Buffer.from('fake png content'),
  size: 50 * 1024, // 50KB
  stream: {} as never,
  destination: '',
  filename: '',
  path: '',
};

/** テスト用のmulterファイルオブジェクト（JPG画像 - 不正形式） */
const mockJpgFile: Express.Multer.File = {
  fieldname: 'signImage',
  originalname: 'sign.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from('fake jpg content'),
  size: 50 * 1024,
  stream: {} as never,
  destination: '',
  filename: '',
  path: '',
};

/** テスト用のCanvas描画データ */
const mockCanvasData = {
  version: '5.3.0',
  objects: [
    {
      type: 'path',
      strokeWidth: 2,
      stroke: '#000000',
    },
  ],
};

describe('SignsService', () => {
  let service: SignsService;
  const mockSignModel = SignModelModule.SignModel as jest.Mocked<typeof SignModelModule.SignModel>;
  const mockStorageService = storageService as jest.Mocked<typeof storageService>;

  beforeEach(() => {
    service = new SignsService();
    jest.clearAllMocks();
  });

  // ============================================================
  // getSigns
  // ============================================================

  describe('getSigns', () => {
    /**
     * 【テスト対象】SignsService.getSigns
     * 【テスト内容】著者IDで自分のサイン一覧を取得できる
     * 【期待結果】著者のサイン配列が返される
     */
    it('should return signs for the author', async () => {
      // Arrange
      const userId = 'author-user-id-1234';
      mockSignModel.findByAuthorId.mockResolvedValue([mockSign]);

      // Act
      const result = await service.getSigns(userId);

      // Assert
      expect(mockSignModel.findByAuthorId).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockSign);
    });

    /**
     * 【テスト対象】SignsService.getSigns
     * 【テスト内容】サインが存在しない場合
     * 【期待結果】空の配列が返される
     */
    it('should return empty array when no signs exist', async () => {
      // Arrange
      mockSignModel.findByAuthorId.mockResolvedValue([]);

      // Act
      const result = await service.getSigns('author-no-signs');

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // getSign
  // ============================================================

  describe('getSign', () => {
    /**
     * 【テスト対象】SignsService.getSign
     * 【テスト内容】自分のサインIDで詳細を取得できる
     * 【期待結果】サインオブジェクトが返される
     */
    it('should return the sign when owned by the user', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);

      // Act
      const result = await service.getSign(mockSign.id, mockSign.authorId);

      // Assert
      expect(mockSignModel.findById).toHaveBeenCalledWith(mockSign.id);
      expect(result).toEqual(mockSign);
    });

    /**
     * 【テスト対象】SignsService.getSign
     * 【テスト内容】存在しないサインIDを指定した場合
     * 【期待結果】NotFoundError がスローされる（statusCode: 404）
     *
     * 注意: Jest 30ではカスタムErrorのinstanceofが正しく動作しないため
     *       statusCodeプロパティで検証する（HANDOVER.md参照）
     */
    it('should throw NotFoundError when sign does not exist', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getSign('non-existent-id', 'some-user')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    /**
     * 【テスト対象】SignsService.getSign
     * 【テスト内容】他の著者のサインIDを指定した場合
     * 【期待結果】ForbiddenError がスローされる（statusCode: 403）
     */
    it('should throw ForbiddenError when sign belongs to another author', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);

      // Act & Assert
      await expect(service.getSign(mockSign.id, 'other-author-id')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // ============================================================
  // createSign
  // ============================================================

  describe('createSign', () => {
    /**
     * 【テスト対象】SignsService.createSign
     * 【テスト内容】有効なPNGファイルとCanvas JSONでサインを作成できる
     * 【期待結果】S3アップロードとDB保存が実行され、作成したサインが返される
     */
    it('should create sign with PNG image and canvas data', async () => {
      // Arrange
      const userId = 'author-user-id-1234';
      mockStorageService.upload.mockResolvedValue('signs/uuid/sign.png');
      mockSignModel.create.mockResolvedValue(mockSign);

      // Act
      const result = await service.createSign(userId, {
        name: 'テストサイン',
        type: 'common',
        imageFile: mockPngFile,
        canvasData: mockCanvasData,
        isDefault: false,
      });

      // Assert
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
          body: mockPngFile.buffer,
        })
      );
      expect(mockSignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: userId,
          name: 'テストサイン',
          type: 'common',
          isDefault: false,
        })
      );
      expect(result).toEqual(mockSign);
    });

    /**
     * 【テスト対象】SignsService.createSign
     * 【テスト内容】PNG以外のファイルでサインを作成しようとした場合
     * 【期待結果】ValidationError がスローされ（statusCode: 400）、S3アップロードは実行されない
     */
    it('should throw ValidationError for non-PNG file', async () => {
      // Act & Assert
      await expect(service.createSign('author-id', {
        name: 'テストサイン',
        type: 'common',
        imageFile: mockJpgFile,
        canvasData: mockCanvasData,
      })).rejects.toMatchObject({ statusCode: 400 });

      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    /**
     * 【テスト対象】SignsService.createSign
     * 【テスト内容】JSON文字列形式のcanvasDataでサインを作成できる
     * 【期待結果】JSON文字列がパースされてDBに保存される
     */
    it('should accept canvas data as JSON string', async () => {
      // Arrange
      const userId = 'author-user-id-1234';
      mockStorageService.upload.mockResolvedValue('signs/uuid/sign.png');
      mockSignModel.create.mockResolvedValue(mockSign);

      // Act
      const result = await service.createSign(userId, {
        name: 'テストサイン',
        type: 'individual',
        imageFile: mockPngFile,
        canvasData: JSON.stringify(mockCanvasData), // JSON文字列として渡す
      });

      // Assert
      expect(mockSignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasData: mockCanvasData, // パース後のオブジェクトが渡される
        })
      );
      expect(result).toEqual(mockSign);
    });

    /**
     * 【テスト対象】SignsService.createSign
     * 【テスト内容】不正なJSON文字列のcanvasDataを指定した場合
     * 【期待結果】ValidationError がスローされる（statusCode: 400）
     */
    it('should throw ValidationError for invalid JSON canvasData', async () => {
      // Act & Assert
      await expect(service.createSign('author-id', {
        name: 'テストサイン',
        type: 'common',
        imageFile: mockPngFile,
        canvasData: 'invalid-json-{',
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    /**
     * 【テスト対象】SignsService.createSign
     * 【テスト内容】デフォルトサインとして作成した場合
     * 【期待結果】isDefault: true でDBに保存される
     */
    it('should create sign as default when isDefault is true', async () => {
      // Arrange
      const defaultSign: Sign = { ...mockSign, isDefault: true };
      mockStorageService.upload.mockResolvedValue('signs/uuid/sign.png');
      mockSignModel.create.mockResolvedValue(defaultSign);

      // Act
      const result = await service.createSign('author-user-id-1234', {
        name: 'デフォルトサイン',
        type: 'common',
        imageFile: mockPngFile,
        canvasData: mockCanvasData,
        isDefault: true,
      });

      // Assert
      expect(mockSignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true })
      );
      expect(result.isDefault).toBe(true);
    });
  });

  // ============================================================
  // updateSign
  // ============================================================

  describe('updateSign', () => {
    /**
     * 【テスト対象】SignsService.updateSign
     * 【テスト内容】自分のサインを更新できる
     * 【期待結果】更新後のサインオブジェクトが返される
     */
    it('should update sign when owned by the user', async () => {
      // Arrange
      const updatedSign: Sign = { ...mockSign, name: '更新後のサイン名' };
      mockSignModel.findById.mockResolvedValue(mockSign);
      mockSignModel.update.mockResolvedValue(updatedSign);

      // Act
      const result = await service.updateSign(mockSign.id, mockSign.authorId, {
        name: '更新後のサイン名',
      });

      // Assert
      expect(mockSignModel.update).toHaveBeenCalledWith(
        mockSign.id,
        mockSign.authorId,
        expect.objectContaining({ name: '更新後のサイン名' })
      );
      expect(result.name).toBe('更新後のサイン名');
    });

    /**
     * 【テスト対象】SignsService.updateSign
     * 【テスト内容】新しいPNG画像を指定して更新した場合
     * 【期待結果】S3に新しい画像がアップロードされ、古い画像が削除される
     */
    it('should upload new image and delete old image when image file provided', async () => {
      // Arrange
      const signWithImage: Sign = { ...mockSign, imageKey: 'signs/old-uuid/sign.png' };
      mockSignModel.findById.mockResolvedValue(signWithImage);
      mockStorageService.upload.mockResolvedValue('signs/new-uuid/sign.png');
      mockStorageService.delete.mockResolvedValue(undefined);
      mockSignModel.update.mockResolvedValue({ ...mockSign, imageKey: 'signs/new-uuid/sign.png' });

      // Act
      await service.updateSign(signWithImage.id, signWithImage.authorId, {
        imageFile: mockPngFile,
      });

      // Assert
      expect(mockStorageService.upload).toHaveBeenCalled();
      expect(mockStorageService.delete).toHaveBeenCalledWith('signs/old-uuid/sign.png');
    });

    /**
     * 【テスト対象】SignsService.updateSign
     * 【テスト内容】存在しないサインを更新しようとした場合
     * 【期待結果】NotFoundError がスローされる（statusCode: 404）
     */
    it('should throw NotFoundError when sign does not exist', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateSign('non-existent', 'author-id', { name: 'test' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    /**
     * 【テスト対象】SignsService.updateSign
     * 【テスト内容】他の著者のサインを更新しようとした場合
     * 【期待結果】ForbiddenError がスローされる（statusCode: 403）
     */
    it('should throw ForbiddenError when sign belongs to another author', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);

      // Act & Assert
      await expect(
        service.updateSign(mockSign.id, 'other-author-id', { name: 'test' })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ============================================================
  // deleteSign
  // ============================================================

  describe('deleteSign', () => {
    /**
     * 【テスト対象】SignsService.deleteSign
     * 【テスト内容】自分のサインを削除できる
     * 【期待結果】S3画像とDBレコードが削除される
     */
    it('should delete sign and S3 image when owned by the user', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);
      mockStorageService.delete.mockResolvedValue(undefined);
      mockSignModel.delete.mockResolvedValue(true);

      // Act
      await service.deleteSign(mockSign.id, mockSign.authorId);

      // Assert
      expect(mockStorageService.delete).toHaveBeenCalledWith(mockSign.imageKey as string);
      expect(mockSignModel.delete).toHaveBeenCalledWith(mockSign.id);
    });

    /**
     * 【テスト対象】SignsService.deleteSign
     * 【テスト内容】imageKeyがnullのサインを削除した場合
     * 【期待結果】S3削除はスキップしてDBレコードのみ削除される
     */
    it('should delete sign without S3 deletion when imageKey is null', async () => {
      // Arrange
      const signWithoutImage: Sign = { ...mockSign, imageKey: null };
      mockSignModel.findById.mockResolvedValue(signWithoutImage);
      mockSignModel.delete.mockResolvedValue(true);

      // Act
      await service.deleteSign(signWithoutImage.id, signWithoutImage.authorId);

      // Assert
      expect(mockStorageService.delete).not.toHaveBeenCalled();
      expect(mockSignModel.delete).toHaveBeenCalledWith(signWithoutImage.id);
    });

    /**
     * 【テスト対象】SignsService.deleteSign
     * 【テスト内容】存在しないサインを削除しようとした場合
     * 【期待結果】NotFoundError がスローされる（statusCode: 404）
     */
    it('should throw NotFoundError when sign does not exist', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteSign('non-existent', 'author-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    /**
     * 【テスト対象】SignsService.deleteSign
     * 【テスト内容】他の著者のサインを削除しようとした場合
     * 【期待結果】ForbiddenError がスローされる（statusCode: 403）
     */
    it('should throw ForbiddenError when sign belongs to another author', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);

      // Act & Assert
      await expect(
        service.deleteSign(mockSign.id, 'other-author-id')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    /**
     * 【テスト対象】SignsService.deleteSign
     * 【テスト内容】S3削除が失敗してもDBレコードは削除される
     * 【期待結果】S3エラーをwarnとして記録し、DBレコードは正常に削除される
     */
    it('should still delete DB record even if S3 deletion fails', async () => {
      // Arrange
      mockSignModel.findById.mockResolvedValue(mockSign);
      mockStorageService.delete.mockRejectedValue(new Error('S3 error'));
      mockSignModel.delete.mockResolvedValue(true);

      // Act
      // S3エラーは致命的ではないのでエラーにならない
      await expect(service.deleteSign(mockSign.id, mockSign.authorId)).resolves.not.toThrow();

      // Assert
      expect(mockSignModel.delete).toHaveBeenCalledWith(mockSign.id);
    });
  });
});
