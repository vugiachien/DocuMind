#!/bin/bash
# ─────────────────────────────────────────────────────────────
# deploy.sh — chạy trên server để pull & restart containers
# Được gọi từ GitLab CI với env vars inject qua ssh
# ─────────────────────────────────────────────────────────────
set -e

DEPLOY_DIR="$HOME/demo-contract-review"
cd "$DEPLOY_DIR"

# Auto-generation of .env has been removed. Make sure .env exists in the deployment directory.

echo "🔐 Logging in to Docker registry..."
echo "$CI_REGISTRY_PASSWORD" | docker login "$REGISTRY" \
  -u "$CI_REGISTRY_USER" --password-stdin

echo "📦 Pulling new images (tag: $IMAGE_TAG)..."
export IMAGE_TAG="${IMAGE_TAG:-latest}"
export IMAGE_PREFIX="${IMAGE_PREFIX}"

docker compose -f docker-compose.prod.yml pull

echo "🧹 Cleaning up potential conflicting application containers..."
docker rm -f demo_cr_worker demo_cr_backend demo_cr_ai_service demo_cr_frontend 2>/dev/null || true

echo "🔒 Unsetting CI variables to prioritize local .env configurations..."
unset MINIO_ACCESS_KEY MINIO_SECRET_KEY OPENAI_API_KEY OPENAI_API_BASE OPENAI_MODEL EXTERNAL_AI_API_KEY

echo "🚀 Restarting services..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "⏳ Waiting for backend to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8011/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy!"
    break
  fi
  echo "  Attempt $i/30..."
  sleep 3
done

echo ""
echo "✅ Deployment complete!"
echo "   Frontend:  http://$(hostname -I | awk '{print $1}'):5174"
echo "   Backend:   http://$(hostname -I | awk '{print $1}'):8011/docs"
echo ""
docker compose -f docker-compose.prod.yml ps
