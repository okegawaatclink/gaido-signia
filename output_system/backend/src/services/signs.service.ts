/**
 * @file signs.service.ts
 * @description サインビジネスロジックサービス
 *
 * サインのCRUD操作に関するビジネスロジックを提供する。
 * - サイン画像（PNG）のS3保存
 * - Canvas描画データ（JSON）のDB保存
 * - 共通/個別サインの種別管理
 * - デフォルトサインのフラグ管理（著者ごとに1つのみ）
 * - 認可チェック（著者は自分のサインのみ操作可）
 *
 * アップロード仕様:
 * - 対応形式: PNG（image/png）
 * - S3キー形式: signs/{uuid}/sign.png（サイン専用プレフィックス）
 */

import { v4 as uuidv4 } from 'uuid';
import { SignModel, Sign, CreateSignParams, UpdateSignParams } from '../models/sign.model';
import { storageService } from './storage.service';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * サイン作成リクエストパラメータ
 */
export interface CreateSignInput {
  /** サイン名（管理用ラベル、必須） */
  name: string;
  /** サイン種別（必須） */
  type: 'common' | 'individual';
  /** サイン画像ファイル（PNG、multer Buffer。必須） */
  imageFile: Express.Multer.File;
  /** Canvas描画データ（JSON文字列またはオブジェクト。必須） */
  canvasData: Record<string, unknown> | string;
  /** デフォルトサインとして設定するか（オプション、デフォルト: false） */
  isDefault?: boolean;
}

/**
 * サイン更新リクエストパラメータ
 */
export interface UpdateSignInput {
  /** サイン名 */
  name?: string;
  /** サイン種別 */
  type?: 'common' | 'individual';
  /** 新しいサイン画像ファイル（PNG、multer Buffer） */
  imageFile?: Express.Multer.File;
  /** 新しいCanvas描画データ */
  canvasData?: Record<string, unknown> | string;
  /** デフォルトサインフラグ */
  isDefault?: boolean;
}

/**
 * サイン画像ファイルを検証する
 * PNG形式のみ許可する
 *
 * @param file - multerのファイルオブジェクト
 * @throws {ValidationError} PNG形式でない場合
 */
function validateSignImageFile(file: Express.Multer.File): void {
  if (file.mimetype !== 'image/png') {
    throw new ValidationError(
      `サイン画像はPNG形式のみ対応しています。(MIMEタイプ: ${file.mimetype})`
    );
  }
}

/**
 * Canvas描画データを安全にパースする
 * 文字列の場合はJSONとしてパース、オブジェクトの場合はそのまま返す
 *
 * @param canvasData - Canvas描画データ（文字列またはオブジェクト）
 * @returns パース済みのCanvas描画データ
 * @throws {ValidationError} JSONパース失敗時
 */
function parseCanvasData(canvasData: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof canvasData === 'string') {
    try {
      return JSON.parse(canvasData);
    } catch {
      throw new ValidationError('canvasDataは有効なJSON形式で指定してください');
    }
  }
  return canvasData;
}

/**
 * サイン画像のS3キーを生成する
 * signs/{uuid}/sign.png 形式で衝突を回避する
 *
 * @returns S3ファイルキー
 */
function generateSignImageKey(): string {
  const uuid = uuidv4();
  // サイン専用プレフィックスでバケット内の整理を容易にする
  return `signs/${uuid}/sign.png`;
}

/**
 * S3サーバーサイド暗号化の設定を取得する
 * books.service.tsと同様の設定（MinIO開発環境ではSSE無効）
 *
 * @returns サーバーサイド暗号化設定値、または無効の場合はundefined
 */
function getServerSideEncryption(): 'AES256' | undefined {
  return process.env.S3_ENABLE_SSE === 'true' ? 'AES256' : undefined;
}

/**
 * サインビジネスロジックサービスクラス
 */
export class SignsService {
  /**
   * 著者のサイン一覧を取得する
   * 著者は自分のサインのみ閲覧可能
   *
   * @param userId - リクエストユーザーID
   * @returns サインの配列
   */
  async getSigns(userId: string): Promise<Sign[]> {
    // author は自分のサインのみ
    return SignModel.findByAuthorId(userId);
  }

  /**
   * サイン詳細を取得する
   * 著者は自分のサインのみアクセス可能
   *
   * @param signId - サインID
   * @param userId - リクエストユーザーID
   * @returns サインオブジェクト
   * @throws {NotFoundError} サインが存在しない場合
   * @throws {ForbiddenError} 他の著者のサインにアクセスしようとした場合
   */
  async getSign(signId: string, userId: string): Promise<Sign> {
    const sign = await SignModel.findById(signId);
    if (!sign) {
      throw new NotFoundError('サインが見つかりません');
    }

    // 自分のサインのみアクセス可能
    if (sign.authorId !== userId) {
      throw new ForbiddenError('このサインにアクセスする権限がありません');
    }

    return sign;
  }

  /**
   * サインを新規作成する
   * PNG画像をS3にアップロードし、Canvas描画データをDBに保存する
   *
   * @param userId - 著者のユーザーID
   * @param input - サイン作成パラメータ
   * @returns 作成したサインオブジェクト
   * @throws {ValidationError} ファイル形式や入力値が不正な場合
   */
  async createSign(userId: string, input: CreateSignInput): Promise<Sign> {
    // サイン画像のファイル形式を検証（PNG必須）
    validateSignImageFile(input.imageFile);

    // Canvas描画データをパース
    const canvasData = parseCanvasData(input.canvasData);

    // サイン画像をS3にアップロード
    const imageKey = generateSignImageKey();
    await storageService.upload({
      key: imageKey,
      body: input.imageFile.buffer,
      contentType: 'image/png',
      serverSideEncryption: getServerSideEncryption(),
      metadata: {
        authorId: userId,
        signType: input.type,
      },
    });

    logger.info('Sign image uploaded to S3', { imageKey, authorId: userId });

    // DBにサイン情報を保存（is_defaultの排他制御はモデル層で実施）
    const createParams: CreateSignParams = {
      authorId: userId,
      name: input.name,
      type: input.type,
      imageKey,
      canvasData,
      isDefault: input.isDefault || false,
    };

    const sign = await SignModel.create(createParams);
    logger.info('Sign created', { signId: sign.id, authorId: userId, type: input.type });

    return sign;
  }

  /**
   * サインを更新する
   * 著者は自分のサインのみ更新可能
   *
   * @param signId - サインID
   * @param userId - リクエストユーザーID
   * @param input - 更新パラメータ
   * @returns 更新後のサインオブジェクト
   * @throws {NotFoundError} サインが存在しない場合
   * @throws {ForbiddenError} 他の著者のサインを更新しようとした場合
   */
  async updateSign(signId: string, userId: string, input: UpdateSignInput): Promise<Sign> {
    // サインの存在と所有権を確認
    const existingSign = await SignModel.findById(signId);
    if (!existingSign) {
      throw new NotFoundError('サインが見つかりません');
    }

    // 自分のサインのみ更新可能
    if (existingSign.authorId !== userId) {
      throw new ForbiddenError('このサインを更新する権限がありません');
    }

    const updateParams: UpdateSignParams = {};

    if (input.name !== undefined) updateParams.name = input.name;
    if (input.type !== undefined) updateParams.type = input.type;
    if (input.isDefault !== undefined) updateParams.isDefault = input.isDefault;

    // Canvas描画データが指定されている場合はパース
    if (input.canvasData !== undefined) {
      updateParams.canvasData = parseCanvasData(input.canvasData);
    }

    // 新しい画像ファイルが指定されている場合はS3にアップロード
    if (input.imageFile) {
      validateSignImageFile(input.imageFile);

      const newImageKey = generateSignImageKey();
      await storageService.upload({
        key: newImageKey,
        body: input.imageFile.buffer,
        contentType: 'image/png',
        serverSideEncryption: getServerSideEncryption(),
        metadata: {
          authorId: userId,
          signType: input.type || existingSign.type,
        },
      });

      // 古いサイン画像をS3から削除（ストレージの無駄遣いを防ぐ）
      if (existingSign.imageKey) {
        await storageService.delete(existingSign.imageKey).catch((err) => {
          // 古いファイルの削除失敗は致命的ではないのでwarnとして記録
          logger.warn('Failed to delete old sign image', {
            imageKey: existingSign.imageKey,
            error: (err as Error).message,
          });
        });
      }

      updateParams.imageKey = newImageKey;
      logger.info('Sign image updated in S3', { newImageKey, signId, authorId: userId });
    }

    const updatedSign = await SignModel.update(signId, userId, updateParams);
    if (!updatedSign) {
      throw new AppError('サインの更新に失敗しました', 500);
    }

    logger.info('Sign updated', { signId, authorId: userId });
    return updatedSign;
  }

  /**
   * サインを削除する
   * S3のサイン画像も合わせて削除する
   * 著者は自分のサインのみ削除可能
   *
   * @param signId - サインID
   * @param userId - リクエストユーザーID
   * @throws {NotFoundError} サインが存在しない場合
   * @throws {ForbiddenError} 他の著者のサインを削除しようとした場合
   */
  async deleteSign(signId: string, userId: string): Promise<void> {
    // サインの存在と所有権を確認
    const sign = await SignModel.findById(signId);
    if (!sign) {
      throw new NotFoundError('サインが見つかりません');
    }

    // 自分のサインのみ削除可能
    if (sign.authorId !== userId) {
      throw new ForbiddenError('このサインを削除する権限がありません');
    }

    // S3からサイン画像を削除
    if (sign.imageKey) {
      await storageService.delete(sign.imageKey).catch((err) => {
        logger.warn('Failed to delete sign image from S3', {
          imageKey: sign.imageKey,
          error: (err as Error).message,
        });
      });
    }

    // DBからサインを削除
    await SignModel.delete(signId);
    logger.info('Sign deleted', { signId, authorId: userId });
  }
}

/**
 * サインサービスのシングルトンインスタンス
 */
export const signsService = new SignsService();
