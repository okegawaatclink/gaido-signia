/**
 * @file author/signs/page.tsx
 * @description 著者向けサイン一覧画面（A5）
 *
 * 著者が作成したサインの一覧をカード形式で表示する画面。
 * サインのプレビュー画像・名前・種別・デフォルト設定を表示する。
 *
 * 機能:
 * - サイン一覧のカードグリッド表示（プレビュー画像・名前・種別・デフォルト表示）
 * - 新規サイン作成ページへのリンク
 * - サイン詳細・編集ページへのナビゲーション
 * - サイン削除（確認ダイアログ付き）
 * - 書籍一覧へのナビゲーション
 * - ログアウト
 *
 * セキュリティ:
 * - 著者ロール以外はログイン画面にリダイレクト
 * - 自分のサインのみ表示（APIがJWT認証で制御）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, apiGetMe, apiLogout, apiGetSigns, apiDeleteSign, AuthUser, Sign, ApiError } from '../../../lib/api';
import SignCard from '../../../components/sign/SignCard';

/**
 * 著者向けサイン一覧コンポーネント（A5: サイン一覧）
 *
 * ログイン状態を確認して著者ロール以外のアクセスをリダイレクトする。
 * SignCardコンポーネントを使用してカードグリッドでサインを表示する。
 *
 * @returns {JSX.Element} サイン一覧画面
 */
export default function AuthorSigns() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [signs, setSigns] = useState<Sign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 削除処理中のサインID（nullは処理なし）
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // マウント時に認証状態とサイン一覧を取得する
  useEffect(() => {
    async function loadData() {
      const token = getToken();
      if (!token) {
        // 未ログインはログイン画面にリダイレクト
        router.push('/admin/login');
        return;
      }

      try {
        const [meResult, signsResult] = await Promise.all([
          apiGetMe(),
          apiGetSigns(),
        ]);

        // authorロール以外はアクセス不可（RBAC）
        if (meResult.user.role !== 'author') {
          router.push('/admin/login');
          return;
        }

        setUser(meResult.user);
        setSigns(signsResult.signs);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          // 認証エラーはログイン画面へ
          router.push('/admin/login');
        } else {
          setError('データの読み込みに失敗しました');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [router]);

  /**
   * ログアウト処理
   * JWTトークンを削除してログイン画面にリダイレクトする
   */
  async function handleLogout() {
    await apiLogout();
    router.push('/admin/login');
  }

  /**
   * サイン削除処理
   * 確認ダイアログを表示してから削除を実行する
   * 削除後は一覧からリアクティブに除去する
   *
   * @param sign - 削除するサインオブジェクト
   */
  async function handleDeleteSign(sign: Sign) {
    // 復元不可のため確認ダイアログを必ず表示する
    if (!window.confirm(`「${sign.name}」を削除しますか？\n\nこの操作は取り消せません。\nS3に保存されたサイン画像も同時に削除されます。`)) {
      return;
    }

    setDeletingId(sign.id);
    try {
      await apiDeleteSign(sign.id);
      // 削除成功後、一覧からリアクティブに除去
      setSigns((prev) => prev.filter((s) => s.id !== sign.id));
    } catch (err) {
      const apiError = err as ApiError;
      alert(`削除に失敗しました: ${apiError.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  /**
   * サイン詳細・編集画面へ遷移する
   *
   * @param signId - 遷移先のサインID
   */
  function handleViewDetail(signId: string) {
    router.push(`/author/signs/${signId}`);
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* ヘッダー */}
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>サイン管理</h1>
          {/* 書籍一覧へのナビゲーションリンク */}
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => router.push('/author/books')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: '0.875rem',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
              }}
            >
              書籍一覧
            </button>
            <button
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#2563eb',
                fontSize: '0.875rem',
                fontWeight: '500',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                borderBottom: '2px solid #2563eb',
              }}
            >
              サイン一覧
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {user?.name}（著者）
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #dc2626',
              borderRadius: '6px',
              background: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* アクションバー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {signs.length}件のサイン
          </p>
          <button
            onClick={() => router.push('/author/signs/new')}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            + サインを作成する
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* サイン一覧またはエンプティステート */}
        {signs.length === 0 ? (
          /* サインがない場合のエンプティステート */
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              backgroundColor: '#fff',
              borderRadius: '12px',
              border: '2px dashed #e5e7eb',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✍️</div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
              まだサインがありません
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              タブレット手書きでサインを作成しましょう
            </p>
            <button
              onClick={() => router.push('/author/signs/new')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
              }}
            >
              最初のサインを作成する
            </button>
          </div>
        ) : (
          /* サインカードのグリッド */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {signs.map((sign) => (
              <SignCard
                key={sign.id}
                sign={sign}
                onViewDetail={handleViewDetail}
                onDelete={handleDeleteSign}
                isDeleting={deletingId === sign.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
