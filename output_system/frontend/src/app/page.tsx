/**
 * @file page.tsx
 * @description ランディングページ（F1）
 *
 * Signiaシステムのトップページ。
 * サービス紹介・ヒーローセクション・特徴紹介・CTAを表示する。
 *
 * SSG（Static Site Generation）で生成されるため、
 * 認証不要のパブリックページとして実装する。
 *
 * 画面仕様:
 * - ヘッダー: ロゴ・ログインボタン
 * - ヒーローセクション: キャッチコピー・CTA
 * - 特徴セクション: 3カラム（個別サイン・安全な閲覧・かんたんアクセス）
 * - CTAセクション: ログインへの誘導
 * - フッター: 利用規約・プライバシーポリシー
 */

import Link from 'next/link';
import { Footer } from '../components/layout/Footer';

/**
 * ランディングページコンポーネント（SSG）
 *
 * サービス紹介とファンへのログイン導線を提供するパブリックページ。
 * Server Componentとして実装しSSGで生成する（認証不要）。
 *
 * @returns {JSX.Element} ランディングページUI
 */
export default function LandingPage() {
  return (
    <div style={styles.page}>
      {/* ===== ヘッダー ===== */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          {/* ロゴ */}
          <div style={styles.logo}>
            <span style={styles.logoIcon}>✍️</span>
            <span style={styles.logoText}>Signia</span>
          </div>

          {/* ログインボタン */}
          <Link href="/login" style={styles.loginLink}>
            ログイン
          </Link>
        </div>
      </header>

      {/* ===== ヒーローセクション ===== */}
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          {/* メインコピー */}
          <h1 style={styles.heroTitle}>
            あなただけの特別な
            <br />
            <span style={styles.heroTitleAccent}>サイン入り電子書籍</span>
          </h1>

          {/* サブコピー */}
          <p style={styles.heroSubtitle}>
            お気に入りの著者から、あなただけへの一冊。
            <br />
            手書きサインを合成した電子書籍を、いつでもどこでも読もう。
          </p>

          {/* CTAボタン */}
          <div style={styles.heroCTA}>
            <Link href="/login" style={styles.heroCTAButton}>
              ログインして本棚を見る
            </Link>
          </div>
        </div>

        {/* 装飾 */}
        <div style={styles.heroDecoration} aria-hidden="true">
          <div style={styles.heroDecorationInner}>
            <span style={{ fontSize: '8rem', lineHeight: 1 }}>📚</span>
          </div>
        </div>
      </section>

      {/* ===== 特徴セクション ===== */}
      <section style={styles.features}>
        <div style={styles.sectionContent}>
          <h2 style={styles.sectionTitle}>Signiaの特徴</h2>

          <div style={styles.featuresGrid}>
            {/* 特徴1: 個別サイン */}
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>✍️</div>
              <h3 style={styles.featureTitle}>個別サイン</h3>
              <p style={styles.featureDescription}>
                著者があなたの名前を宛先にした、世界に1つだけの個別サインを電子書籍に合成。
                物理的なサイン会では実現できない体験をデジタルで。
              </p>
            </div>

            {/* 特徴2: 安全な閲覧 */}
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>🔒</div>
              <h3 style={styles.featureTitle}>安全な閲覧</h3>
              <p style={styles.featureDescription}>
                DRM保護により、コンテンツのダウンロードや不正コピーを防止。
                著者の大切な作品を守りながら、あなただけの本棚に安全に保管。
              </p>
            </div>

            {/* 特徴3: かんたんアクセス */}
            <div style={styles.featureCard}>
              <div style={styles.featureIcon}>📱</div>
              <h3 style={styles.featureTitle}>かんたんアクセス</h3>
              <p style={styles.featureDescription}>
                Googleアカウントでかんたんにログイン。
                PC・スマートフォン・タブレット、どんな端末からでもあなたの本棚にアクセス可能。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTAセクション ===== */}
      <section style={styles.ctaSection}>
        <div style={styles.sectionContent}>
          <h2 style={styles.ctaTitle}>今すぐ本棚を確認しよう</h2>
          <p style={styles.ctaSubtitle}>
            著者からサイン入り電子書籍が届いたら、本棚に自動的に追加されます。
          </p>
          <Link href="/login" style={styles.ctaButton}>
            ログインして本棚を見る →
          </Link>
        </div>
      </section>

      {/* ===== フッター ===== */}
      <Footer />
    </div>
  );
}

// ===== スタイル定義 =====

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },

  // --- ヘッダー ---
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #f3f4f6',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 1.5rem',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  logoIcon: {
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  logoText: {
    fontSize: '1.375rem',
    fontWeight: '700',
    color: '#0070f3',
    letterSpacing: '-0.02em',
  },
  loginLink: {
    backgroundColor: '#0070f3',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.9375rem',
    fontWeight: '600',
    transition: 'background-color 0.15s ease',
  },

  // --- ヒーローセクション ---
  hero: {
    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
    padding: '5rem 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '480px',
    overflow: 'hidden',
    position: 'relative',
  },
  heroContent: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    zIndex: 1,
  },
  heroTitle: {
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
    fontWeight: '800',
    color: '#111827',
    lineHeight: 1.2,
    margin: '0 0 1.5rem 0',
    letterSpacing: '-0.02em',
  },
  heroTitleAccent: {
    color: '#0070f3',
  },
  heroSubtitle: {
    fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
    color: '#4b5563',
    lineHeight: 1.7,
    margin: '0 0 2.5rem 0',
    maxWidth: '600px',
  },
  heroCTA: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  heroCTAButton: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#0070f3',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '0.875rem 2rem',
    borderRadius: '12px',
    fontSize: '1.0625rem',
    fontWeight: '700',
    boxShadow: '0 4px 14px rgba(0, 112, 243, 0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  heroDecoration: {
    position: 'absolute',
    right: '10%',
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: 0.15,
    userSelect: 'none',
    pointerEvents: 'none',
  },
  heroDecorationInner: {
    lineHeight: 1,
  },

  // --- 特徴セクション ---
  features: {
    backgroundColor: '#ffffff',
    padding: '5rem 1.5rem',
  },
  sectionContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  sectionTitle: {
    fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    margin: '0 0 3rem 0',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '2rem',
  },
  featureCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '16px',
    padding: '2rem',
    border: '1px solid #e5e7eb',
  },
  featureIcon: {
    fontSize: '2.5rem',
    lineHeight: 1,
    marginBottom: '1rem',
  },
  featureTitle: {
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 0.75rem 0',
  },
  featureDescription: {
    fontSize: '0.9375rem',
    color: '#6b7280',
    lineHeight: 1.7,
    margin: 0,
  },

  // --- CTAセクション ---
  ctaSection: {
    backgroundColor: '#eff6ff',
    padding: '5rem 1.5rem',
    textAlign: 'center',
  },
  ctaTitle: {
    fontSize: 'clamp(1.5rem, 3vw, 2rem)',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 1rem 0',
  },
  ctaSubtitle: {
    fontSize: '1.0625rem',
    color: '#4b5563',
    margin: '0 0 2rem 0',
  },
  ctaButton: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#0070f3',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '0.875rem 2rem',
    borderRadius: '12px',
    fontSize: '1.0625rem',
    fontWeight: '700',
    boxShadow: '0 4px 14px rgba(0, 112, 243, 0.4)',
  },
};
