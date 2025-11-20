#!/bin/bash
# Pre-Startup System Check Script
# Checks for stuck commands, active zones, and running processes before starting server

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Pre-Startup System Check${NC}"
echo ""

ISSUES=0

# 1. Check active emergency events
echo -e "${YELLOW}1️⃣  Checking Emergency Events Database...${NC}"
if [ -f "tsim.db" ]; then
    ACTIVE_COUNT=$(python3 << 'PYEOF'
import sqlite3
try:
    conn = sqlite3.connect('tsim.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='emergency_events'")
    if cursor.fetchone():
        cursor.execute("SELECT COUNT(*) FROM emergency_events WHERE status = 'active'")
        print(cursor.fetchone()[0])
    else:
        print(0)
    conn.close()
except:
    print(0)
PYEOF
)
    
    if [ "$ACTIVE_COUNT" -gt 0 ]; then
        echo -e "${RED}   ❌ Found $ACTIVE_COUNT active emergency event(s)${NC}"
        ISSUES=$((ISSUES + 1))
    else
        echo -e "${GREEN}   ✅ No active emergency events${NC}"
    fi
else
    echo -e "${GREEN}   ✅ tsim.db doesn't exist (clean)${NC}"
fi
echo ""

# 2. Check running processes
echo -e "${YELLOW}2️⃣  Checking Running Processes...${NC}"
BACKEND_PROCS=$(ps aux | grep -E "python.*complete_backend|gunicorn|uvicorn" | grep -v grep | wc -l | tr -d ' ')
if [ "$BACKEND_PROCS" -gt 0 ]; then
    echo -e "${RED}   ❌ Found $BACKEND_PROCS backend process(es) running${NC}"
    ps aux | grep -E "python.*complete_backend|gunicorn|uvicorn" | grep -v grep | head -3
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}   ✅ No backend processes running${NC}"
fi
echo ""

# 3. Check lock files
echo -e "${YELLOW}3️⃣  Checking Lock Files...${NC}"
LOCKS=0
for lock in /tmp/tsim_weather.lock /tmp/tsim_cr1000_access.lock /tmp/tsim_weather_worker.lock /tmp/tsim_weather_worker.pid; do
    if [ -f "$lock" ]; then
        echo -e "${RED}   ❌ Found: $lock${NC}"
        LOCKS=$((LOCKS + 1))
    fi
done
if [ "$LOCKS" -eq 0 ]; then
    echo -e "${GREEN}   ✅ No lock files found${NC}"
else
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 4. Check PID files
echo -e "${YELLOW}4️⃣  Checking PID Files...${NC}"
LOG_DIR=${TSIM_LOG_DIR:-./logs}
PIDS=0
for pid_file in "$LOG_DIR/backend.pid" "$LOG_DIR/frontend.pid"; do
    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file" 2>/dev/null || echo "")
        if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${RED}   ❌ $pid_file exists (PID $PID is RUNNING)${NC}"
            PIDS=$((PIDS + 1))
        else
            echo -e "${YELLOW}   ⚠️  $pid_file exists (stale)${NC}"
        fi
    fi
done
if [ "$PIDS" -eq 0 ]; then
    echo -e "${GREEN}   ✅ No running processes with PID files${NC}"
else
    ISSUES=$((ISSUES + 1))
fi
echo ""

# Summary
echo "=" | tr '=' '='
if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✅ SYSTEM IS CLEAN - Safe to start!${NC}"
    echo ""
    echo "   You can start the server with:"
    echo "   ./scripts/start_production.sh"
    exit 0
else
    echo -e "${RED}⚠️  ISSUES FOUND - Cleanup required${NC}"
    echo ""
    echo "   Run cleanup:"
    echo "   1. ./scripts/stop_production.sh"
    echo "   2. python3 scripts/clear_active_zones.py"
    echo "   3. rm -f /tmp/tsim_*.lock /tmp/tsim_*.pid"
    echo "   4. rm -f $LOG_DIR/*.pid"
    exit 1
fi

