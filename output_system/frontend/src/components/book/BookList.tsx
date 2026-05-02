/**
 * @file BookList.tsx
 * @description 書籍リストコンポーネント
 *
 * 著者の書籍一覧を表示するコンテナコンポーネント。
 * グリッドレイアウトで BookCard コンポーネントを並べて表示する。
 *
 * 機能:
 * - 書籍のグリッド表示（レスポンシブ対応）
 * - 書籍が0件の場合は空状態メッセージを表示
 * - 削除処理を BookCard に委譲
 */

'use client';

import { Book } from '../../lib/api';
import { BookCard } from './BookCard';

/**
 * BookListコンポーネントのProps
 */
export interface BookListProps {
  /** 表示する書籍の配列 */
  books: Book[];
  /** 書籍詳細・編集へ遷移するコールバック */
  onViewDetail: (bookId: string) => void;
  /** 削除ボタンクリック時のコールバック */
  onDelete: (book: Book) => void;
  /** 削除処理中の書籍ID（nullは処理なし） */
  deletingId?: string | null;
  /** 新規登録ボタンのクリックコールバック（空状態時に表示） */
  onCreateNew: () => void;
}

/**
 * 書籍リストコンポーネント
 *
 * 著者の書籍一覧をグリッド形式で表示する。
 * 書籍がない場合は空状態（エンプティステート）を表示する。
 *
 * @param props - コンポーネントのProps
 * @returns {JSX.Element} 書籍リストまたは空状態
 */
export function BookList({
  books,
  onViewDetail,
  onDelete,
  deletingId,
  onCreateNew,
}: BookListProps) {
  // 書籍が0件の場合は空状態を表示
  if (books.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '4rem 2rem',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        {/* プレースホルダーアイコン */}
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>

        {/* メッセージ */}
        <p
          style={{
            fontSize: '1rem',
            color: '#374151',
            marginBottom: '0.5rem',
            fontWeight: '500',
          }}
        >
          まだ書籍が登録されていません
        </p>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '1.5rem',
          }}
        >
          PDFまたはEPUBファイルをアップロードして書籍を登録しましょう
        </p>

        {/* 新規登録ボタン */}
        <button
          onClick={onCreateNew}
          style={{
            padding: '0.625rem 1.5rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          最初の書籍を登録する
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        // レスポンシブなグリッドレイアウト
        // モバイル: 1列、タブレット: 2列、デスクトップ: 3〜4列
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '1.25rem',
      }}
    >
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onViewDetail={onViewDetail}
          onDelete={onDelete}
          isDeleting={deletingId === book.id}
        />
      ))}
    </div>
  );
}
