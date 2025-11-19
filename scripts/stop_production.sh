#!/bin/bash
# TSIM Production Stop Script
# This script stops all production services and cleans up weather station processes

# Don't exit on error during cleanup - continue even if some commands fail
set +e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping TSIM Production System...${NC}"

# Load environment variables if exists
if [ -f /etc/tsim/tsim.env ]; then
    source /etc/tsim/tsim.env
fi

TSIM_LOG_DIR=${TSIM_LOG_DIR:-./logs}

# Stop Backend (Gunicorn)
if [ -f "$TSIM_LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$TSIM_LOG_DIR/backend.pid")
    if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}   Stopping Backend (PID: $BACKEND_PID)...${NC}"
        kill "$BACKEND_PID" 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            kill -9 "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$TSIM_LOG_DIR/backend.pid"
        echo -e "${GREEN}   ✅ Backend stopped${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Backend PID file exists but process not running${NC}"
        rm -f "$TSIM_LOG_DIR/backend.pid"
    fi
else
    # Try to find and kill by process name
    pkill -f "gunicorn.*complete_backend" 2>/dev/null && echo -e "${GREEN}   ✅ Backend stopped (by process name)${NC}" || true
fi

# Stop Frontend
if [ -f "$TSIM_LOG_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$TSIM_LOG_DIR/frontend.pid")
    if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}   Stopping Frontend (PID: $FRONTEND_PID)...${NC}"
        kill "$FRONTEND_PID" 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
            kill -9 "$FRONTEND_PID" 2>/dev/null || true
        fi
        rm -f "$TSIM_LOG_DIR/frontend.pid"
        echo -e "${GREEN}   ✅ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Frontend PID file exists but process not running${NC}"
        rm -f "$TSIM_LOG_DIR/frontend.pid"
    fi
else
    # Try to find and kill by process name
    pkill -f "serve.*traffic-safety-ui" 2>/dev/null && echo -e "${GREEN}   ✅ Frontend stopped (by process name)${NC}" || true
fi

# Additional cleanup
pkill -f "gunicorn" 2>/dev/null || true
pkill -f "serve" 2>/dev/null || true

# Kill weather station processes and clean up lock files
echo -e "${YELLOW}🧹 Cleaning up weather station processes...${NC}"

# FIRST: Kill all backend processes that might be holding serial ports
# This must be done BEFORE checking USB devices to ensure clean release
BACKEND_PIDS=$(pgrep -f "gunicorn.*complete_backend|python.*complete_backend|uvicorn.*complete_backend" 2>/dev/null || true)
if [ -n "$BACKEND_PIDS" ]; then
    echo -e "${YELLOW}   Killing backend processes first (releases serial ports)...${NC}"
    for pid in $BACKEND_PIDS; do
        echo -e "${YELLOW}   Stopping process $pid...${NC}"
        kill "$pid" 2>/dev/null || true
        sleep 2
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}   Force killing process $pid...${NC}"
            kill -9 "$pid" 2>/dev/null || true
            sleep 1
        fi
    done
    # Wait for processes to fully release USB devices and threads
    echo -e "${YELLOW}   Waiting for processes to fully release resources...${NC}"
    sleep 5
fi

# Detect OS and USB device pattern
if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
    # Linux or macOS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        USB_PATTERNS=("/dev/ttyUSB*" "/dev/ttyACM*")
    else
        USB_PATTERNS=("/dev/cu.usbserial*" "/dev/tty.usbserial*")
    fi
    
    FOUND_PROCESSES=0
    
    for pattern in "${USB_PATTERNS[@]}"; do
        # Use shopt to enable nullglob for proper glob expansion
        shopt -s nullglob 2>/dev/null || true
        for device in $pattern; do
            if [ -e "$device" ]; then
                echo -e "${YELLOW}   Checking device: $device${NC}"
                PIDS=$(lsof -t "$device" 2>/dev/null || true)
                if [ -n "$PIDS" ]; then
                    FOUND_PROCESSES=1
                    echo -e "${YELLOW}   Found processes using $device, killing...${NC}"
                    for pid in $PIDS; do
                        # Show process info before killing
                        ps -p "$pid" -o pid,ppid,cmd 2>/dev/null || true
                        kill "$pid" 2>/dev/null || true
                        sleep 1
                        # Force kill if still running
                        if ps -p "$pid" > /dev/null 2>&1; then
                            kill -9 "$pid" 2>/dev/null || true
                        fi
                    done
                fi
            fi
        done
        shopt -u nullglob 2>/dev/null || true
    done
    
    # Additional cleanup: kill any remaining Python processes that might have serial connections
    REMAINING_PYTHON=$(pgrep -f "python.*cr1000|python.*serial|python.*pycampbell" 2>/dev/null || true)
    if [ -n "$REMAINING_PYTHON" ]; then
        echo -e "${YELLOW}   Killing remaining Python serial processes...${NC}"
        for pid in $REMAINING_PYTHON; do
            kill "$pid" 2>/dev/null || true
            sleep 1
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    if [ $FOUND_PROCESSES -eq 0 ]; then
        echo -e "${GREEN}   ✅ No processes found using USB serial ports${NC}"
    else
        echo -e "${GREEN}   ✅ Weather station processes killed${NC}"
    fi
    
    # Wait for USB device to be fully released before finishing
    echo -e "${YELLOW}   Waiting for USB device to be fully released...${NC}"
    sleep 3
else
    echo -e "${YELLOW}   ⚠️  OS not recognized, skipping USB device check${NC}"
fi

# Additional pass: ensure all backend processes are gone
BACKEND_PIDS=$(pgrep -f "gunicorn.*complete_backend|python.*complete_backend|uvicorn.*complete_backend" 2>/dev/null || true)
if [ -n "$BACKEND_PIDS" ]; then
    echo -e "${YELLOW}   Final cleanup: killing any remaining backend processes...${NC}"
    for pid in $BACKEND_PIDS; do
        kill -9 "$pid" 2>/dev/null || true
    done
    sleep 1
    echo -e "${GREEN}   ✅ All backend processes terminated${NC}"
fi

# Remove weather station lock files (check for stale PIDs first)
echo -e "${YELLOW}   Removing weather station lock files...${NC}"

# Check if lock file has a PID and if that process still exists
if [ -f /tmp/tsim_weather_worker.lock ]; then
    LOCK_PID=$(cat /tmp/tsim_weather_worker.lock 2>/dev/null | tr -d '\n' || echo "")
    if [ -n "$LOCK_PID" ] && [ "$LOCK_PID" -eq "$LOCK_PID" ] 2>/dev/null; then
        if ! ps -p "$LOCK_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}   Found stale lock file with non-existent PID $LOCK_PID, removing...${NC}"
        else
            echo -e "${YELLOW}   Lock file held by PID $LOCK_PID, killing process...${NC}"
            kill "$LOCK_PID" 2>/dev/null || true
            sleep 1
            if ps -p "$LOCK_PID" > /dev/null 2>&1; then
                kill -9 "$LOCK_PID" 2>/dev/null || true
            fi
        fi
    fi
fi

# Remove all lock files
rm -f /tmp/tsim_weather_worker.lock
rm -f /tmp/tsim_weather_worker.pid
rm -f /tmp/tsim_cr1000_access.lock

# Also check for any processes holding file locks on these files
for lock_file in /tmp/tsim_weather_worker.lock /tmp/tsim_cr1000_access.lock; do
    if [ -f "$lock_file" ]; then
        # Try to find processes with this file open
        LOCK_PIDS=$(lsof -t "$lock_file" 2>/dev/null || true)
        if [ -n "$LOCK_PIDS" ]; then
            echo -e "${YELLOW}   Found processes holding lock on $lock_file, killing...${NC}"
            for pid in $LOCK_PIDS; do
                kill "$pid" 2>/dev/null || true
                sleep 1
                if ps -p "$pid" > /dev/null 2>&1; then
                    kill -9 "$pid" 2>/dev/null || true
                fi
            done
        fi
        rm -f "$lock_file"
    fi
done

echo -e "${GREEN}   ✅ Lock files removed${NC}"

# Final verification: ensure no processes are using USB devices
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USB_DEVICE=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -n1)
    if [ -n "$USB_DEVICE" ]; then
        REMAINING_PIDS=$(lsof -t "$USB_DEVICE" 2>/dev/null || true)
        if [ -n "$REMAINING_PIDS" ]; then
            echo -e "${YELLOW}   ⚠️  Warning: Some processes still using $USB_DEVICE: $REMAINING_PIDS${NC}"
            echo -e "${YELLOW}   Force killing remaining processes...${NC}"
            for pid in $REMAINING_PIDS; do
                kill -9 "$pid" 2>/dev/null || true
            done
            sleep 2
        else
            echo -e "${GREEN}   ✅ USB device $USB_DEVICE is free${NC}"
        fi
    fi
fi

# Final wait to ensure everything is cleaned up
echo -e "${YELLOW}   Final cleanup wait...${NC}"
sleep 2

echo -e "${GREEN}✅ TSIM Production System Stopped${NC}"

