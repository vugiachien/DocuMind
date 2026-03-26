#!/bin/bash

# Free port 5174
fuser -k 5174/tcp || true

echo "Starting Demo Frontend on port 5174..."
cd frontend || exit
VITE_API_BASE_URL=http://localhost:8011 npm run dev -- --port 5174
