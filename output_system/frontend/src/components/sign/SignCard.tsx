/**
 * @file SignCard.tsx
 * @description サイン一覧カードコンポーネント
 *
 * サイン一覧画面（A5）で使用するカード形式のサイン表示コンポーネント。
 * S3に保存されたサイン画像のプレビューを表示する。
 *
 * 機能:
 * - サイン画像のプレビュー表示（S3 URL経由）
 * - サイン名・種別・デフォルト設定の表示
 * - サイン詳細・編集ページへのナビゲーション
 * - サイン削除ボタン（削除中はスピナー表示）
 *
 * セキュリティ:
 * - S3画像URLは Next.js の rewrites 経由でアクセス
 *   （/api/signs/:id/image → バックエンドが署名付きURLを返す）
 */

'use client';

import { useState, useEffect } from 'react';
import { Sign, getToken } from '../../lib/api';

/**
 * SignCard コンポーネントのプロパティ型
 */
export interface SignCardProps {
  /**
   * 表示するサインオブジェクト
   */
  sign: Sign;

  /**
   * サイン詳細・編集ページへ遷移するコールバック
   *
   * @param signId - 遷移先のサインID
   */
  onViewDetail: (signId: string) => void;

  /**
   * サイン削除コールバック
   * 確認ダイアログは親コンポーネント側で表示する
   *
   * @param sign - 削除するサインオブジェクト
   */
  onDelete: (sign: Sign) => void;

  /**
   * 削除処理中かどうかのフラグ
   * trueの場合は削除ボタンを無効化してスピナーを表示する
   */
  isDeleting?: boolean;
}

/**
 * サイン種別の表示ラベルとスタイル設定
 */
const SIGN_TYPE_CONFIG: Record<Sign['type'], { label: string; bgColor: string; textColor: string }> = {
  common: {
    label: '共通サイン',
    bgColor: '#dbeafe',
    textColor: '#1d4ed8',
  },
  individual: {
    label: '個別サイン',
    bgColor: '#dcfce7',
    textColor: '#15803d',
  },
};

/**
 * サイン一覧カードコンポーネント
 *
 * サイン画像のプレビューと操作ボタンをカード形式で表示する。
 * サイン画像はJWT認証付きフェッチでObjectURLに変換してimg要素に渡す。
 * これにより、Bearer token認証が必要なAPIエンドポイントの画像を表示できる。
 *
 * @param {SignCardProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} サインカード
 */
export default function SignCard({ sign, onViewDetail, onDelete, isDeleting = false }: SignCardProps) {
  /**
   * 画像読み込みエラーフラグ
   * API呼び出しやS3リダイレクトに失敗した場合はプレースホルダーを表示する
   */
  const [imageError, setImageError] = useState(false);

  /**
   * JWT認証でフェッチしたサイン画像のObjectURL
   * コンポーネントがアンマウントされるときにURLをrevokeしてメモリリークを防ぐ
   */
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);

  /**
   * サイン画像をJWT認証付きでフェッチしてObjectURLを生成する
   * <img>タグはAuthorizationヘッダーを送れないため、fetchで取得後にObjectURLを使用する
   */
  useEffect(() => {
    if (!sign.imageKey) return;

    let objectUrl: string | null = null;

    async function fetchSignImage() {
      const token = getToken();
      if (!token) return;

      try {
        const response = await fetch(`/api/signs/${sign.id}/image`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          // S3へのリダイレクトに追従する
          redirect: 'follow',
        });

        if (!response.ok) {
          setImageError(true);
          return;
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setImageObjectUrl(objectUrl);
      } catch {
        // ネットワークエラーやS3アクセスエラーの場合はプレースホルダーを表示
        setImageError(true);
      }
    }

    fetchSignImage();

    // クリーンアップ: ObjectURLをrevokeしてメモリリークを防ぐ
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  // sign.idが変わるとき（例: 削除後の別サイン表示）に再フェッチする
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sign.id, sign.imageKey]);

  // imageObjectUrlをimgUrlとして使う（fetch完了前はnull）
  const imageUrl = imageObjectUrl;

  const typeConfig = SIGN_TYPE_CONFIG[sign.type];

  // 作成日時をフォーマットする（日本語ロケール）
  const createdAt = new Date(sign.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  return (
    <article
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: sign.isDefault ? '2px solid #2563eb' : '1px solid #e5e7eb',
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => onViewDetail(sign.id)}
      role="button"
      aria-label={`${sign.name} の詳細を表示`}
      tabIndex={0}
      onKeyDown={(e) => {
        // Enterキーでも詳細画面に遷移できるようにする（アクセシビリティ対応）
        if (e.key === 'Enter') onViewDetail(sign.id);
      }}
    >
      {/* デフォルトサインバッジ */}
      {sign.isDefault && (
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: '600',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            zIndex: 1,
          }}
          aria-label="デフォルトサイン"
        >
          デフォルト
        </div>
      )}

      {/* サイン画像プレビューエリア */}
      <div
        style={{
          width: '100%',
          height: '160px',
          backgroundColor: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          // チェッカーパターン背景（透明PNG確認用）
          backgroundImage: imageUrl && !imageError
            ? 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)'
            : 'none',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        }}
      >
        {imageUrl && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${sign.name} のプレビュー`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            onError={() => {
              // 画像読み込みエラー時はプレースホルダーに切り替える
              setImageError(true);
            }}
          />
        ) : (
          /* 画像がない場合またはエラー時のプレースホルダー */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#9ca3af',
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>✍️</div>
            <span style={{ fontSize: '0.75rem' }}>
              {imageError ? '画像を読み込めません' : '画像なし'}
            </span>
          </div>
        )}
      </div>

      {/* サイン情報エリア */}
      <div style={{ padding: '1rem' }}>
        {/* サイン名 */}
        <h3
          style={{
            fontSize: '0.9375rem',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '0.5rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={sign.name}
        >
          {sign.name}
        </h3>

        {/* 種別バッジ */}
        <div style={{ marginBottom: '0.5rem' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: '0.75rem',
              fontWeight: '500',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              backgroundColor: typeConfig.bgColor,
              color: typeConfig.textColor,
            }}
            aria-label={`種別: ${typeConfig.label}`}
          >
            {typeConfig.label}
          </span>
        </div>

        {/* 作成日時 */}
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
          作成日: {createdAt}
        </p>

        {/* 操作ボタン */}
        <div
          style={{ display: 'flex', gap: '0.5rem' }}
          // カードクリックイベントが削除ボタンまで伝播しないようにする
          onClick={(e) => e.stopPropagation()}
        >
          {/* 詳細・編集ボタン */}
          <button
            onClick={() => onViewDetail(sign.id)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              transition: 'background-color 0.15s',
            }}
            aria-label={`${sign.name} を編集`}
          >
            詳細・編集
          </button>

          {/* 削除ボタン */}
          <button
            onClick={() => onDelete(sign)}
            disabled={isDeleting}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              backgroundColor: isDeleting ? '#fef2f2' : '#fff',
              color: isDeleting ? '#9ca3af' : '#dc2626',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              transition: 'background-color 0.15s',
              opacity: isDeleting ? 0.7 : 1,
            }}
            aria-label={`${sign.name} を削除`}
            aria-busy={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </article>
  );
}
