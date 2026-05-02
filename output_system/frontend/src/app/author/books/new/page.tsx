/**
 * @file author/books/new/page.tsx
 * @description 書籍登録画面
 *
 * 著者がPDF/EPUBファイルをアップロードしてメタデータとともに書籍を登録する画面。
 *
 * 機能:
 * - ファイルアップロードUI（ドラッグ&ドロップ対応）
 * - PDF/EPUB形式バリデーション（クライアントサイド）
 * - ファイルサイズ表示（50MB制限）
 * - 表紙画像アップロード（オプション）
 * - アップロード進捗表示
 * - 登録完了後に書籍一覧画面にリダイレクト
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, apiGetMe, apiCreateBook, AuthUser, ApiError } from '../../../../lib/api';

/**
 * ファイルサイズを人間が読みやすい形式に変換する
 * 例: 1048576 → "1.0 MB"
 *
 * @param bytes - バイト数
 * @returns フォーマットされたファイルサイズ文字列
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 書籍ファイルの最大サイズ（50MB） */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** 許可する書籍ファイルのMIMEタイプ */
const ALLOWED_BOOK_MIME_TYPES = ['application/pdf', 'application/epub+zip', 'application/x-epub+zip'];

/** 許可する書籍ファイルの拡張子 */
const ALLOWED_BOOK_EXTENSIONS = ['.pdf', '.epub'];

/**
 * 書籍登録画面コンポーネント
 *
 * @returns {JSX.Element} 書籍登録フォーム
 */
export default function NewBookPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // フォームの状態
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isbn, setIsbn] = useState('');

  // ファイルの状態
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);

  // UI状態
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ファイル入力のref
  const bookFileInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  // マウント時に認証状態を確認する
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }
      try {
        const result = await apiGetMe();
        if (result.user.role !== 'author') {
          router.push('/admin/login');
          return;
        }
        setUser(result.user);
      } catch {
        router.push('/admin/login');
      } finally {
        setIsAuthLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  /**
   * 書籍ファイルを検証する（クライアントサイドバリデーション）
   * - MIMEタイプと拡張子の両方を確認する
   * - ファイルサイズが50MBを超えていないか確認する
   *
   * @param file - 検証するファイル
   * @returns エラーメッセージ、またはnull（検証OK）
   */
  function validateBookFile(file: File): string | null {
    // MIMEタイプ検証
    if (!ALLOWED_BOOK_MIME_TYPES.includes(file.type)) {
      return `対応していないファイル形式です。PDFまたはEPUBファイルを選択してください。(${file.type})`;
    }
    // 拡張子検証
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_BOOK_EXTENSIONS.includes(ext)) {
      return `対応していない拡張子です。.pdf または .epub ファイルを選択してください。`;
    }
    // サイズ検証
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `ファイルサイズが上限（50MB）を超えています。（現在: ${formatFileSize(file.size)}）`;
    }
    return null;
  }

  /**
   * 書籍ファイルをセットする
   * バリデーションを行い、エラーがあればエラーメッセージを表示する
   *
   * @param file - セットするファイル
   */
  function handleBookFileSelect(file: File) {
    const error = validateBookFile(file);
    if (error) {
      setFileError(error);
      setBookFile(null);
    } else {
      setFileError(null);
      setBookFile(file);
    }
  }

  /**
   * ドラッグオーバー時のイベントハンドラー
   * ドラッグ中にドロップゾーンのスタイルを変更する
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  /**
   * ドラッグリーブ時のイベントハンドラー
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  /**
   * ドロップ時のイベントハンドラー
   * ドロップされたファイルをバリデーションしてセットする
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    handleBookFileSelect(files[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ファイル選択ダイアログからのファイル選択ハンドラー
   */
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleBookFileSelect(file);
    }
  }

  /**
   * 表紙画像選択ハンドラー
   * 選択した画像のプレビューを表示する
   */
  function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCoverImageFile(file);

    // プレビュー用のURL生成（FileReader APIを使用）
    const reader = new FileReader();
    reader.onloadend = () => {
      setCoverImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  /**
   * 書籍ファイルをクリアする
   */
  function handleClearBookFile() {
    setBookFile(null);
    setFileError(null);
    if (bookFileInputRef.current) {
      bookFileInputRef.current.value = '';
    }
  }

  /**
   * 表紙画像をクリアする
   */
  function handleClearCoverImage() {
    setCoverImageFile(null);
    setCoverImagePreview(null);
    if (coverImageInputRef.current) {
      coverImageInputRef.current.value = '';
    }
  }

  /**
   * フォーム送信ハンドラー
   * FormDataを作成してAPIに送信する
   * アップロード中はボタンを無効化してダブルクリックを防止する
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!bookFile) {
      setFileError('電子書籍ファイルを選択してください');
      return;
    }

    if (!title.trim()) {
      setSubmitError('タイトルを入力してください');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // 進捗を擬似的に表示（fetchはXHRと異なりネイティブな進捗イベントが不可）
    // アップロード中はユーザーに視覚的なフィードバックを与えるため擬似進捗を表示する
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        // 90%まで段階的に進める（100%は完了時にセット）
        if (prev < 90) {
          return Math.min(prev + Math.random() * 15, 90);
        }
        return prev;
      });
    }, 300);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      if (description.trim()) {
        formData.append('description', description.trim());
      }
      // 電子書籍ファイル（必須）
      formData.append('bookFile', bookFile, bookFile.name);
      // 表紙画像（オプション）
      if (coverImageFile) {
        formData.append('coverImage', coverImageFile, coverImageFile.name);
      }
      // メタデータ（ISBNが入力されている場合）
      if (isbn.trim()) {
        formData.append('metadata', JSON.stringify({ isbn: isbn.trim() }));
      }

      await apiCreateBook(formData);

      setUploadProgress(100);

      // 登録完了後に書籍一覧画面にリダイレクト
      setTimeout(() => {
        router.push('/author/books');
      }, 500);
    } catch (error) {
      const apiError = error as ApiError;
      setSubmitError(apiError.message || '書籍の登録に失敗しました');
      setUploadProgress(0);
    } finally {
      clearInterval(progressInterval);
      setIsSubmitting(false);
    }
  }

  if (isAuthLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* ヘッダー */}
      <header style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.push('/author/books')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '1.2rem',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="書籍一覧に戻る"
          >
            ←
          </button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            書籍登録
          </h1>
        </div>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {user?.name}（著者）
        </span>
      </header>

      {/* メインコンテンツ */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          {/* ファイルアップロードセクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              電子書籍ファイル <span style={{ color: '#ef4444' }}>*</span>
            </h2>

            {/* ドロップゾーン */}
            {!bookFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => bookFileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#2563eb' : fileError ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '8px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
                  transition: 'all 0.2s',
                }}
                role="button"
                aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && bookFileInputRef.current?.click()}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
                  ここにファイルをドラッグ&ドロップ
                </p>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  または
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    bookFileInputRef.current?.click();
                  }}
                  style={{
                    padding: '0.5rem 1.25rem',
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                  }}
                >
                  ファイルを選択
                </button>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '1rem' }}>
                  対応形式: PDF, EPUB（最大50MB）
                </p>
              </div>
            ) : (
              /* 選択されたファイルの表示 */
              <div style={{
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f0fdf4',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {bookFile.name.endsWith('.pdf') ? '📕' : '📗'}
                  </span>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                      {bookFile.name}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {formatFileSize(bookFile.size)} • {bookFile.name.endsWith('.pdf') ? 'PDF' : 'EPUB'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearBookFile}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    fontSize: '1.2rem',
                    padding: '0.25rem',
                  }}
                  aria-label="ファイルを削除"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ファイルエラー表示 */}
            {fileError && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {fileError}
              </p>
            )}

            {/* 隠しファイル入力 */}
            <input
              ref={bookFileInputRef}
              type="file"
              accept=".pdf,.epub"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          </section>

          {/* メタデータセクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              書籍情報
            </h2>

            {/* タイトル入力 */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="title"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}
              >
                タイトル <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="書籍のタイトルを入力してください"
                maxLength={200}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#111827',
                  backgroundColor: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                {title.length}/200文字
              </p>
            </div>

            {/* 説明入力 */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="description"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}
              >
                書籍説明
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="書籍の内容や概要を入力してください（オプション）"
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#111827',
                  backgroundColor: '#fff',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* ISBN入力 */}
            <div>
              <label
                htmlFor="isbn"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}
              >
                ISBN（オプション）
              </label>
              <input
                id="isbn"
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978-4-xxxx-xxxx-x"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#111827',
                  backgroundColor: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </section>

          {/* 表紙画像セクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              表紙画像（オプション）
            </h2>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {/* 表紙画像プレビュー */}
              <div style={{
                width: '120px',
                height: '160px',
                border: '1px dashed #d1d5db',
                borderRadius: '6px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f9fafb',
                flexShrink: 0,
              }}>
                {coverImagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverImagePreview}
                    alt="表紙画像プレビュー"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '2rem' }}>🖼️</span>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <input
                  ref={coverImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverImageChange}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => coverImageInputRef.current?.click()}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    marginBottom: '0.5rem',
                    display: 'block',
                  }}
                >
                  画像を選択
                </button>
                {coverImageFile && (
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      {coverImageFile.name} ({formatFileSize(coverImageFile.size)})
                    </p>
                    <button
                      type="button"
                      onClick={handleClearCoverImage}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        padding: '0',
                      }}
                    >
                      削除
                    </button>
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  対応形式: JPEG, PNG, WebP
                </p>
              </div>
            </div>
          </section>

          {/* アップロード進捗表示 */}
          {isSubmitting && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#374151' }}>アップロード中...</span>
                <span style={{ fontSize: '0.875rem', color: '#374151' }}>{Math.round(uploadProgress)}%</span>
              </div>
              <div style={{
                height: '8px',
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#2563eb',
                  borderRadius: '4px',
                  width: `${uploadProgress}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {submitError && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}>
              {submitError}
            </div>
          )}

          {/* 送信ボタン */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.push('/author/books')}
              disabled={isSubmitting}
              style={{
                padding: '0.625rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#fff',
                color: '#374151',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !bookFile || !title.trim()}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: isSubmitting || !bookFile || !title.trim() ? '#93c5fd' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isSubmitting || !bookFile || !title.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
              }}
            >
              {isSubmitting ? '登録中...' : '書籍を登録する'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
