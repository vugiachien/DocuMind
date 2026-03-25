#!/bin/bash

# Free port 5175
fuser -k 5175/tcp || true

echo "Starting DocuMind Frontend on port 5175..."
cd frontend || exit
VITE_BACKEND_URL=http://localhost:8012 npm run dev -- --port 5175
