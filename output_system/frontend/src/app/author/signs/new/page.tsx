/**
 * @file author/signs/new/page.tsx
 * @description サイン作成画面
 *
 * 著者がタブレット上でCanvas手書きサインを作成し、S3に保存する画面。
 *
 * 機能:
 * - サイン名入力フィールド
 * - 種別選択（共通サイン / 個別サイン）
 * - デフォルトサイン設定チェックボックス
 * - SignCanvasコンポーネントによる手書きエリア
 * - SignPreviewコンポーネントによるプレビュー表示
 * - 保存ボタンでAPIを呼び出しS3に保存
 * - 保存成功後にサイン一覧画面にリダイレクト
 *
 * レイアウト:
 * - タブレット（iPad）向けに横並びレイアウト（Canvas + プレビュー）
 * - 狭い画面では上下レイアウトに切り替え
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getToken, apiGetMe, apiCreateSign, AuthUser, ApiError } from '../../../../lib/api';
import SignPreview from '../../../../components/sign/SignPreview';
import type { SignCanvasRef } from '../../../../components/sign/SignCanvas';

/**
 * SignCanvasを動的インポートする
 * Fabric.jsはブラウザのCanvas APIに依存するため、SSR時に実行しない
 */
const SignCanvas = dynamic(
  () => import('../../../../components/sign/SignCanvas'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        width: '600px',
        height: '300px',
        maxWidth: '100%',
        border: '1.5px solid #d1d5db',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        color: '#9ca3af',
        fontSize: '0.875rem',
      }}>
        Canvas読み込み中...
      </div>
    ),
  }
);

/**
 * サイン作成画面コンポーネント
 *
 * @returns {JSX.Element} サイン作成フォーム
 */
export default function NewSignPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // フォームの状態
  const [signName, setSignName] = useState('');
  const [signType, setSignType] = useState<'common' | 'individual'>('common');
  const [isDefault, setIsDefault] = useState(false);

  // プレビュー用のPNG Blob
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // UI状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);

  // SignCanvasへのref（JSONとPNG取得に使用）
  const canvasRef = useRef<SignCanvasRef>(null);

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
   * Canvas描画が変化したときに呼ばれるコールバック
   * プレビュー画像を更新する
   */
  const handleDrawingChange = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isEmpty = canvas.isEmpty();
    setHasDrawing(!isEmpty);

    if (isEmpty) {
      setPreviewBlob(null);
      return;
    }

    // プレビュー用のPNG Blobを生成（非同期）
    setIsGeneratingPreview(true);
    try {
      const blob = await canvas.getCanvasPNGBlob();
      setPreviewBlob(blob);
    } catch (error) {
      console.error('プレビュー生成エラー:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, []);

  /**
   * フォーム送信ハンドラー
   * Canvas描画データ（JSON）とPNG画像をAPIに送信する
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) {
      setSubmitError('Canvasが初期化されていません');
      return;
    }

    if (!signName.trim()) {
      setSubmitError('サイン名を入力してください');
      return;
    }

    if (canvas.isEmpty()) {
      setSubmitError('サインを描いてください');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Canvas描画データ（JSON）を取得
      const canvasJson = canvas.getCanvasJSON();

      // Canvas描画のPNG Blobを取得
      const pngBlob = await canvas.getCanvasPNGBlob();

      // FormDataを構築してAPIに送信
      const formData = new FormData();
      formData.append('name', signName.trim());
      formData.append('type', signType);
      formData.append('isDefault', String(isDefault));
      formData.append('canvasData', JSON.stringify(canvasJson));
      // PNG画像ファイルをFormDataに追加
      formData.append('signImage', pngBlob, 'sign.png');

      await apiCreateSign(formData);

      // 保存成功後にサイン一覧画面にリダイレクト
      router.push('/author/signs');
    } catch (error) {
      const apiError = error as ApiError;
      setSubmitError(apiError.message || 'サインの保存に失敗しました');
    } finally {
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
            onClick={() => router.push('/author/signs')}
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
            aria-label="サイン一覧に戻る"
          >
            ←
          </button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            サイン作成
          </h1>
        </div>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {user?.name}（著者）
        </span>
      </header>

      {/* メインコンテンツ */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          {/* サイン情報セクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              サイン情報
            </h2>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {/* サイン名入力 */}
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label
                  htmlFor="signName"
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}
                >
                  サイン名 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="signName"
                  type="text"
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  placeholder="例: 通常サイン、ファン向けサイン"
                  maxLength={100}
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
                  {signName.length}/100文字
                </p>
              </div>

              {/* 種別選択 */}
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label
                  style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}
                >
                  種別 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    border: `2px solid ${signType === 'common' ? '#2563eb' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: signType === 'common' ? '#eff6ff' : '#fff',
                    flex: 1,
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="radio"
                      name="signType"
                      value="common"
                      checked={signType === 'common'}
                      onChange={() => setSignType('common')}
                      style={{ marginTop: '2px', accentColor: '#2563eb' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        共通サイン
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                        全てのファンに同じサインを使用
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    border: `2px solid ${signType === 'individual' ? '#2563eb' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: signType === 'individual' ? '#eff6ff' : '#fff',
                    flex: 1,
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="radio"
                      name="signType"
                      value="individual"
                      checked={signType === 'individual'}
                      onChange={() => setSignType('individual')}
                      style={{ marginTop: '2px', accentColor: '#2563eb' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                        個別サイン
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                        ファンへの宛名付きサイン
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* デフォルトサイン設定 */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    style={{ width: '1rem', height: '1rem', accentColor: '#2563eb' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                    デフォルトサインに設定する
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  ※ デフォルトサインは著者ごとに1つのみ設定できます
                </p>
              </div>
            </div>
          </section>

          {/* Canvas + プレビューセクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              サインを描く
            </h2>

            {/* Canvas と プレビュー のレイアウト */}
            <div style={{
              display: 'flex',
              gap: '2rem',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}>
              {/* 手書きCanvasエリア */}
              <div style={{ flex: '1', minWidth: '300px' }}>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  タブレット（ペンまたは指）またはマウスでサインを描いてください
                </p>
                <SignCanvas
                  ref={canvasRef}
                  width={600}
                  height={300}
                  onDrawingChange={handleDrawingChange}
                />
              </div>

              {/* プレビューエリア */}
              <div style={{ flexShrink: 0 }}>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  プレビュー
                  {isGeneratingPreview && (
                    <span style={{ marginLeft: '0.5rem', color: '#9ca3af', fontSize: '0.75rem' }}>
                      生成中...
                    </span>
                  )}
                </p>
                <SignPreview
                  pngBlob={previewBlob}
                  width={300}
                  height={150}
                />
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  ※ 実際に保存されるPNG画像のプレビューです
                </p>
              </div>
            </div>
          </section>

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

          {/* 保存ボタン */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.push('/author/signs')}
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
              disabled={isSubmitting || !hasDrawing || !signName.trim()}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor:
                  isSubmitting || !hasDrawing || !signName.trim()
                    ? '#93c5fd'
                    : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor:
                  isSubmitting || !hasDrawing || !signName.trim()
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.15s',
              }}
            >
              {isSubmitting ? '保存中...' : 'サインを保存する'}
            </button>
          </div>

          {/* 操作ガイド */}
          {!hasDrawing && !submitError && (
            <p style={{
              textAlign: 'right',
              fontSize: '0.75rem',
              color: '#9ca3af',
              marginTop: '0.5rem',
            }}>
              ※ サインを描いてから保存ボタンが有効になります
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
