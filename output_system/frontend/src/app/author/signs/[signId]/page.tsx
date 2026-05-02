/**
 * @file author/signs/[signId]/page.tsx
 * @description サイン詳細・編集画面（A7）
 *
 * 著者が既存のサインを表示・編集・削除する画面。
 * Canvasを再描画して上書き保存（再作成）することができる。
 *
 * 機能:
 * - サイン画像のプレビュー表示（S3 URL経由）
 * - サイン名・種別・デフォルト設定の表示と編集
 * - Canvasを使ったサインの再作成（上書き保存）
 * - 既存のCanvas描画データを Fabric.js で復元して編集
 * - サイン削除（確認ダイアログ付き、使用中警告付き）
 * - デフォルトサインの切り替え
 *
 * 引き継ぎノートより:
 * - canvasData フィールドに Fabric.js のJSON形式が保存されている
 * - 編集時は canvas.loadFromJSON(canvasData) で元の描画を復元できる
 * - is_default 排他制御はDB側で自動的に処理される
 *
 * レイアウト:
 * - 左カラム: サイン情報フォーム + 現在の画像プレビュー
 * - 右カラム: 再作成モード時のCanvas描画エリア
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  getToken,
  apiGetMe,
  apiGetSign,
  apiUpdateSign,
  apiDeleteSign,
  AuthUser,
  Sign,
  ApiError,
} from '../../../../lib/api';

/**
 * サイン画像をJWT認証付きでフェッチしてObjectURLを返すカスタムフック
 * <img>タグはAuthorizationヘッダーを送れないため、fetchで取得後にObjectURLを使用する
 *
 * @param signId - サインID
 * @param imageKey - S3上の画像キー（nullの場合はフェッチしない）
 * @returns ObjectURLまたはnull
 */
function useSignImageUrl(signId: string | null, imageKey: string | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!signId || !imageKey) {
      setObjectUrl(null);
      return;
    }

    let url: string | null = null;

    async function fetchImage() {
      const token = getToken();
      if (!token) return;

      try {
        const response = await fetch(`/api/signs/${signId}/image`, {
          headers: { 'Authorization': `Bearer ${token}` },
          redirect: 'follow',
        });
        if (!response.ok) return;

        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch {
        // フェッチ失敗時は画像なしのまま
      }
    }

    fetchImage();

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signId, imageKey]);

  return objectUrl;
}
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
 * サイン詳細・編集画面コンポーネント
 *
 * @returns {JSX.Element} サイン詳細・編集フォーム
 */
export default function SignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const signId = params.signId as string;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [sign, setSign] = useState<Sign | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSignLoading, setIsSignLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * 現在のサイン画像のObjectURL
   * JWT認証付きフェッチでAPIエンドポイントからObjectURLを生成する
   * React hooks のルール遵守: early return の前に呼ぶ必要があるためここに配置
   */
  const currentImageUrl = useSignImageUrl(
    sign?.id ?? null,
    sign?.imageKey ?? null
  );

  // 編集フォームの状態
  const [signName, setSignName] = useState('');
  const [signType, setSignType] = useState<'common' | 'individual'>('common');
  const [isDefault, setIsDefault] = useState(false);

  // 再作成モード（Canvasで書き直す）フラグ
  const [isRecreateMode, setIsRecreateMode] = useState(false);

  // 再作成時のプレビュー用Blob
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // 再作成時のCanvas描画有無
  const [hasDrawing, setHasDrawing] = useState(false);

  // UI状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // SignCanvasへのref（JSON/PNG取得に使用）
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

  // サイン詳細データを取得する
  useEffect(() => {
    if (isAuthLoading) return; // 認証ロード完了後に実行

    async function loadSign() {
      try {
        const result = await apiGetSign(signId);
        setSign(result.sign);
        // フォームの初期値をサインデータで設定
        setSignName(result.sign.name);
        setSignType(result.sign.type);
        setIsDefault(result.sign.isDefault);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 404) {
          setLoadError('指定されたサインが見つかりません');
        } else if (apiError.statusCode === 403) {
          setLoadError('このサインへのアクセス権限がありません');
        } else {
          setLoadError('サインデータの読み込みに失敗しました');
        }
      } finally {
        setIsSignLoading(false);
      }
    }

    loadSign();
  }, [signId, isAuthLoading]);

  /**
   * Canvas描画が変化したときのコールバック
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
   * 保存フォームの送信ハンドラー
   * 再作成モードの場合は新しいCanvas描画も送信する
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!signName.trim()) {
      setSubmitError('サイン名を入力してください');
      return;
    }

    // 再作成モードの場合はCanvas描画が必須
    if (isRecreateMode) {
      const canvas = canvasRef.current;
      if (!canvas || canvas.isEmpty()) {
        setSubmitError('再作成モードの場合は新しいサインを描いてください');
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // FormDataを構築
      const formData = new FormData();
      formData.append('name', signName.trim());
      formData.append('type', signType);
      formData.append('isDefault', String(isDefault));

      // 再作成モードの場合は新しい画像とCanvas JSONを追加
      if (isRecreateMode) {
        const canvas = canvasRef.current!;
        const canvasJson = canvas.getCanvasJSON();
        const pngBlob = await canvas.getCanvasPNGBlob();

        formData.append('canvasData', JSON.stringify(canvasJson));
        formData.append('signImage', pngBlob, 'sign.png');
      }

      const result = await apiUpdateSign(signId, formData);
      setSign(result.sign);
      // 再作成モードを終了してプレビューを更新
      setIsRecreateMode(false);
      setPreviewBlob(null);
      setHasDrawing(false);
      setSubmitError(null);
      alert('サインを更新しました');
    } catch (error) {
      const apiError = error as ApiError;
      setSubmitError(apiError.message || 'サインの更新に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * サイン削除ハンドラー
   * 確認ダイアログを表示してから削除を実行する
   */
  async function handleDelete() {
    if (!sign) return;

    // 削除不可能な状態の確認（使用中警告）
    const confirmMessage = sign.isDefault
      ? `「${sign.name}」はデフォルトサインです。\n削除してもよいですか？\n\nこの操作は取り消せません。`
      : `「${sign.name}」を削除しますか？\n\nこの操作は取り消せません。\nS3に保存されたサイン画像も同時に削除されます。`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiDeleteSign(signId);
      // 削除成功後にサイン一覧に戻る
      router.push('/author/signs');
    } catch (err) {
      const apiError = err as ApiError;
      alert(`削除に失敗しました: ${apiError.message}`);
      setIsDeleting(false);
    }
  }

  /**
   * 再作成モードに切り替えるハンドラー
   * Canvasを再初期化して空の状態から描き直せるようにする
   */
  function handleStartRecreate() {
    setIsRecreateMode(true);
    setPreviewBlob(null);
    setHasDrawing(false);
    setSubmitError(null);
  }

  /**
   * 再作成モードをキャンセルするハンドラー
   */
  function handleCancelRecreate() {
    setIsRecreateMode(false);
    setPreviewBlob(null);
    setHasDrawing(false);
    setSubmitError(null);
  }

  // ローディング状態の表示
  if (isAuthLoading || isSignLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  // エラー状態の表示
  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <header style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <button
            onClick={() => router.push('/author/signs')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '1.2rem',
            }}
            aria-label="サイン一覧に戻る"
          >
            ←
          </button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>サイン詳細</h1>
        </header>
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '1.5rem',
            color: '#991b1b',
          }}>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>エラーが発生しました</p>
            <p style={{ fontSize: '0.875rem' }}>{loadError}</p>
            <button
              onClick={() => router.push('/author/signs')}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#991b1b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              サイン一覧に戻る
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!sign) return null;

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
            サイン詳細・編集
          </h1>
          {/* デフォルトサインバッジ */}
          {sign.isDefault && (
            <span style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
            }}>
              デフォルト
            </span>
          )}
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

          {/* サイン画像セクション */}
          <section style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                サイン画像
              </h2>
              {/* 再作成モード切り替えボタン */}
              {!isRecreateMode ? (
                <button
                  type="button"
                  onClick={handleStartRecreate}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #2563eb',
                    borderRadius: '6px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                  }}
                >
                  ✏️ サインを再作成する
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelRecreate}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  キャンセル
                </button>
              )}
            </div>

            {!isRecreateMode ? (
              /* 現在のサイン画像プレビュー */
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    現在のサイン画像
                  </p>
                  {currentImageUrl ? (
                    <div style={{
                      width: '300px',
                      height: '150px',
                      maxWidth: '100%',
                      border: '1.5px solid #d1d5db',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#f9fafb',
                      backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentImageUrl}
                        alt="現在のサイン画像"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '300px',
                      height: '150px',
                      border: '1.5px dashed #d1d5db',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9ca3af',
                      fontSize: '0.875rem',
                    }}>
                      画像なし
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  paddingTop: '2rem',
                  lineHeight: '1.6',
                }}>
                  <p>「サインを再作成する」ボタンをクリックすると、</p>
                  <p>Canvas描画エリアが表示されます。</p>
                  <p>新しいサインを描いて保存すると上書きされます。</p>
                </div>
              </div>
            ) : (
              /* 再作成モード: Canvas描画エリア */
              <div>
                <p style={{ fontSize: '0.875rem', color: '#f59e0b', marginBottom: '1rem', fontWeight: '500' }}>
                  再作成モード: 新しいサインを描いて保存すると、既存のサイン画像が上書きされます。
                </p>

                <div style={{
                  display: 'flex',
                  gap: '2rem',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                }}>
                  {/* 手書きCanvasエリア */}
                  <div style={{ flex: '1', minWidth: '300px' }}>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                      タブレット（ペンまたは指）またはマウスで新しいサインを描いてください
                    </p>
                    <SignCanvas
                      ref={canvasRef}
                      width={600}
                      height={300}
                      onDrawingChange={handleDrawingChange}
                    />
                  </div>

                  {/* 新プレビューエリア */}
                  <div style={{ flexShrink: 0 }}>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                      新しいサインのプレビュー
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
                  </div>
                </div>
              </div>
            )}
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

          {/* アクションボタン */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 削除ボタン（左寄せ）*/}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              style={{
                padding: '0.625rem 1.25rem',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                backgroundColor: isDeleting ? '#fef2f2' : '#fff',
                color: isDeleting ? '#9ca3af' : '#dc2626',
                cursor: isDeleting || isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: isDeleting || isSubmitting ? 0.7 : 1,
              }}
              aria-label="サインを削除"
              aria-busy={isDeleting}
            >
              {isDeleting ? '削除中...' : '🗑 削除する'}
            </button>

            {/* キャンセル・保存ボタン（右寄せ）*/}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => router.push('/author/signs')}
                disabled={isSubmitting || isDeleting}
                style={{
                  padding: '0.625rem 1.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  color: '#374151',
                  cursor: isSubmitting || isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: isSubmitting || isDeleting ? 0.6 : 1,
                }}
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  isDeleting ||
                  !signName.trim() ||
                  (isRecreateMode && !hasDrawing)
                }
                style={{
                  padding: '0.625rem 1.5rem',
                  backgroundColor:
                    isSubmitting || isDeleting || !signName.trim() || (isRecreateMode && !hasDrawing)
                      ? '#93c5fd'
                      : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    isSubmitting || isDeleting || !signName.trim() || (isRecreateMode && !hasDrawing)
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.15s',
                }}
              >
                {isSubmitting ? '保存中...' : '変更を保存する'}
              </button>
            </div>
          </div>

          {/* 再作成モード時の操作ガイド */}
          {isRecreateMode && !hasDrawing && (
            <p style={{
              textAlign: 'right',
              fontSize: '0.75rem',
              color: '#9ca3af',
              marginTop: '0.5rem',
            }}>
              ※ 再作成モードでは新しいサインを描いてから保存ボタンが有効になります
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
