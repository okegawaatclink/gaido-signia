/**
 * @file auth.ts
 * @description NextAuth.js 認証設定
 *
 * NextAuth.js v5を使用したGoogle/Apple OAuthソーシャルログイン設定。
 * ファン（fan）ロール向けの認証フローを実装する。
 *
 * 認証フロー:
 * 1. ファンがGoogleまたはApple IDでログインボタンをクリック
 * 2. NextAuth.jsがOAuthプロバイダーにリダイレクト
 * 3. プロバイダーが認証後にコールバックURLにリダイレクト
 * 4. signInコールバックでバックエンドAPIを呼び出しファンアカウントを作成/取得
 * 5. JWTトークンをセッションに保存してフロントエンドから利用可能にする
 */

import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';

/**
 * バックエンドAPIのベースURL（サーバーサイドコードからアクセスするため内部URLを使用）
 * コンテナ内からのアクセスはコンテナ名を使用する（rules/instance-config.md参照）
 */
const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  'http://okegawaatclink-gaido-signia-output-system-backend:3002';

/**
 * バックエンドが返すユーザー情報の型定義
 */
interface BackendUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'author' | 'fan';
  avatarUrl: string | null;
  isActive: boolean;
  oauthProvider: string | null;
  oauthProviderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * NextAuth.js v5 型拡張
 * セッションにバックエンドのJWTトークンとユーザー情報を含める
 */
declare module 'next-auth' {
  interface Session {
    /** バックエンドが発行したJWTトークン（APIリクエスト時に使用） */
    backendToken: string;
    /** ユーザーID（UUID） */
    userId: string;
    /** ユーザーロール */
    role: 'admin' | 'author' | 'fan';
    user: {
      /** デフォルトのセッションユーザープロパティを維持 */
    } & DefaultSession['user'];
  }
}

/**
 * OAuthコールバック後にバックエンドAPIを呼び出してファンアカウントを作成または取得する
 *
 * @param provider - OAuthプロバイダー名（google / apple）
 * @param providerId - プロバイダー固有のユーザーID
 * @param email - ユーザーのメールアドレス
 * @param name - ユーザーの表示名
 * @param avatarUrl - アバターURL
 * @returns バックエンドが発行したJWTトークンとユーザー情報
 */
async function registerOrLoginFan(
  provider: string,
  providerId: string,
  email: string,
  name: string,
  avatarUrl: string | null
): Promise<{ token: string; user: BackendUser } | null> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        providerId,
        email,
        name,
        avatarUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[NextAuth] Backend OAuth API error:', response.status, errorData);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('[NextAuth] Failed to call backend OAuth API:', error);
    return null;
  }
}

/**
 * NextAuth.js 設定オブジェクト
 *
 * handlers: Next.js App RouterのAPIルートハンドラーとしてエクスポートする
 * auth: サーバーサイドで認証状態を確認する関数
 * signIn: ログイン処理を実行する関数
 * signOut: ログアウト処理を実行する関数
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * 認証プロバイダー設定
   * Google OAuthとApple Sign Inを設定する
   * 環境変数は AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET、AUTH_APPLE_ID/AUTH_APPLE_SECRET の形式で読み込まれる
   */
  providers: [
    Google({
      /**
       * Googleアカウントのプロフィール情報へのアクセスを要求するスコープ
       * openid: OpenID Connect基本情報（sub/iss/aud/exp/iat）
       * email: メールアドレス
       * profile: 名前・アバター等のプロフィール情報
       */
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
    }),
    Apple,
  ],

  /**
   * コールバック設定
   * OAuth認証後の処理をカスタマイズする
   */
  callbacks: {
    /**
     * signInコールバック
     * OAuthプロバイダーでの認証成功後に呼び出される
     * バックエンドAPIを呼び出してファンアカウントを作成または取得する
     *
     * @param user - プロバイダーから取得したユーザー情報
     * @param account - プロバイダーアカウント情報
     * @returns ログインを許可する場合はtrue、拒否する場合はfalse
     */
    async signIn({ user, account }) {
      // メールアドレスがない場合はログインを拒否
      if (!user.email || !account) {
        console.error('[NextAuth] signIn: Missing email or account');
        return false;
      }

      try {
        // バックエンドAPIを呼び出してファンアカウントを作成または取得
        const result = await registerOrLoginFan(
          account.provider, // 'google' or 'apple'
          account.providerAccountId,
          user.email,
          user.name || user.email,
          user.image || null
        );

        if (!result) {
          console.error('[NextAuth] signIn: Backend registration failed');
          return false;
        }

        // バックエンドのJWTトークンとユーザー情報をuserオブジェクトに一時保存
        // jwtコールバックでJWTに保存するため
        (user as unknown as Record<string, string>).__backendToken = result.token;
        (user as unknown as Record<string, string>).__userId = result.user.id;
        (user as unknown as Record<string, string>).__role = result.user.role;

        return true;
      } catch (error) {
        console.error('[NextAuth] signIn: Unexpected error:', error);
        return false;
      }
    },

    /**
     * jwtコールバック
     * JWTトークン生成・更新時に呼び出される
     * signInコールバックでuserに一時保存したバックエンドトークンをJWTに保存する
     *
     * @param token - NextAuth.jsのJWTトークン
     * @param user - ユーザー情報（初回ログイン時のみ存在）
     * @returns 更新されたJWTトークン
     */
    async jwt({ token, user }) {
      // 初回ログイン時のみuserが存在する
      if (user) {
        const u = user as unknown as Record<string, string>;
        if (u.__backendToken) {
          token.backendToken = u.__backendToken;
        }
        if (u.__userId) {
          token.userId = u.__userId;
        }
        if (u.__role) {
          token.role = u.__role as 'admin' | 'author' | 'fan';
        }
      }
      return token;
    },

    /**
     * sessionコールバック
     * セッション情報を整形して返す
     * フロントエンドからuseSession()またはauth()で取得できるセッション情報を定義する
     *
     * @param session - セッション情報
     * @param token - JWTトークン
     * @returns 整形されたセッション情報
     */
    async session({ session, token }) {
      // JWTからセッションにバックエンドトークンとユーザー情報をコピー
      if (typeof token.backendToken === 'string') {
        session.backendToken = token.backendToken;
      }
      if (typeof token.userId === 'string') {
        session.userId = token.userId;
      }
      if (token.role) {
        session.role = token.role as 'admin' | 'author' | 'fan';
      }
      return session;
    },
  },

  /**
   * カスタムページ設定
   * デフォルトのNextAuth.jsページの代わりに独自のページを使用する
   */
  pages: {
    /** ログインページのパス */
    signIn: '/login',
    /** エラーページのパス */
    error: '/login',
  },

  /**
   * セッション設定
   * JWTベースのセッション（データベース不要）を使用する
   */
  session: {
    strategy: 'jwt',
    /** セッション有効期限: 24時間（バックエンドのJWT有効期限と合わせる） */
    maxAge: 24 * 60 * 60,
  },
});
