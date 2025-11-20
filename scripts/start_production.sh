#!/bin/bash
# TSIM Production Startup Script
# Starts backend with Gunicorn and frontend with serve (production build)

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Starting TSIM Production System...${NC}"

# Get the script directory and navigate to project root
# If script is in scripts/ subdirectory, go up one level to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "scripts" ]]; then
    # Script is in scripts/ subdirectory, go to project root
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi
cd "$PROJECT_ROOT"

# Load environment variables if exists
if [ -f /etc/tsim/tsim.env ]; then
    echo -e "${YELLOW}   Loading environment from /etc/tsim/tsim.env${NC}"
    source /etc/tsim/tsim.env
fi

# Set defaults if not in environment
TSIM_WORKERS=${TSIM_WORKERS:-1}
TSIM_HOST=${TSIM_HOST:-0.0.0.0}
TSIM_BACKEND_PORT=${TSIM_BACKEND_PORT:-8002}
TSIM_FRONTEND_PORT=${TSIM_FRONTEND_PORT:-3001}
TSIM_LOG_DIR=${TSIM_LOG_DIR:-./logs}

# Create logs directory
mkdir -p "$TSIM_LOG_DIR"

# Check if virtual environment exists, create if missing
if [[ ! -d "venv" ]]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found. Creating now...${NC}"
    python3 -m venv venv
    if [[ $? -ne 0 ]]; then
        echo -e "${RED}❌ Failed to create virtual environment${NC}"
        echo -e "${YELLOW}   Installing python3-venv if needed...${NC}"
        sudo apt-get update && sudo apt-get install -y python3-venv 2>/dev/null || true
        python3 -m venv venv
        if [[ $? -ne 0 ]]; then
            echo -e "${RED}❌ Could not create virtual environment. Please install python3-venv${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}   ✅ Virtual environment created${NC}"
fi

# Activate virtual environment
source venv/bin/activate

# Check if gunicorn is installed
if ! command -v gunicorn &> /dev/null; then
    echo -e "${YELLOW}   Installing gunicorn...${NC}"
    pip install gunicorn
fi

# Check if frontend build exists (either in frontend/ or traffic-safety-ui/dist)
if [[ ! -d "frontend" ]] && [[ ! -d "traffic-safety-ui/dist" ]]; then
    echo -e "${YELLOW}⚠️  Frontend production build not found.${NC}"
    if [[ -d "traffic-safety-ui" ]]; then
        echo -e "${YELLOW}   Building frontend from source...${NC}"
        cd traffic-safety-ui
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}   Installing frontend dependencies...${NC}"
            npm install
        fi
        echo -e "${YELLOW}   Building frontend for production...${NC}"
        npm run build
        cd ..
        # Copy dist to frontend directory for consistency
        if [[ -d "traffic-safety-ui/dist" ]]; then
            cp -r traffic-safety-ui/dist frontend
            echo -e "${GREEN}   ✅ Frontend built and copied to frontend/${NC}"
        fi
    else
        echo -e "${RED}❌ Frontend build not found and no source directory available${NC}"
        echo -e "${YELLOW}   Expected: frontend/ or traffic-safety-ui/dist/${NC}"
        exit 1
    fi
elif [[ -d "frontend" ]]; then
    echo -e "${GREEN}   ✅ Frontend build found in frontend/${NC}"
elif [[ -d "traffic-safety-ui/dist" ]]; then
    echo -e "${GREEN}   ✅ Frontend build found in traffic-safety-ui/dist/${NC}"
fi

# Stop any existing processes
if [ -f "$TSIM_LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$TSIM_LOG_DIR/backend.pid")
    if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}   Stopping existing backend (PID: $BACKEND_PID)...${NC}"
        kill "$BACKEND_PID" 2>/dev/null || true
        sleep 2
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            kill -9 "$BACKEND_PID" 2>/dev/null || true
        fi
    fi
    rm -f "$TSIM_LOG_DIR/backend.pid"
fi

if [ -f "$TSIM_LOG_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$TSIM_LOG_DIR/frontend.pid")
    if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}   Stopping existing frontend (PID: $FRONTEND_PID)...${NC}"
        kill "$FRONTEND_PID" 2>/dev/null || true
        sleep 2
        if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
            kill -9 "$FRONTEND_PID" 2>/dev/null || true
        fi
    fi
    rm -f "$TSIM_LOG_DIR/frontend.pid"
fi

# Kill any existing processes on ports
if lsof -Pi :$TSIM_BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}   Killing process on port $TSIM_BACKEND_PORT...${NC}"
    lsof -ti :$TSIM_BACKEND_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

if lsof -Pi :$TSIM_FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}   Killing process on port $TSIM_FRONTEND_PORT...${NC}"
    lsof -ti :$TSIM_FRONTEND_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Clean up stale weather station lock files and processes before starting
echo -e "${YELLOW}🧹 Cleaning up weather station resources for fresh start...${NC}"

# Always remove lock files on start (fresh start)
echo -e "${YELLOW}   Removing weather station lock files...${NC}"
rm -f /tmp/tsim_weather_worker.lock
rm -f /tmp/tsim_cr1000_access.lock
rm -f /tmp/tsim_weather_worker.pid
echo -e "${GREEN}   ✅ Lock files removed${NC}"

# Check for and kill any processes using USB serial ports that might be stale
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USB_DEVICE=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -n1)
    if [ -n "$USB_DEVICE" ] && [ -e "$USB_DEVICE" ]; then
        echo -e "${YELLOW}   Checking USB device: $USB_DEVICE${NC}"
        PIDS=$(lsof -t "$USB_DEVICE" 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            echo -e "${YELLOW}   Found processes using $USB_DEVICE, cleaning up...${NC}"
            for pid in $PIDS; do
                # Check if it's a stale process
                if ! ps -p "$pid" > /dev/null 2>&1; then
                    continue
                fi
                # Kill any process using the USB device (fresh start)
                echo -e "${YELLOW}   Killing process $pid using $USB_DEVICE...${NC}"
                kill "$pid" 2>/dev/null || true
                sleep 1
                if ps -p "$pid" > /dev/null 2>&1; then
                    kill -9 "$pid" 2>/dev/null || true
                    sleep 1
                fi
            done
            # Wait for USB device to be fully released
            echo -e "${YELLOW}   Waiting for USB device to be released...${NC}"
            sleep 3
        else
            echo -e "${GREEN}   ✅ No processes using USB device${NC}"
        fi
    fi
fi

# Verify USB device is accessible
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USB_DEVICE=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -n1)
    if [ -n "$USB_DEVICE" ] && [ -e "$USB_DEVICE" ]; then
        echo -e "${GREEN}   ✅ USB device detected: $USB_DEVICE${NC}"
    else
        echo -e "${YELLOW}   ⚠️  USB device not found - weather station may not work${NC}"
    fi
fi

# Start Backend with Gunicorn (production WSGI server)
echo -e "${YELLOW}🌐 Starting TSIM Backend (Gunicorn with $TSIM_WORKERS workers)...${NC}"

# Export weather station settings if available
if [ -z "$CR1000_SERIAL_PORT" ]; then
    # Try to auto-detect USB serial device
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        CR1000_SERIAL_PORT=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -n1)
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        CR1000_SERIAL_PORT=$(ls /dev/cu.usbserial-* /dev/tty.usbserial-* 2>/dev/null | head -n1)
    fi
fi

# Always export these variables so Gunicorn workers can access them
if [ -n "$CR1000_SERIAL_PORT" ]; then
    export CR1000_SERIAL_PORT
    echo -e "${GREEN}   Using CR1000 serial: $CR1000_SERIAL_PORT${NC}"
else
    echo -e "${YELLOW}   ⚠️  CR1000 serial port not detected - weather station may not work${NC}"
fi

if [ -z "$CR1000_BAUD" ]; then
    export CR1000_BAUD=9600
else
    export CR1000_BAUD
fi

# Export to environment for Gunicorn workers
export CR1000_SERIAL_PORT CR1000_BAUD

# Start Gunicorn with environment variables
# CRITICAL: Pass environment variables to Gunicorn workers using --env flag
# This ensures weather station serial port is available to workers
# Also ensure we're in the correct directory and using the venv
cd "$PROJECT_ROOT"
source venv/bin/activate

# Export environment variables to current shell (for Gunicorn to inherit)
export CR1000_SERIAL_PORT CR1000_BAUD

# Start Gunicorn - ensure it runs from project root with correct environment
# CRITICAL: WebSocket support requires:
# - UvicornWorker (supports WebSockets)
# - Longer timeout for WebSocket connections
# - Keep-alive for connection stability
gunicorn complete_backend:app \
  --workers $TSIM_WORKERS \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind $TSIM_HOST:$TSIM_BACKEND_PORT \
  --timeout 300 \
  --keep-alive 10 \
  --access-logfile "$TSIM_LOG_DIR/backend_access.log" \
  --error-logfile "$TSIM_LOG_DIR/backend_error.log" \
  --log-level info \
  --daemon \
  --pid "$TSIM_LOG_DIR/backend.pid" \
  --env CR1000_SERIAL_PORT="$CR1000_SERIAL_PORT" \
  --env CR1000_BAUD="$CR1000_BAUD" \
  --chdir "$PROJECT_ROOT"

# Wait for backend to start (gateway service initialization can take time)
echo -e "${YELLOW}   Waiting for backend to initialize...${NC}"
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if [ -f "$TSIM_LOG_DIR/backend.pid" ]; then
        BACKEND_PID=$(cat "$TSIM_LOG_DIR/backend.pid")
        if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            echo -e "${GREEN}   ✅ Backend started successfully (PID: $BACKEND_PID)${NC}"
            break
        fi
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ $((WAIT_COUNT % 5)) -eq 0 ]; then
        echo -e "${YELLOW}   Still waiting... (${WAIT_COUNT}s)${NC}"
    fi
done

# Wait for weather worker to start and verify it's actually polling
echo -e "${YELLOW}   Waiting for weather worker to initialize and start polling...${NC}"
WEATHER_WORKER_STARTED=0
MAX_WEATHER_WAIT=30
WEATHER_WAIT_COUNT=0

while [ $WEATHER_WAIT_COUNT -lt $MAX_WEATHER_WAIT ]; do
    # Check both backend.log and backend_error.log (Gunicorn logs to error log)
    if [ -f "$TSIM_LOG_DIR/backend_error.log" ]; then
        # Check if weather worker thread started (look for WEATHER: messages)
        if grep -q "WEATHER:.*Thread started\|Weather worker thread started\|WEATHER:.*Worker thread function starting" "$TSIM_LOG_DIR/backend_error.log" 2>/dev/null; then
            # Give it a bit more time to actually start polling
            sleep 3
            # Check if it's actually polling (look for poll attempts or data insertion)
            if grep -q "WEATHER:.*Poll.*ok\|WEATHER:.*Poll #\|Weather worker.*Inserted data\|Inserted data.*T=" "$TSIM_LOG_DIR/backend_error.log" 2>/dev/null; then
                echo -e "${GREEN}   ✅ Weather worker started and polling${NC}"
                WEATHER_WORKER_STARTED=1
                break
            elif grep -q "WEATHER:.*Started - polling\|WEATHER:.*Connected to" "$TSIM_LOG_DIR/backend_error.log" 2>/dev/null; then
                # Worker started but not polling yet, wait a bit more
                if [ $WEATHER_WAIT_COUNT -lt 20 ]; then
                    sleep 2
                    WEATHER_WAIT_COUNT=$((WEATHER_WAIT_COUNT + 2))
                    continue
                fi
            fi
        fi
    fi
    # Also check backend.log (if it exists)
    if [ -f "$TSIM_LOG_DIR/backend.log" ]; then
        if grep -q "WEATHER:.*Thread started\|Weather worker thread started\|WEATHER:.*Worker thread function starting" "$TSIM_LOG_DIR/backend.log" 2>/dev/null; then
            sleep 3
            if grep -q "WEATHER:.*Poll.*ok\|WEATHER:.*Poll #\|Weather worker.*Inserted data" "$TSIM_LOG_DIR/backend.log" 2>/dev/null; then
                echo -e "${GREEN}   ✅ Weather worker started and polling${NC}"
                WEATHER_WORKER_STARTED=1
                break
            fi
        fi
    fi
    sleep 2
    WEATHER_WAIT_COUNT=$((WEATHER_WAIT_COUNT + 2))
    if [ $((WEATHER_WAIT_COUNT % 10)) -eq 0 ]; then
        echo -e "${YELLOW}   Still waiting for weather worker... (${WEATHER_WAIT_COUNT}s)${NC}"
    fi
done

if [ $WEATHER_WORKER_STARTED -eq 0 ]; then
    echo -e "${YELLOW}   ⚠️  Weather worker may not have started properly${NC}"
    echo -e "${YELLOW}   Check logs: tail -50 $TSIM_LOG_DIR/backend_error.log | grep -i weather${NC}"
    # Show last few weather-related log lines for debugging
    if [ -f "$TSIM_LOG_DIR/backend_error.log" ]; then
        echo -e "${YELLOW}   Last weather worker log entries:${NC}"
        tail -30 "$TSIM_LOG_DIR/backend_error.log" | grep -i "WEATHER\|weather" | tail -5 || echo "   (no weather logs found)"
    fi
    if [ -f "$TSIM_LOG_DIR/backend.log" ]; then
        tail -30 "$TSIM_LOG_DIR/backend.log" | grep -i "WEATHER\|weather" | tail -5 || true
    fi
fi

# Final check if backend started successfully
if [ -f "$TSIM_LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$TSIM_LOG_DIR/backend.pid")
    if ps -p "$BACKEND_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Backend started successfully (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${RED}   ❌ Backend process not running${NC}"
        echo -e "${YELLOW}   Checking error logs...${NC}"
        tail -20 "$TSIM_LOG_DIR/backend_error.log" 2>/dev/null || echo "No error log found"
        exit 1
    fi
else
    echo -e "${RED}   ❌ Backend PID file not created after ${MAX_WAIT}s${NC}"
    echo -e "${YELLOW}   Checking error logs...${NC}"
    tail -20 "$TSIM_LOG_DIR/backend_error.log" 2>/dev/null || echo "No error log found"
    exit 1
fi

# Start Frontend (serve production build)
echo -e "${YELLOW}📱 Starting TSIM Frontend (Production Build)...${NC}"

# Determine frontend directory
if [[ -d "frontend" ]]; then
    FRONTEND_DIR="frontend"
elif [[ -d "traffic-safety-ui/dist" ]]; then
    FRONTEND_DIR="traffic-safety-ui/dist"
else
    echo -e "${RED}❌ Frontend directory not found${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Check if serve is available
if ! command -v serve &> /dev/null && ! command -v npx &> /dev/null; then
    echo -e "${YELLOW}   Installing serve...${NC}"
    npm install -g serve
fi

# Ensure log directory exists (use absolute path from PROJECT_ROOT)
FRONTEND_LOG_FILE="$PROJECT_ROOT/$TSIM_LOG_DIR/frontend.log"
FRONTEND_PID_FILE="$PROJECT_ROOT/$TSIM_LOG_DIR/frontend.pid"
mkdir -p "$PROJECT_ROOT/$TSIM_LOG_DIR"

# Start serve (we're already in the frontend/dist directory)
if command -v serve &> /dev/null; then
    nohup serve -s . -l $TSIM_FRONTEND_PORT > "$FRONTEND_LOG_FILE" 2>&1 &
    FRONTEND_PID=$!
else
    nohup npx serve -s . -l $TSIM_FRONTEND_PORT > "$FRONTEND_LOG_FILE" 2>&1 &
    FRONTEND_PID=$!
fi

echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
cd "$PROJECT_ROOT"

# Wait for frontend to start
sleep 3

# Check if frontend started successfully
if [ -f "$TSIM_LOG_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$TSIM_LOG_DIR/frontend.pid")
    if ps -p "$FRONTEND_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Frontend started successfully (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${RED}   ❌ Frontend failed to start${NC}"
        exit 1
    fi
else
    echo -e "${RED}   ❌ Frontend PID file not created${NC}"
    exit 1
fi

# Get local IP for display
LOCAL_IP=""
if command -v ifconfig >/dev/null 2>&1; then
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v "127.0.0.1" | grep -v "192.168.4" | awk '{print $2}' | head -n1 | sed 's/addr://')
fi

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi

echo ""
echo -e "${GREEN}✅ TSIM Production System Started${NC}"
echo ""
echo -e "${GREEN}🌐 System Access URLs:${NC}"
echo -e "   Frontend:     ${YELLOW}http://$LOCAL_IP:$TSIM_FRONTEND_PORT${NC}"
echo -e "   Backend API:  ${YELLOW}http://$LOCAL_IP:$TSIM_BACKEND_PORT${NC}"
echo -e "   WebSocket:    ${YELLOW}ws://$LOCAL_IP:$TSIM_BACKEND_PORT/ws${NC}"
echo -e "   API Docs:     ${YELLOW}http://$LOCAL_IP:$TSIM_BACKEND_PORT/docs${NC}"
echo ""
echo -e "${GREEN}📊 System Status:${NC}"
echo -e "   Backend PID:  ${YELLOW}$(cat "$TSIM_LOG_DIR/backend.pid")${NC} (Gunicorn with $TSIM_WORKERS workers)"
echo -e "   Frontend PID: ${YELLOW}$(cat "$TSIM_LOG_DIR/frontend.pid")${NC}"
echo -e "   Logs:         ${YELLOW}$TSIM_LOG_DIR/${NC}"
echo ""
echo -e "${YELLOW}💡 To stop: ./stop_production.sh${NC}"
echo -e "${YELLOW}💡 To view logs: tail -f $TSIM_LOG_DIR/*.log${NC}"
echo ""

