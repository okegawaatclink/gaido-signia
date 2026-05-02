/**
 * @file errors.ts
 * @description カスタムエラークラス定義
 *
 * アプリケーション全体で使用するカスタムエラークラスを定義する。
 * HTTPステータスコードに対応したエラーを表現する。
 */

/**
 * アプリケーション基底エラークラス
 * HTTPステータスコードとエラーコードを持つ
 */
export class AppError extends Error {
  /**
   * @param message - エラーメッセージ
   * @param statusCode - HTTPステータスコード（デフォルト: 500）
   * @param code - エラーコード（ログや識別用）
   */
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
    // TypeScriptのクラス継承でスタックトレースを正しく維持する
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * 認証エラー (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = '認証が必要です') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 認可エラー (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'アクセス権限がありません') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * リソース未発見エラー (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'リソースが見つかりません') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * バリデーションエラー (400)
 */
export class ValidationError extends AppError {
  constructor(message: string = 'リクエストが不正です') {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * 競合エラー (409)
 * リソースの重複や状態競合時に使用する（例: メールアドレス重複）
 */
export class ConflictError extends AppError {
  constructor(message: string = 'リソースが競合しています') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}
