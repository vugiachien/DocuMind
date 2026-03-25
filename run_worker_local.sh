#!/bin/bash

# Explicitly activate conda env if available, else fallback to venv
if command -v conda &>/dev/null && conda env list | grep -q "^dcr "; then
    echo "✅ Activating conda environment: dcr"
    source "$(conda info --base)/etc/profile.d/conda.sh"
    conda activate dcr
elif [[ -n "$CONDA_DEFAULT_ENV" ]] || [[ -n "$VIRTUAL_ENV" ]]; then
    echo "✅ Using active environment: ${CONDA_DEFAULT_ENV:-$VIRTUAL_ENV}"
else
    source backend/venv/bin/activate 2>/dev/null || true
fi

echo "Configuring environment..."
cp .env backend/.env 2>/dev/null || true

echo "Starting DocuMind Celery Worker..."
cd backend || exit
set -a; source .env 2>/dev/null; set +a
python -m celery -A app.celery_app worker --loglevel=info --concurrency=2
