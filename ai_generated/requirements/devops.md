# デプロイ構造・コマンド

## Docker Compose構成

```yaml
# output_system/docker-compose.yml
services:
  frontend:
    container_name: okegawaatclink-gaido-signia-output-system
    build:
      context: ..
      dockerfile: output_system/Dockerfile
    ports:
      - "3005:3001"
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://okegawaatclink-gaido-signia-output-system-backend:3002
      - __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=okegawaatclink-gaido-signia-output-system
    depends_on:
      - backend

  backend:
    container_name: okegawaatclink-gaido-signia-output-system-backend
    build:
      context: ..
      dockerfile: output_system/Dockerfile.backend
    ports:
      - "3006:3002"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://signia:signia_pass@db:5432/signia
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY=minioadmin
      - S3_SECRET_KEY=minioadmin
      - S3_BUCKET=ebook-signing
      - JWT_SECRET=dev-jwt-secret-change-in-production
    depends_on:
      - db
      - minio

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=signia
      - POSTGRES_USER=signia
      - POSTGRES_PASSWORD=signia_pass
    volumes:
      - pgdata:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:

networks:
  default:
    name: okegawaatclink-gaido-signia-network
    external: true
```

## 開発環境コマンド

```bash
# Dockerネットワーク作成（初回のみ）
docker network create okegawaatclink-gaido-signia-network

# ビルド＆起動
cd output_system
docker compose build
docker compose up -d

# ログ確認
docker compose logs -f frontend
docker compose logs -f backend

# 停止
docker compose down
```

## アクセスURL

- フロントエンド（ホストから）: http://localhost:3005
- バックエンドAPI（ホストから）: http://localhost:3006
- フロントエンド（コンテナ内から）: http://okegawaatclink-gaido-signia-output-system:3001
- バックエンドAPI（コンテナ内から）: http://okegawaatclink-gaido-signia-output-system-backend:3002

## 本番デプロイ（参考）

- クラウド: AWS / GCP
- コンテナオーケストレーション: ECS or Cloud Run
- DB: RDS (PostgreSQL) or Cloud SQL
- ストレージ: S3 or GCS
- CDN: CloudFront or Cloud CDN（静的アセット配信）
- 環境変数: Secrets Manager等で管理
