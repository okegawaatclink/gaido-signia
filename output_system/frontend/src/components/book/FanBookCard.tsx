/**
 * @file FanBookCard.tsx
 * @description ファン向け書籍カードコンポーネント
 *
 * ファンの本棚で表示するサイン入り書籍カード。
 * 表紙サムネイル・タイトル・著者名・サイン種別を表示する。
 * 書籍タップ/クリックで閲覧アクションを実行する。
 *
 * 機能:
 * - 表紙画像（署名付きURL）を Next.js Image で最適化表示
 * - 表紙なしの場合はプレースホルダー表示
 * - サイン種別バッジ（個別サイン/共通サイン/未合成）
 * - 合成処理中の状態表示
 * - レスポンシブカードレイアウト
 */

'use client';

import Image from 'next/image';
import { BookshelfItem } from '../../lib/api';

/**
 * サイン種別の表示情報
 */
interface SignTypeBadge {
  /** 表示ラベル */
  label: string;
  /** テキストカラー */
  color: string;
  /** 背景カラー */
  bg: string;
  /** アイコン */
  icon: string;
}

/**
 * サイン種別に対応する表示バッジ情報を返す
 *
 * @param signType - サイン種別（'individual' | 'common' | null）
 * @param status - サイン合成ステータス
 * @returns バッジの表示スタイル
 */
function getSignTypeBadge(
  signType: string | null | undefined,
  status: string | null | undefined
): SignTypeBadge {
  if (!status) {
    // サイン未付与
    return { label: 'サインなし', color: '#6b7280', bg: '#f3f4f6', icon: '📖' };
  }
  if (status === 'processing') {
    return { label: 'サイン合成中', color: '#92400e', bg: '#fef3c7', icon: '⏳' };
  }
  if (status === 'error') {
    return { label: '合成エラー', color: '#991b1b', bg: '#fee2e2', icon: '⚠️' };
  }
  // completed
  if (signType === 'individual') {
    return { label: '個別サイン', color: '#5b21b6', bg: '#ede9fe', icon: '✍️' };
  }
  return { label: '共通サイン', color: '#065f46', bg: '#d1fae5', icon: '✏️' };
}

/**
 * FanBookCardコンポーネントのProps
 */
export interface FanBookCardProps {
  /** 本棚アイテムデータ */
  item: BookshelfItem;
  /** 書籍クリック時のコールバック（閲覧アクション） */
  onRead: (bookId: string) => void;
  /** 読み込み中かどうか */
  isLoading?: boolean;
}

/**
 * ファン向け書籍カードコンポーネント
 *
 * 表紙サムネイル・タイトル・サイン情報を表示し、
 * クリックで書籍閲覧アクションを実行する。
 *
 * @param props - コンポーネントのProps
 * @returns {JSX.Element} 書籍カード
 */
export function FanBookCard({ item, onRead, isLoading = false }: FanBookCardProps) {
  const { book, signedBook } = item;
  const badge = getSignTypeBadge(signedBook?.signType, signedBook?.status);

  /** 書籍が閲覧可能かどうか（合成完了または未合成書籍のみ） */
  const isReadable = !signedBook || signedBook.status === 'completed';

  return (
    <div
      style={{
        ...styles.card,
        cursor: isReadable && !isLoading ? 'pointer' : 'default',
        opacity: isLoading ? 0.7 : 1,
      }}
      onClick={() => {
        if (isReadable && !isLoading) {
          onRead(book.id);
        }
      }}
      onMouseEnter={(e) => {
        if (isReadable && !isLoading) {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
      role="article"
      aria-label={`${book.title} - ${badge.label}`}
    >
      {/* 表紙画像エリア */}
      <div style={styles.coverArea}>
        {book.coverImageUrl ? (
          /* 表紙画像がある場合は Next.js Image で最適化表示 */
          <Image
            src={book.coverImageUrl}
            alt={`${book.title}の表紙`}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            // 署名付きURLは外部URLのためunoptimized設定が必要な場合がある
            unoptimized
          />
        ) : (
          /* 表紙なしプレースホルダー */
          <div style={styles.coverPlaceholder}>
            <span style={styles.coverIcon}>
              {book.format === 'pdf' ? '📕' : '📗'}
            </span>
            <span style={styles.coverFormatLabel}>
              {book.format.toUpperCase()}
            </span>
          </div>
        )}

        {/* サイン種別バッジ（右上） */}
        <div
          style={{
            ...styles.badge,
            color: badge.color,
            backgroundColor: badge.bg,
          }}
        >
          <span style={styles.badgeIcon}>{badge.icon}</span>
          <span>{badge.label}</span>
        </div>
      </div>

      {/* 書籍情報エリア */}
      <div style={styles.infoArea}>
        {/* タイトル */}
        <h3 style={styles.title} title={book.title}>
          {book.title}
        </h3>

        {/* サイン情報（宛名） */}
        {signedBook?.recipientName && (
          <p style={styles.recipientName}>
            宛先: {signedBook.recipientName}
          </p>
        )}

        {/* 閲覧ボタン */}
        {isReadable && (
          <div style={styles.readButtonContainer}>
            <span style={styles.readButton}>
              {isLoading ? '読み込み中...' : '閲覧する →'}
            </span>
          </div>
        )}

        {/* 合成中インジケーター */}
        {signedBook?.status === 'processing' && (
          <div style={styles.processingIndicator}>
            <span>サインを合成中です...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    border: '1px solid #f3f4f6',
  },
  coverArea: {
    position: 'relative',
    height: '200px',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    backgroundColor: '#f8fafc',
  },
  coverIcon: {
    fontSize: '4rem',
    lineHeight: 1,
    userSelect: 'none',
  },
  coverFormatLabel: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    fontWeight: '500',
    letterSpacing: '0.1em',
  },
  badge: {
    position: 'absolute',
    top: '0.625rem',
    right: '0.625rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: '600',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
  },
  badgeIcon: {
    fontSize: '0.75rem',
    lineHeight: 1,
  },
  infoArea: {
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flex: 1,
  },
  title: {
    fontSize: '0.9375rem',
    fontWeight: '600',
    color: '#111827',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    // 2行以上は省略
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    lineHeight: 1.4,
  },
  recipientName: {
    fontSize: '0.8125rem',
    color: '#7c3aed',
    margin: 0,
    fontWeight: '500',
  },
  readButtonContainer: {
    marginTop: '0.5rem',
  },
  readButton: {
    fontSize: '0.875rem',
    color: '#0070f3',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  processingIndicator: {
    fontSize: '0.8125rem',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '0.375rem 0.625rem',
    borderRadius: '6px',
    marginTop: '0.25rem',
  },
};
