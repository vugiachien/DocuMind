#!/bin/bash

echo "🚀 Starting DocuMind Infrastructure Services (Docker)..."
echo "========================================================="

docker compose up -d postgres redis

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

wait_for_healthy() {
    local service="$1"
    local label="$2"

    echo -n "${label}: "
    while [ "$(docker compose ps "$service" --format json | jq -r '.Health')" != "healthy" ]; do
        echo -n "."
        sleep 1
    done
    echo " ✅"
}

wait_for_healthy postgres "Postgres"
wait_for_healthy redis "Redis"

echo ""
echo "✅ All infrastructure services are healthy!"
echo ""
echo "Ports:"
echo "  Postgres:  localhost:5436"
echo "  Redis:     localhost:6390"
