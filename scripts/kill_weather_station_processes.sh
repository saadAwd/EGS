#!/bin/bash
# Script to kill processes using weather station USB serial port
# and clean up lock files before restarting the server

# Don't exit on error - continue even if some commands fail
set +e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔍 Finding processes using USB serial ports...${NC}"

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
        for device in $pattern; do
            if [ -e "$device" ]; then
                echo -e "${YELLOW}Checking device: $device${NC}"
                PIDS=$(lsof -t "$device" 2>/dev/null || true)
                if [ -n "$PIDS" ]; then
                    FOUND_PROCESSES=1
                    echo -e "${RED}Found processes using $device:${NC}"
                    for pid in $PIDS; do
                        ps -p "$pid" -o pid,ppid,cmd || true
                    done
                fi
            fi
        done
    done
    
    if [ $FOUND_PROCESSES -eq 0 ]; then
        echo -e "${GREEN}✅ No processes found using USB serial ports${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  OS not recognized, skipping USB device check${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 Finding Python/Gunicorn backend processes...${NC}"

# Find backend processes
BACKEND_PIDS=$(pgrep -f "gunicorn.*complete_backend|python.*complete_backend|uvicorn.*complete_backend" 2>/dev/null || true)

if [ -n "$BACKEND_PIDS" ]; then
    echo -e "${RED}Found backend processes:${NC}"
    for pid in $BACKEND_PIDS; do
        ps -p "$pid" -o pid,ppid,cmd || true
    done
else
    echo -e "${GREEN}✅ No backend processes found${NC}"
fi

echo ""
echo -e "${YELLOW}🧹 Cleaning up lock files...${NC}"

# Remove lock files
rm -f /tmp/tsim_weather_worker.lock
rm -f /tmp/tsim_weather_worker.pid
rm -f /tmp/tsim_cr1000_access.lock
echo -e "${GREEN}✅ Lock files removed${NC}"

echo ""
echo -e "${YELLOW}💡 To kill processes, run:${NC}"
echo -e "   ${GREEN}pkill -f 'gunicorn.*complete_backend'${NC}"
echo -e "   ${GREEN}pkill -f 'python.*complete_backend'${NC}"
echo -e "   ${GREEN}pkill -f 'uvicorn.*complete_backend'${NC}"
echo ""
echo -e "${YELLOW}Or kill specific PIDs:${NC}"
if [ -n "$BACKEND_PIDS" ]; then
    for pid in $BACKEND_PIDS; do
        echo -e "   ${GREEN}kill $pid${NC}"
    done
fi

echo ""
echo -e "${GREEN}✅ Ready to restart server${NC}"

