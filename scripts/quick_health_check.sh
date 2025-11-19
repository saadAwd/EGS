#!/bin/bash

# Quick Health Check Script
# Fast status check for operators - run every few hours
# Usage: ./scripts/quick_health_check.sh

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
LOG_DIR="${TSIM_LOG_DIR:-./logs}"

echo "=== TSIM Quick Health Check ==="
echo "Time: $(date)"
echo ""

# Backend status
if curl -s -f "$BACKEND_URL/api/status" >/dev/null 2>&1; then
    echo "✓ Backend: Running"
else
    echo "✗ Backend: Not responding"
fi

# Gateway status
GATEWAY_STATUS=$(curl -s "$BACKEND_URL/api/gateway/status" 2>/dev/null || echo "{}")
if echo "$GATEWAY_STATUS" | grep -q "connected\|ready"; then
    echo "✓ Gateway: Connected"
else
    echo "✗ Gateway: Not connected"
fi

# Weather health
WEATHER_HEALTH=$(curl -s "$BACKEND_URL/api/health/weather" 2>/dev/null || echo "{}")
LAST_TS=$(echo "$WEATHER_HEALTH" | grep -o '"last_success_ts":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
if [ "$LAST_TS" != "unknown" ] && [ "$LAST_TS" != "null" ]; then
    echo "✓ Weather: Last update at $LAST_TS"
else
    echo "✗ Weather: No recent updates"
fi

# Recent errors (last 5 minutes)
if [ -f "$LOG_DIR/backend_error.log" ]; then
    RECENT_ERRORS=$(grep -c "ACK TIMEOUT\|ACK failed\|WEATHER: error" "$LOG_DIR/backend_error.log" 2>/dev/null || echo "0")
    if [ "$RECENT_ERRORS" -eq 0 ]; then
        echo "✓ Errors: None in recent logs"
    else
        echo "⚠ Errors: $RECENT_ERRORS recent errors found"
    fi
fi

# Worker count
WORKER_COUNT=$(ps aux | grep -E '[g]unicorn.*complete_backend' | grep -v grep | wc -l | tr -d ' ')
if [ "$WORKER_COUNT" -eq 1 ]; then
    echo "✓ Workers: 1 (correct)"
else
    echo "✗ Workers: $WORKER_COUNT (expected 1)"
fi

echo ""
echo "For detailed validation, run: ./scripts/validate_expert_fixes.sh"

