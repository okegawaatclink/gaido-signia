# ===================================================================
# Signia フロントエンド Dockerfile
# ベースイメージ: ubuntu:24.04（AI Agent containerと同一のため）
# ===================================================================

FROM ubuntu:24.04

# ===== 基本パッケージのインストール =====
# curl: Node.jsのインストールに使用
# ca-certificates: SSL証明書の更新に使用
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ===== 企業プロキシ用SSL証明書の設定（オプション） =====
# ssl-certificates/ ディレクトリが空でもビルドが成功するよう設定
# ビルドコンテキストは親ディレクトリ（..）を指定しているため ssl-certificates/ にアクセス可能
COPY ssl-certificates/ /etc/ssl/certs/custom/

RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      cp /etc/ssl/certs/custom/netskope.cer /usr/local/share/ca-certificates/netskope.crt && \
      update-ca-certificates && \
      echo "Custom CA certificate registered to system CA store"; \
    else \
      echo "No custom CA certificate found, skipping"; \
    fi

# ===== Node.js 20 LTS のインストール =====
# NodeSourceの公式インストールスクリプトを使用
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Node.jsのバージョン確認
RUN node --version && npm --version

# ===== 作業ディレクトリの設定 =====
WORKDIR /app/frontend

# ===== 依存パッケージのインストール =====
# package.jsonとpackage-lock.jsonのみをコピーしてキャッシュを効率化
# SSL証明書対応（NODE_EXTRA_CA_CERTS環境変数で証明書を指定）
COPY output_system/frontend/package*.json ./
COPY output_system/frontend/.npmrc ./

RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    npm ci

# ===== ソースコードのコピー =====
COPY output_system/frontend/ ./

# ===== Next.jsアプリのビルド =====
# 本番ビルドを作成（最適化されたバンドルを生成）
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    npm run build

# ===== ポート公開 =====
EXPOSE 3001

# ===== 起動コマンド =====
# 本番モードでNext.jsサーバーを起動（ポート3001）
CMD ["npm", "start"]
