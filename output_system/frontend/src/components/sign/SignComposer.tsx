/**
 * @file SignComposer.tsx
 * @description サイン合成プレビューコンポーネント
 *
 * 選択されたサイン画像をプレビュー表示するコンポーネント。
 * 合成時のイメージ（サイン画像 + 宛名テキスト）をリアルタイムで確認できる。
 *
 * 表示内容:
 * - サイン画像のプレビュー（S3 API経由で取得）
 * - 宛名テキスト（個別サインの場合）
 * - 合成後の書籍ページのイメージを模したレイアウト
 */

'use client';

import { useState, useEffect } from 'react';
import { Sign, getToken } from '../../lib/api';

/**
 * SignComposer コンポーネントのプロパティ型
 */
export interface SignComposerProps {
  /**
   * プレビュー表示するサインオブジェクト
   * nullの場合はプレースホルダーを表示する
   */
  sign: Sign | null;

  /**
   * 宛名テキスト（個別サインの場合のみ表示）
   * 未指定または空文字列の場合は非表示
   */
  recipientName?: string;
}

/**
 * サイン合成プレビューコンポーネント
 *
 * 選択されたサイン画像と宛名をA4ページを模したレイアウトで表示する。
 * 実際の合成結果のイメージを事前確認できる。
 *
 * @param {SignComposerProps} props - コンポーネントプロパティ
 * @returns {JSX.Element} 合成プレビュー
 */
export default function SignComposer({ sign, recipientName }: SignComposerProps) {
  // サイン画像のURLを管理する（S3署名付きURL取得のため非同期で設定）
  const [signImageUrl, setSignImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // サインが変更されたときにサイン画像URLを取得する
  useEffect(() => {
    if (!sign?.imageKey) {
      setSignImageUrl(null);
      return;
    }

    setIsLoadingImage(true);

    // バックエンドAPIのサイン画像エンドポイントから署名付きURLを取得する
    // Next.jsのrewritesプロキシ経由でバックエンドにアクセスする
    const token = getToken();
    if (!token) {
      setIsLoadingImage(false);
      return;
    }

    // /api/signs/:id/image エンドポイントが署名付きS3 URLを返す
    fetch(`/api/signs/${sign.id}/image`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    })
      .then((response) => {
        if (response.ok) {
          // リダイレクトされたS3 URLを取得する（responseのURLがS3 URL）
          // Fetch APIはリダイレクトを自動フォローするため、response.urlがS3 URL
          return response.url || response.blob().then((blob) => URL.createObjectURL(blob));
        }
        return null;
      })
      .then((url) => {
        if (url && typeof url === 'string') {
          setSignImageUrl(url);
        }
      })
      .catch(() => {
        setSignImageUrl(null);
      })
      .finally(() => {
        setIsLoadingImage(false);
      });
  }, [sign]);

  return (
    <div className="sign-composer">
      {/* A4ページを模したプレビューエリア */}
      <div
        className="preview-page"
        style={{
          // A4比率 (595:842) を模したアスペクト比
          aspectRatio: '595 / 842',
          maxWidth: '300px',
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          gap: '16px',
          position: 'relative',
        }}
      >
        {/* サイン未選択時のプレースホルダー */}
        {!sign && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: '#9ca3af',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span style={{ fontSize: '0.85rem' }}>サインを選択してください</span>
          </div>
        )}

        {/* 画像読み込み中のスピナー */}
        {sign && isLoadingImage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid #e5e7eb',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        )}

        {/* サイン画像 */}
        {sign && !isLoadingImage && signImageUrl && (
          <img
            src={signImageUrl}
            alt={`サイン: ${sign.name}`}
            style={{
              maxWidth: '70%',
              maxHeight: '50%',
              objectFit: 'contain',
            }}
          />
        )}

        {/* サイン画像が取得できない場合のフォールバック */}
        {sign && !isLoadingImage && !signImageUrl && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: '#6b7280',
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span style={{ fontSize: '0.8rem' }}>画像を読み込めません</span>
          </div>
        )}

        {/* 宛名テキスト（個別サインで宛名入力済みの場合のみ表示） */}
        {sign && recipientName && (
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#374151',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            To: {recipientName}
          </p>
        )}

        {/* 「サインページ」ラベル */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            fontSize: '0.65rem',
            color: '#9ca3af',
          }}
        >
          サインページ（2ページ目）
        </div>
      </div>

      {/* スピンアニメーションのCSS */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
