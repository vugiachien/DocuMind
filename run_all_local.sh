#!/bin/bash

echo "🚀 Starting Demo Contract Review (All Services)..."
echo "=================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit

# 1. Start infrastructure
./run_infrastructure.sh

echo ""
echo "Starting application services..."
echo ""

PIDS=()

if command -v tmux &> /dev/null; then
    SESSION="demo_contract_review"
    tmux new-session -d -s $SESSION -n "backend" 2>/dev/null || true
    tmux send-keys -t "$SESSION:backend" "cd $SCRIPT_DIR && conda activate contract_review_server 2>/dev/null; ./run_backend_local.sh" C-m
    tmux new-window -t $SESSION -n "ai-service"
    tmux send-keys -t "$SESSION:ai-service" "cd $SCRIPT_DIR && conda activate contract_review_server 2>/dev/null; ./run_ai_service_local.sh" C-m
    tmux new-window -t $SESSION -n "frontend"
    tmux send-keys -t "$SESSION:frontend" "cd $SCRIPT_DIR && ./run_frontend_local.sh" C-m
    tmux new-window -t $SESSION -n "worker"
    tmux send-keys -t "$SESSION:worker" "cd $SCRIPT_DIR && conda activate contract_review_server 2>/dev/null; ./run_worker_local.sh" C-m
    echo "✅ Services started in tmux session: $SESSION"
    echo ""
    echo "Ports:"
    echo "  Backend:    http://localhost:8011"
    echo "  AI Service: http://localhost:8010"
    echo "  Frontend:   http://localhost:5174"
    echo "  MinIO:      http://localhost:9012"
    echo ""
    echo "Attach to tmux: tmux attach -t $SESSION"
else
    ./run_backend_local.sh &
    PIDS+=($!)
    ./run_ai_service_local.sh &
    PIDS+=($!)
    ./run_frontend_local.sh &
    PIDS+=($!)
    ./run_worker_local.sh &
    PIDS+=($!)

    echo "PIDs: ${PIDS[*]}"
    echo "Frontend: http://localhost:5174"
    echo "Backend:  http://localhost:8011"
    wait "${PIDS[@]}"
fi
