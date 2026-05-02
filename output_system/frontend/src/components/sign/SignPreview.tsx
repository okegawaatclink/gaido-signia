/**
 * @file SignPreview.tsx
 * @description サインプレビュー表示コンポーネント
 *
 * 保存前にサインのプレビューを表示する。
 * Blobオブジェクト（CanvasのPNG出力）をObjectURLに変換して表示する。
 *
 * 使用例:
 * - サイン作成画面でCanvasの描画内容を保存前に確認するために使用
 * - SignCanvas.getCanvasPNGBlob() の出力を受け取って表示する
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * SignPreview コンポーネントのプロパティ型
 */
export interface SignPreviewProps {
  /**
   * 表示するPNG画像のBlob
   * null の場合はプレースホルダーを表示する
   */
  pngBlob: Blob | null;

  /**
   * プレビューエリアの幅（px）。デフォルト: 300
   */
  width?: number;

  /**
   * プレビューエリアの高さ（px）。デフォルト: 150
   */
  height?: number;
}

/**
 * サインプレビューコンポーネント
 *
 * PNGのBlobをObjectURLに変換してimgタグで表示する。
 * ObjectURLはコンポーネントのアンマウント時に自動的にrevokeされる。
 */
export default function SignPreview({ pngBlob, width = 300, height = 150 }: SignPreviewProps) {
  /** 表示用のObjectURL */
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  /**
   * pngBlobが変更されたときにObjectURLを生成・更新する
   * メモリリーク防止のため、以前のObjectURLをrevokeしてから新しいURLを生成する
   */
  useEffect(() => {
    if (!pngBlob) {
      // Blobがない場合はObjectURLをクリア
      setObjectUrl(null);
      return;
    }

    // 新しいObjectURLを生成
    const url = URL.createObjectURL(pngBlob);
    setObjectUrl(url);

    // クリーンアップ: ObjectURLを解放してメモリリークを防ぐ
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pngBlob]);

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: '100%',
        border: '1.5px solid #d1d5db',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
      role="img"
      aria-label={objectUrl ? 'サインのプレビュー' : 'サインのプレビュー（未作成）'}
    >
      {objectUrl ? (
        // サイン画像を表示
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt="サインプレビュー"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            // 背景が透明のPNGを視覚的に確認しやすくするためのチェッカーパターン背景
            backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        />
      ) : (
        // サインが未作成の場合はプレースホルダーを表示
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#9ca3af',
        }}>
          <div style={{ fontSize: '2rem' }}>✍️</div>
          <span style={{ fontSize: '0.8rem' }}>
            左のキャンバスでサインを描くと<br />ここにプレビューが表示されます
          </span>
        </div>
      )}
    </div>
  );
}
