#!/bin/bash

# Stop Docker backend to avoid port conflict
echo "Stopping Docker Backend..."
docker compose stop backend

# Free port 8011
echo "Cleaning up port 8011..."
fuser -k 8011/tcp || true

# Use active conda/venv or fallback
if [[ -n "$CONDA_DEFAULT_ENV" ]] || [[ -n "$VIRTUAL_ENV" ]]; then
    echo "✅ Using active environment: ${CONDA_DEFAULT_ENV:-$VIRTUAL_ENV}"
else
    if [ ! -d "backend/venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv backend/venv
    fi
    source backend/venv/bin/activate
fi

echo "Installing dependencies..."
pip install -r backend/requirements.txt -q

echo "Configuring environment..."
cp .env backend/.env

echo "Checking database initialization..."
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend
python3 backend/app/db/init_db.py

echo "Ensuring admin user exists..."
python3 backend/seed_admin.py

echo "Starting Demo Backend on port 8011..."
cd backend || exit
set -a; source .env; set +a
uvicorn app.main:app --reload --host 0.0.0.0 --port 8011
