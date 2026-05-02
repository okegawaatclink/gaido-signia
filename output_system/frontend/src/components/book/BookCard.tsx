/**
 * @file BookCard.tsx
 * @description 書籍カードコンポーネント
 *
 * 著者の書籍一覧で表示する書籍カード。
 * 表紙サムネイル・タイトル・ステータスを表示し、
 * 詳細画面へのリンクを提供する。
 *
 * 機能:
 * - 表紙サムネイル（表紙がない場合はプレースホルダー表示）
 * - タイトル・ファイル形式・ステータス・登録日の表示
 * - 詳細・編集画面へのリンク
 * - 削除ボタン（確認は呼び出し元で行う）
 */

'use client';

import { Book } from '../../lib/api';

/**
 * ステータスバッジのスタイル情報
 */
interface StatusStyle {
  /** 表示ラベル */
  label: string;
  /** テキストカラー */
  color: string;
  /** 背景カラー */
  bg: string;
}

/**
 * 書籍ステータスに対応する表示スタイルを返す
 *
 * @param status - 書籍ステータス（draft/published/archived）
 * @returns ステータスの表示スタイル
 */
export function getStatusStyle(status: Book['status']): StatusStyle {
  switch (status) {
    case 'draft':
      return { label: '下書き', color: '#92400e', bg: '#fef3c7' };
    case 'published':
      return { label: '公開中', color: '#065f46', bg: '#d1fae5' };
    case 'archived':
      return { label: 'アーカイブ', color: '#374151', bg: '#f3f4f6' };
    default:
      return { label: status, color: '#374151', bg: '#f3f4f6' };
  }
}

/**
 * ファイルサイズを人間が読みやすい形式に変換する
 *
 * @param bytes - バイト数（null可）
 * @returns フォーマットされたファイルサイズ文字列
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * BookCardコンポーネントのProps
 */
export interface BookCardProps {
  /** 表示する書籍データ */
  book: Book;
  /** 詳細画面へ遷移するコールバック */
  onViewDetail: (bookId: string) => void;
  /** 削除ボタンクリック時のコールバック */
  onDelete: (book: Book) => void;
  /** 削除処理中かどうか */
  isDeleting?: boolean;
}

/**
 * 書籍カードコンポーネント
 *
 * 著者の書籍一覧で各書籍を表示するカード。
 * 表紙サムネイル付きのカード形式で、ステータスと各種操作を提供する。
 *
 * @param props - コンポーネントのProps
 * @returns {JSX.Element} 書籍カード
 */
export function BookCard({ book, onViewDetail, onDelete, isDeleting = false }: BookCardProps) {
  const statusStyle = getStatusStyle(book.status);

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }}
    >
      {/* 表紙サムネイル部分 */}
      <div
        onClick={() => onViewDetail(book.id)}
        style={{
          backgroundColor: book.format === 'pdf' ? '#fef3c7' : '#dbeafe',
          height: '160px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* 表紙画像がない場合はプレースホルダー */}
        {book.coverImageKey ? (
          // TODO: S3からの表紙画像URLを取得して表示する実装（将来対応）
          <div
            style={{
              fontSize: '4rem',
              userSelect: 'none',
            }}
          >
            {book.format === 'pdf' ? '📕' : '📗'}
          </div>
        ) : (
          // デフォルトプレースホルダー
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: 0.7,
            }}
          >
            <div style={{ fontSize: '3.5rem', userSelect: 'none' }}>
              {book.format === 'pdf' ? '📕' : '📗'}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {book.format.toUpperCase()}
            </span>
          </div>
        )}

        {/* ステータスバッジ（右上） */}
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            fontSize: '0.6875rem',
            fontWeight: '600',
            color: statusStyle.color,
            backgroundColor: statusStyle.bg,
            padding: '0.125rem 0.5rem',
            borderRadius: '4px',
          }}
        >
          {statusStyle.label}
        </div>
      </div>

      {/* 書籍情報部分 */}
      <div style={{ padding: '1rem', flex: 1 }}>
        {/* タイトル */}
        <h3
          onClick={() => onViewDetail(book.id)}
          style={{
            fontSize: '0.9375rem',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '0.5rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={book.title}
        >
          {book.title}
        </h3>

        {/* 詳細情報 */}
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          <span>{formatFileSize(book.fileSize)}</span>
          <span style={{ margin: '0 0.375rem' }}>•</span>
          <span>{new Date(book.createdAt).toLocaleDateString('ja-JP')}</span>
        </div>

        {/* アクションボタン */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* 編集ボタン */}
          <button
            onClick={() => onViewDetail(book.id)}
            style={{
              flex: 1,
              padding: '0.375rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: '500',
            }}
          >
            編集
          </button>

          {/* 削除ボタン */}
          <button
            onClick={(e) => {
              // クリックイベントが親コンテナに伝播しないようにする
              e.stopPropagation();
              onDelete(book);
            }}
            disabled={isDeleting}
            style={{
              padding: '0.375rem 0.75rem',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              backgroundColor: isDeleting ? '#f3f4f6' : '#fff',
              color: '#ef4444',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.8125rem',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? '...' : '削除'}
          </button>
        </div>
      </div>
    </div>
  );
}
