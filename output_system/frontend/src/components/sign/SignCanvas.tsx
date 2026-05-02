/**
 * @file SignCanvas.tsx
 * @description Fabric.js ベースの手書きサイン Canvas コンポーネント
 *
 * 著者がタブレット上でペンを使って手書きサインを描画するUIを提供する。
 *
 * 機能:
 * - マウスおよびタッチ（iPad Safari）による手書き描画
 * - ペンの太さ選択（細/中/太）
 * - ペンの色選択（黒/青/赤）
 * - Undo（直前のストローク取り消し）
 * - クリア（全描画消去）
 * - Canvas描画データのJSON出力（Fabric.js toJSON形式）
 * - Canvas描画のPNG画像出力（Blob形式）
 *
 * 技術的な注意点:
 * - Fabric.jsのfreeDrawingBrushを使用してタッチ描画に対応
 * - 高DPIディスプレイ対応（devicePixelRatioを考慮）
 * - 描画中のページスクロール防止（touchmoveのpreventDefault）
 * - Next.jsのSSRではCanvas APIが使えないため動的インポート必須
 */

'use client';

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

/**
 * Fabric.js Canvas インスタンスの最低限の型定義
 * 動的インポートのため、実際に使用するメソッドのみ定義する
 */
interface FabricObject {
  [key: string]: unknown;
}

interface FabricCanvasInstance {
  isDrawingMode: boolean;
  freeDrawingBrush: {
    width: number;
    color: string;
  };
  dispose(): void;
  getObjects(): FabricObject[];
  remove(obj: FabricObject): void;
  clear(): void;
  renderAll(): void;
  toJSON(): Record<string, unknown>;
  toDataURL(options: { format: string; quality: number; multiplier: number }): string;
  on(event: string, callback: () => void): void;
  selection: boolean;
}

/**
 * ペンの太さの選択肢
 * 細（2px）/ 中（5px）/ 太（10px）
 */
const PEN_SIZES = [
  { label: '細', value: 2 },
  { label: '中', value: 5 },
  { label: '太', value: 10 },
] as const;

/**
 * ペンの色の選択肢
 */
const PEN_COLORS = [
  { label: '黒', value: '#1a1a1a', swatch: '#1a1a1a' },
  { label: '青', value: '#1e40af', swatch: '#1e40af' },
  { label: '赤', value: '#b91c1c', swatch: '#b91c1c' },
] as const;

/**
 * Canvas の論理サイズ（px）
 * タブレット向けに横長レイアウトを採用
 */
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 300;

/**
 * SignCanvas が親コンポーネントに公開するメソッド
 * ref経由で親から呼び出し可能
 */
export interface SignCanvasRef {
  /**
   * Canvas描画データをJSON形式で取得する
   * Fabric.js の toJSON() 形式で返す
   *
   * @returns Fabric.js JSON オブジェクト
   */
  getCanvasJSON: () => Record<string, unknown>;

  /**
   * Canvas描画をPNG画像（Blob）として取得する
   * S3へのアップロードに使用する
   *
   * @returns PNG Blob オブジェクト
   */
  getCanvasPNGBlob: () => Promise<Blob>;

  /**
   * Canvasが空（何も描かれていない）かどうかを判定する
   *
   * @returns 空の場合 true
   */
  isEmpty: () => boolean;
}

/**
 * SignCanvas コンポーネントのプロパティ型
 */
export interface SignCanvasProps {
  /**
   * Canvasの幅（px）。デフォルト: 600
   */
  width?: number;

  /**
   * Canvasの高さ（px）。デフォルト: 300
   */
  height?: number;

  /**
   * 描画完了時（ストロークが追加されたとき）のコールバック
   * 親コンポーネントが描画状態の変化を検知するために使用
   */
  onDrawingChange?: () => void;
}

/**
 * 手書きサイン Canvas コンポーネント
 *
 * forwardRef を使用して親コンポーネントから ref 経由でメソッドを呼び出せるようにする。
 * Canvas描画データのJSON出力とPNG画像出力が親から呼び出し可能。
 */
const SignCanvas = forwardRef<SignCanvasRef, SignCanvasProps>(function SignCanvas(
  { width = CANVAS_WIDTH, height = CANVAS_HEIGHT, onDrawingChange },
  ref
) {
  /** HTML Canvas 要素への参照 */
  const canvasElementRef = useRef<HTMLCanvasElement>(null);

  /**
   * Fabric.js Canvas インスタンスへの参照
   * 動的インポートのため実行時にしか型が取得できない。
   * unknown型を使用し、アクセス時に型アサーションを使用する。
   */
  const fabricCanvasRef = useRef<FabricCanvasInstance | null>(null);

  /** Undo履歴（各ストロークの状態を保存） */
  const undoHistoryRef = useRef<FabricObject[][]>([]);

  /** Fabricが初期化済みかどうか */
  const [isReady, setIsReady] = useState(false);

  /** 現在選択中のペンサイズ */
  const [penSize, setPenSize] = useState<number>(5);

  /** 現在選択中のペンカラー */
  const [penColor, setPenColor] = useState<string>('#1a1a1a');

  /** 描画オブジェクト数（undo/clearのUI更新トリガー） */
  const [objectCount, setObjectCount] = useState(0);

  /**
   * Fabric.js を動的インポートして Canvas を初期化する
   * Next.js の SSR 環境では Canvas API が使えないため、クライアントサイドのみで初期化する
   */
  useEffect(() => {
    let isMounted = true;

    async function initFabric() {
      // Fabric.js を動的インポート（SSR対応）
      const { Canvas, PencilBrush } = await import('fabric');

      if (!isMounted || !canvasElementRef.current) return;

      // 既存のFabric.jsインスタンスを破棄（StrictModeでの二重初期化対策）
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }

      // devicePixelRatioを考慮した高解像度Canvas設定
      // Fabric.js は内部で devicePixelRatio を自動処理する
      const canvas = new Canvas(canvasElementRef.current, {
        width,
        height,
        // 描画モードを有効化
        isDrawingMode: true,
        // 選択機能は不要（サイン描画専用）
        selection: false,
        // 背景色: 白（PNG出力時に透明ではなく白背景にする場合はここで設定）
        // サイン合成時は透明背景が望ましいため設定しない
      });

      // PencilBrush（フリーハンド描画）を設定
      const brush = new PencilBrush(canvas);
      brush.width = penSize;
      brush.color = penColor;
      canvas.freeDrawingBrush = brush;

      fabricCanvasRef.current = canvas as unknown as FabricCanvasInstance;

      // ストロークが完成したときのイベントリスナー
      canvas.on('path:created', () => {
        if (!isMounted) return;
        // Undo履歴にオブジェクト一覧を保存
        if (fabricCanvasRef.current) {
          undoHistoryRef.current.push([...fabricCanvasRef.current.getObjects()]);
        }
        setObjectCount(canvas.getObjects().length);
        onDrawingChange?.();
      });

      setIsReady(true);
    }

    initFabric();

    return () => {
      isMounted = false;
      // コンポーネントアンマウント時にFabric.jsを破棄してメモリリークを防ぐ
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
    // widthとheightは初期化時のみ使用するため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ペンサイズが変更されたとき、Fabric.jsのbrushサイズを更新する
   */
  useEffect(() => {
    if (fabricCanvasRef.current?.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.width = penSize;
    }
  }, [penSize]);

  /**
   * ペンカラーが変更されたとき、Fabric.jsのbrushカラーを更新する
   */
  useEffect(() => {
    if (fabricCanvasRef.current?.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.color = penColor;
    }
  }, [penColor]);

  /**
   * タッチイベントでページがスクロールしないようにする
   * iPad Safari でサイン描画中に意図せずページがスクロールしてしまうのを防ぐ
   */
  useEffect(() => {
    const canvasWrapper = canvasElementRef.current?.parentElement;
    if (!canvasWrapper) return;

    function preventTouchScroll(e: TouchEvent) {
      // Canvas要素上のタッチはスクロールを無効化する
      e.preventDefault();
    }

    canvasWrapper.addEventListener('touchmove', preventTouchScroll, { passive: false });
    canvasWrapper.addEventListener('touchstart', preventTouchScroll, { passive: false });

    return () => {
      canvasWrapper.removeEventListener('touchmove', preventTouchScroll);
      canvasWrapper.removeEventListener('touchstart', preventTouchScroll);
    };
  }, [isReady]);

  /**
   * Undo: 直前のストローク（パスオブジェクト）を取り消す
   * Fabric.jsのオブジェクトリストから最後の1つを削除する
   */
  const handleUndo = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    if (objects.length === 0) return;

    // 最後のオブジェクトを削除
    const lastObject = objects[objects.length - 1];
    canvas.remove(lastObject);
    canvas.renderAll();

    // Undo履歴を更新
    undoHistoryRef.current.pop();
    setObjectCount(canvas.getObjects().length);
    onDrawingChange?.();
  }, [onDrawingChange]);

  /**
   * クリア: Canvasの全描画を消去する
   */
  const handleClear = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    canvas.renderAll();

    // Undo履歴もリセット
    undoHistoryRef.current = [];
    setObjectCount(0);
    onDrawingChange?.();
  }, [onDrawingChange]);

  /**
   * 親コンポーネントに公開するメソッドをref経由で提供する
   */
  useImperativeHandle(ref, () => ({
    /**
     * Canvas描画データをJSON形式で取得する
     * Fabric.js の toJSON() 形式（objects配列, backgroundなど）
     */
    getCanvasJSON(): Record<string, unknown> {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return {};
      return canvas.toJSON() as Record<string, unknown>;
    },

    /**
     * Canvas描画をPNG画像（Blob）として取得する
     * Fabric.jsの toDataURL() を使用してbase64 → Blobに変換する
     *
     * @returns PNG Blob（S3アップロード用）
     */
    async getCanvasPNGBlob(): Promise<Blob> {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        throw new Error('Canvasが初期化されていません');
      }

      // Fabric.js の toDataURL で高品質PNGを生成
      // multiplier: devicePixelRatioを考慮した解像度
      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1.0,
        // 高DPIディスプレイでも鮮明な画像を生成する
        multiplier: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      });

      // data:image/png;base64,... 形式をBlobに変換する
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      return blob;
    },

    /**
     * Canvasが空かどうかを判定する
     * 何も描かれていない場合は保存ボタンを無効化するために使用する
     */
    isEmpty(): boolean {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return true;
      return canvas.getObjects().length === 0;
    },
  }), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* ツールバー: ペンサイズ・色・Undo・クリア */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        {/* ペンサイズ選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>太さ:</span>
          {PEN_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => setPenSize(size.value)}
              title={`ペンの太さ: ${size.label}（${size.value}px）`}
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                border: `2px solid ${penSize === size.value ? '#2563eb' : '#d1d5db'}`,
                backgroundColor: penSize === size.value ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              aria-pressed={penSize === size.value}
              aria-label={`ペンの太さ: ${size.label}`}
            >
              {/* ペンサイズを視覚的に表現する円 */}
              <div style={{
                width: `${size.value * 1.5}px`,
                height: `${size.value * 1.5}px`,
                borderRadius: '50%',
                backgroundColor: penColor,
                maxWidth: '16px',
                maxHeight: '16px',
              }} />
            </button>
          ))}
        </div>

        {/* 区切り線 */}
        <div style={{ width: '1px', height: '1.5rem', backgroundColor: '#e5e7eb' }} />

        {/* ペンカラー選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>色:</span>
          {PEN_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => setPenColor(color.value)}
              title={`ペンの色: ${color.label}`}
              style={{
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: '50%',
                border: `3px solid ${penColor === color.value ? '#2563eb' : 'transparent'}`,
                outline: `1px solid ${color.swatch}20`,
                backgroundColor: color.swatch,
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: penColor === color.value ? '0 0 0 1px #2563eb' : 'none',
              }}
              aria-pressed={penColor === color.value}
              aria-label={`ペンの色: ${color.label}`}
            />
          ))}
        </div>

        {/* 区切り線 */}
        <div style={{ width: '1px', height: '1.5rem', backgroundColor: '#e5e7eb' }} />

        {/* Undo / クリアボタン */}
        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!isReady || objectCount === 0}
            title="直前のストロークを取り消す"
            style={{
              padding: '0.375rem 0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: objectCount === 0 ? '#9ca3af' : '#374151',
              cursor: objectCount === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              transition: 'all 0.15s',
            }}
            aria-label="やり直し（Undo）"
          >
            ↩ やり直し
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!isReady || objectCount === 0}
            title="全ての描画を消去する"
            style={{
              padding: '0.375rem 0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: objectCount === 0 ? '#9ca3af' : '#ef4444',
              cursor: objectCount === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              transition: 'all 0.15s',
            }}
            aria-label="クリア（全消去）"
          >
            クリア
          </button>
        </div>
      </div>

      {/* Canvasエリア */}
      <div
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: '100%',
          border: '1.5px solid #d1d5db',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          // タッチスクロール防止（iOS Safari対応）
          touchAction: 'none',
          // 描画中のユーザー選択を防ぐ（テキスト選択など）
          userSelect: 'none',
        }}
        role="img"
        aria-label="手書きサインを描くキャンバス"
      >
        {/* 描画ガイド（未描画時に表示） */}
        {isReady && objectCount === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#d1d5db',
            fontSize: '0.9rem',
            pointerEvents: 'none',
            textAlign: 'center',
            zIndex: 1,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>✏️</div>
            <div>ここにサインを描いてください</div>
          </div>
        )}

        {/* 読み込み中インジケーター */}
        {!isReady && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#9ca3af',
            fontSize: '0.875rem',
          }}>
            Canvas読み込み中...
          </div>
        )}

        {/* Fabric.js が制御する Canvas 要素 */}
        <canvas
          ref={canvasElementRef}
          style={{
            display: 'block',
            cursor: 'crosshair',
          }}
        />
      </div>

      {/* 描画状態の表示 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.75rem',
        color: '#9ca3af',
      }}>
        <span>
          {objectCount > 0
            ? `${objectCount}個のストロークが描かれています`
            : 'まだ描かれていません'}
        </span>
        <span>
          ペン: {PEN_SIZES.find(s => s.value === penSize)?.label} /
          {PEN_COLORS.find(c => c.value === penColor)?.label}
        </span>
      </div>
    </div>
  );
});

export default SignCanvas;
