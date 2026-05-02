/**
 * @file author/compose/page.tsx
 * @description 著者向けサイン合成画面（A8）
 *
 * 著者がサインを電子書籍に合成するための画面。
 *
 * 機能:
 * - 書籍選択ドロップダウン（自分の書籍一覧から選択）
 * - サイン選択ドロップダウン（自分のサイン一覧から選択）
 * - 合成モード選択（共通サイン / 個別サイン）
 * - 宛名入力フィールド（共通の場合は単一入力、個別の場合はファンごとに個別入力）
 * - 対象ファン選択（書籍のアクセス権がある全ファンをチェックボックスで選択）
 * - SignComposerによる合成プレビュー
 * - 合成実行ボタンと結果表示（成功/失敗件数）
 *
 * セキュリティ:
 * - 著者ロール以外はログイン画面にリダイレクト
 * - 自分の書籍・サインのみ使用可能（APIがJWT認証で制御）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getToken,
  apiGetMe,
  apiLogout,
  apiGetBooks,
  apiGetSigns,
  apiGetBookFans,
  apiCompose,
  AuthUser,
  Book,
  Sign,
  Fan,
  ComposeJobResult,
  ApiError,
} from '../../../lib/api';
import SignComposer from '../../../components/sign/SignComposer';

/**
 * 合成モードの型定義
 * - common: 全ファンに同じサイン（宛名なし、または共通の宛名）
 * - individual: ファンごとに宛名が異なる個別サイン
 */
type ComposeMode = 'common' | 'individual';

/**
 * 著者向けサイン合成コンポーネント（A8: サイン合成画面）
 *
 * @returns {JSX.Element} サイン合成画面
 */
export default function AuthorCompose() {
  const router = useRouter();

  // 認証・データ状態
  const [user, setUser] = useState<AuthUser | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [signs, setSigns] = useState<Sign[]>([]);
  const [fans, setFans] = useState<Fan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFansLoading, setIsFansLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム選択状態
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [selectedSignId, setSelectedSignId] = useState<string>('');
  const [composeMode, setComposeMode] = useState<ComposeMode>('common');
  // 共通サインの場合の宛名（全ファンに同一）
  const [commonRecipientName, setCommonRecipientName] = useState<string>('');
  // 選択されたファンIDのセット
  const [selectedFanIds, setSelectedFanIds] = useState<Set<string>>(new Set());
  // 個別サインの場合の各ファンの宛名（fanIdをキーとしたマップ）
  const [individualRecipientNames, setIndividualRecipientNames] = useState<Record<string, string>>({});

  // 合成実行状態
  const [isComposing, setIsComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<ComposeJobResult | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  // 選択中のサインオブジェクト（プレビュー用）
  const selectedSign = signs.find((s) => s.id === selectedSignId) || null;

  // マウント時に認証状態・書籍・サイン一覧を取得する
  useEffect(() => {
    async function loadData() {
      const token = getToken();
      if (!token) {
        router.push('/admin/login');
        return;
      }

      try {
        const [meResult, booksResult, signsResult] = await Promise.all([
          apiGetMe(),
          apiGetBooks(),
          apiGetSigns(),
        ]);

        // authorロール以外はアクセス不可
        if (meResult.user.role !== 'author') {
          router.push('/admin/login');
          return;
        }

        setUser(meResult.user);
        setBooks(booksResult.books);
        setSigns(signsResult.signs);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
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

  // 書籍が選択された時にファン一覧を取得する
  useEffect(() => {
    if (!selectedBookId) {
      setFans([]);
      setSelectedFanIds(new Set());
      return;
    }

    setIsFansLoading(true);
    setFans([]);
    setSelectedFanIds(new Set());

    apiGetBookFans(selectedBookId)
      .then((result) => {
        setFans(result.fans);
      })
      .catch(() => {
        // ファン取得エラーは合成実行時に表面化するためここでは静かに失敗する
        setFans([]);
      })
      .finally(() => {
        setIsFansLoading(false);
      });
  }, [selectedBookId]);

  /**
   * ログアウト処理
   */
  async function handleLogout() {
    await apiLogout().catch(() => {});
    router.push('/admin/login');
  }

  /**
   * ファン選択チェックボックスの変更を処理する
   *
   * @param fanId - チェックが変更されたファンID
   * @param checked - チェック後の状態
   */
  function handleFanToggle(fanId: string, checked: boolean) {
    setSelectedFanIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(fanId);
      } else {
        next.delete(fanId);
      }
      return next;
    });
  }

  /**
   * 全ファン選択/解除を処理する
   */
  function handleSelectAllFans() {
    if (selectedFanIds.size === fans.length) {
      // 全選択中 → 全解除
      setSelectedFanIds(new Set());
    } else {
      // 一部または未選択 → 全選択
      setSelectedFanIds(new Set(fans.map((f) => f.id)));
    }
  }

  /**
   * 個別サインの宛名を更新する
   *
   * @param fanId - 対象ファンID
   * @param name - 宛名テキスト
   */
  function handleIndividualRecipientChange(fanId: string, name: string) {
    setIndividualRecipientNames((prev) => ({ ...prev, [fanId]: name }));
  }

  /**
   * 合成処理のバリデーションチェック
   *
   * @returns バリデーションエラーメッセージ、問題ない場合はnull
   */
  function validateForm(): string | null {
    if (!selectedBookId) return '書籍を選択してください';
    if (!selectedSignId) return 'サインを選択してください';
    if (selectedFanIds.size === 0) return '対象ファンを1名以上選択してください';
    return null;
  }

  /**
   * 合成実行を処理する
   */
  async function handleCompose() {
    const validationError = validateForm();
    if (validationError) {
      setComposeError(validationError);
      return;
    }

    setIsComposing(true);
    setComposeResult(null);
    setComposeError(null);

    try {
      const fanIds = Array.from(selectedFanIds);

      // 宛名マップを構築する
      let recipientNames: Record<string, string> | undefined;
      if (composeMode === 'common' && commonRecipientName.trim()) {
        // 共通サイン: 選択した全ファンに同じ宛名を設定する
        recipientNames = Object.fromEntries(
          fanIds.map((fanId) => [fanId, commonRecipientName.trim()])
        );
      } else if (composeMode === 'individual') {
        // 個別サイン: ファンごとに宛名が異なる（空の宛名は除外）
        const filtered = Object.fromEntries(
          Object.entries(individualRecipientNames)
            .filter(([fanId, name]) => selectedFanIds.has(fanId) && name.trim())
        );
        recipientNames = Object.keys(filtered).length > 0 ? filtered : undefined;
      }

      const result = await apiCompose(
        selectedBookId,
        selectedSignId,
        fanIds,
        recipientNames
      );

      setComposeResult(result);
    } catch (err) {
      const apiError = err as ApiError;
      setComposeError(apiError.message || '合成に失敗しました');
    } finally {
      setIsComposing(false);
    }
  }

  // プレビューに表示する宛名
  // 共通モード: commonRecipientName、個別モード: 最初のファンの宛名
  const previewRecipientName =
    composeMode === 'common'
      ? commonRecipientName
      : (Object.values(individualRecipientNames)[0] || '');

  // ローディング中の表示
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
          <button onClick={() => router.push('/admin/login')} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            ログインに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* ヘッダー */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1f2937' }}>Signia</h1>
          <nav style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => router.push('/author/books')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>書籍管理</button>
            <button onClick={() => router.push('/author/signs')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>サイン管理</button>
            <button style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>サイン合成</button>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{user?.name}</span>
          <button onClick={handleLogout} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>ログアウト</button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <h2 style={{ margin: '0 0 24px', fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' }}>サイン合成</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
          {/* 左カラム: フォーム */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 書籍選択 */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                書籍を選択 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={selectedBookId}
                onChange={(e) => {
                  setSelectedBookId(e.target.value);
                  setComposeResult(null);
                  setComposeError(null);
                }}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff', color: '#1f2937' }}
              >
                <option value="">書籍を選択してください</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}（{book.format.toUpperCase()}）
                  </option>
                ))}
              </select>
              {books.length === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
                  書籍が登録されていません。<button onClick={() => router.push('/author/books/new')} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>書籍を登録する</button>
                </p>
              )}
            </div>

            {/* サイン選択 */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                サインを選択 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={selectedSignId}
                onChange={(e) => {
                  setSelectedSignId(e.target.value);
                  setComposeResult(null);
                  setComposeError(null);
                }}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#fff', color: '#1f2937' }}
              >
                <option value="">サインを選択してください</option>
                {signs.map((sign) => (
                  <option key={sign.id} value={sign.id}>
                    {sign.name}（{sign.type === 'common' ? '共通' : '個別'}）{sign.isDefault ? ' ★デフォルト' : ''}
                  </option>
                ))}
              </select>
              {signs.length === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
                  サインが登録されていません。<button onClick={() => router.push('/author/signs/new')} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>サインを作成する</button>
                </p>
              )}
            </div>

            {/* 合成モード選択 */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                合成モード
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, padding: '12px', border: `2px solid ${composeMode === 'common' ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '8px', backgroundColor: composeMode === 'common' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="composeMode"
                    value="common"
                    checked={composeMode === 'common'}
                    onChange={() => setComposeMode('common')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>共通サイン</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>全員に同一のサイン</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, padding: '12px', border: `2px solid ${composeMode === 'individual' ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '8px', backgroundColor: composeMode === 'individual' ? '#eff6ff' : '#fff' }}>
                  <input
                    type="radio"
                    name="composeMode"
                    value="individual"
                    checked={composeMode === 'individual'}
                    onChange={() => setComposeMode('individual')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>個別サイン</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>宛名付きサイン</div>
                  </div>
                </label>
              </div>

              {/* 共通サインの宛名入力 */}
              {composeMode === 'common' && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '6px' }}>
                    宛名（オプション）
                  </label>
                  <input
                    type="text"
                    value={commonRecipientName}
                    onChange={(e) => setCommonRecipientName(e.target.value)}
                    placeholder="例: ○○ファンの皆様へ"
                    maxLength={100}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    入力すると全員のサインページに同じ宛名が表示されます
                  </p>
                </div>
              )}
            </div>

            {/* ファン選択 */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                  対象ファン <span style={{ color: '#ef4444' }}>*</span>
                  {fans.length > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#6b7280', fontWeight: 400 }}>
                      {selectedFanIds.size} / {fans.length}名選択中
                    </span>
                  )}
                </label>
                {fans.length > 0 && (
                  <button
                    onClick={handleSelectAllFans}
                    style={{ padding: '4px 10px', backgroundColor: 'transparent', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}
                  >
                    {selectedFanIds.size === fans.length ? '全解除' : '全選択'}
                  </button>
                )}
              </div>

              {/* 書籍未選択時 */}
              {!selectedBookId && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
                  まず書籍を選択してください
                </p>
              )}

              {/* ファン読み込み中 */}
              {selectedBookId && isFansLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                  <div style={{ width: '28px', height: '28px', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}

              {/* ファンなし */}
              {selectedBookId && !isFansLoading && fans.length === 0 && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
                  この書籍にアクセス権があるファンがいません
                </p>
              )}

              {/* ファン一覧 */}
              {!isFansLoading && fans.length > 0 && (
                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {fans.map((fan) => (
                    <div key={fan.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: selectedFanIds.has(fan.id) ? '#eff6ff' : '#fff' }}>
                      <input
                        type="checkbox"
                        id={`fan-${fan.id}`}
                        checked={selectedFanIds.has(fan.id)}
                        onChange={(e) => handleFanToggle(fan.id, e.target.checked)}
                        style={{ marginTop: '2px', accentColor: '#3b82f6', width: '16px', height: '16px', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`fan-${fan.id}`} style={{ cursor: 'pointer', display: 'block' }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#1f2937' }}>{fan.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{fan.email}</div>
                        </label>

                        {/* 個別サインの宛名入力フィールド（選択中のファンのみ表示） */}
                        {composeMode === 'individual' && selectedFanIds.has(fan.id) && (
                          <input
                            type="text"
                            value={individualRecipientNames[fan.id] || ''}
                            onChange={(e) => handleIndividualRecipientChange(fan.id, e.target.value)}
                            placeholder={`${fan.name}さんへの宛名`}
                            maxLength={100}
                            style={{ marginTop: '8px', width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* バリデーション・エラーメッセージ */}
            {composeError && (
              <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                <p style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem' }}>{composeError}</p>
              </div>
            )}

            {/* 合成結果表示 */}
            {composeResult && (
              <div style={{ padding: '16px', backgroundColor: composeResult.errorCount === 0 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${composeResult.errorCount === 0 ? '#86efac' : '#fcd34d'}`, borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700, color: composeResult.errorCount === 0 ? '#16a34a' : '#d97706' }}>
                  {composeResult.errorCount === 0 ? '合成完了' : '合成完了（一部エラーあり）'}
                </h3>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{composeResult.successCount}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>成功</div>
                  </div>
                  {composeResult.errorCount > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{composeResult.errorCount}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>エラー</div>
                    </div>
                  )}
                </div>
                {/* エラーがあったファンの詳細表示 */}
                {composeResult.results.filter((r) => r.status === 'error').map((r) => {
                  const fan = fans.find((f) => f.id === r.fanId);
                  return (
                    <div key={r.fanId} style={{ padding: '8px', backgroundColor: '#fef2f2', borderRadius: '4px', marginTop: '8px', fontSize: '0.8rem', color: '#dc2626' }}>
                      {fan?.name || r.fanId}: {r.errorMessage || '合成に失敗しました'}
                    </div>
                  );
                })}
                <button
                  onClick={() => router.push('/author/books')}
                  style={{ marginTop: '12px', padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                  書籍一覧に戻る
                </button>
              </div>
            )}

            {/* 合成実行ボタン */}
            {!composeResult && (
              <button
                onClick={handleCompose}
                disabled={isComposing || !selectedBookId || !selectedSignId || selectedFanIds.size === 0}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isComposing || !selectedBookId || !selectedSignId || selectedFanIds.size === 0 ? '#9ca3af' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isComposing || !selectedBookId || !selectedSignId || selectedFanIds.size === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isComposing ? (
                  <>
                    <div style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    合成中... {selectedFanIds.size > 1 ? `(${selectedFanIds.size}名)` : ''}
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v1m0 16v1m8.66-12l-.86.5M4.2 16.5l-.86.5m0-9.5l.86.5m15.46 8.5l-.86-.5M21 12h-1M4 12H3" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    サインを合成する（{selectedFanIds.size > 0 ? `${selectedFanIds.size}名対象` : 'ファン未選択'}）
                  </>
                )}
              </button>
            )}
          </div>

          {/* 右カラム: プレビュー */}
          <div style={{ position: 'sticky', top: '24px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
                サインページ プレビュー
              </h3>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SignComposer
                  sign={selectedSign}
                  recipientName={previewRecipientName || undefined}
                />
              </div>
              {selectedSign && (
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center' }}>
                  <div style={{ fontWeight: 500, color: '#374151' }}>{selectedSign.name}</div>
                  <div>{selectedSign.type === 'common' ? '共通サイン' : '個別サイン'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* スピンアニメーションのCSS */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
