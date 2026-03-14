#!/bin/bash

echo "🚀 Starting Demo CR Infrastructure Services (Docker)..."
echo "======================================================="

docker compose up -d postgres etcd minio milvus redis

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

echo -n "Postgres: "
while [ "$(docker compose ps postgres --format json | jq -r '.Health')" != "healthy" ]; do
    echo -n "."
    sleep 1
done
echo " ✅"

echo -n "MinIO: "
while [ "$(docker compose ps minio --format json | jq -r '.Health')" != "healthy" ]; do
    echo -n "."
    sleep 1
done
echo " ✅"

echo -n "Milvus: "
while [ "$(docker compose ps milvus --format json | jq -r '.Health')" != "healthy" ]; do
    echo -n "."
    sleep 1
done
echo " ✅"

echo -n "Redis: "
while [ "$(docker compose ps redis --format json | jq -r '.Health')" != "healthy" ]; do
    echo -n "."
    sleep 1
done
echo " ✅"

echo ""
echo "✅ All infrastructure services are healthy!"
echo ""
echo "Ports:"
echo "  Postgres:  localhost:5435"
echo "  MinIO API: localhost:9012  (console: 9013)"
echo "  Milvus:    localhost:19533"
echo "  Redis:     localhost:6390"
