#!/bin/bash
# Weather Station Reset Script
# This script completely resets the weather station connection

set +e  # Don't exit on errors

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔄 Resetting Weather Station Connection...${NC}"
echo ""

# Step 1: Find and kill processes using USB serial port
echo -e "${YELLOW}Step 1: Killing processes using USB serial port...${NC}"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USB_DEVICES=("/dev/ttyUSB*" "/dev/ttyACM*")
elif [[ "$OSTYPE" == "darwin"* ]]; then
    USB_DEVICES=("/dev/cu.usbserial*" "/dev/tty.usbserial*")
else
    USB_DEVICES=("/dev/ttyUSB*")
fi

KILLED_ANY=0
for pattern in "${USB_DEVICES[@]}"; do
    shopt -s nullglob 2>/dev/null || true
    for device in $pattern; do
        if [ -e "$device" ]; then
            PIDS=$(lsof -t "$device" 2>/dev/null || true)
            if [ -n "$PIDS" ]; then
                echo -e "${YELLOW}   Found processes using $device:${NC}"
                for pid in $PIDS; do
                    ps -p "$pid" -o pid,cmd 2>/dev/null | tail -1
                    kill "$pid" 2>/dev/null || true
                    sleep 1
                    if ps -p "$pid" > /dev/null 2>&1; then
                        kill -9 "$pid" 2>/dev/null || true
                    fi
                done
                KILLED_ANY=1
            fi
        fi
    done
    shopt -u nullglob 2>/dev/null || true
done

if [ $KILLED_ANY -eq 0 ]; then
    echo -e "${GREEN}   ✅ No processes found using USB serial ports${NC}"
else
    echo -e "${GREEN}   ✅ Processes killed${NC}"
fi
echo ""

# Step 2: Kill backend processes
echo -e "${YELLOW}Step 2: Stopping backend processes...${NC}"
BACKEND_PIDS=$(pgrep -f "gunicorn.*complete_backend|python.*complete_backend|uvicorn.*complete_backend" 2>/dev/null || true)
if [ -n "$BACKEND_PIDS" ]; then
    for pid in $BACKEND_PIDS; do
        echo -e "${YELLOW}   Killing PID $pid...${NC}"
        kill "$pid" 2>/dev/null || true
        sleep 1
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    echo -e "${GREEN}   ✅ Backend processes stopped${NC}"
else
    echo -e "${GREEN}   ✅ No backend processes found${NC}"
fi
echo ""

# Step 3: Remove all lock files
echo -e "${YELLOW}Step 3: Removing lock files...${NC}"
rm -f /tmp/tsim_weather_worker.lock
rm -f /tmp/tsim_weather_worker.pid
rm -f /tmp/tsim_cr1000_access.lock
echo -e "${GREEN}   ✅ Lock files removed${NC}"
echo ""

# Step 4: Wait a moment for cleanup
echo -e "${YELLOW}Step 4: Waiting for cleanup...${NC}"
sleep 2
echo ""

# Step 5: Verify USB device is available
echo -e "${YELLOW}Step 5: Checking USB device...${NC}"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    USB_DEVICE=$(ls /dev/ttyUSB* 2>/dev/null | head -1)
elif [[ "$OSTYPE" == "darwin"* ]]; then
    USB_DEVICE=$(ls /dev/cu.usbserial* 2>/dev/null | head -1)
else
    USB_DEVICE=$(ls /dev/ttyUSB* 2>/dev/null | head -1)
fi

if [ -n "$USB_DEVICE" ] && [ -e "$USB_DEVICE" ]; then
    echo -e "${GREEN}   ✅ USB device found: $USB_DEVICE${NC}"
    ls -l "$USB_DEVICE" 2>/dev/null | awk '{print "   Permissions: " $1 " Owner: " $3 ":" $4}'
else
    echo -e "${RED}   ❌ USB device not found!${NC}"
    echo -e "${YELLOW}   Please check:${NC}"
    echo -e "      - Is the weather station connected?"
    echo -e "      - Is the USB cable working?"
    echo -e "      - Run: ls -la /dev/ttyUSB*"
    exit 1
fi
echo ""

# Step 6: Test USB access
echo -e "${YELLOW}Step 6: Testing USB device access...${NC}"
if python3 -c "import serial; s = serial.Serial('$USB_DEVICE', 9600, timeout=2); s.close(); print('OK')" 2>/dev/null; then
    echo -e "${GREEN}   ✅ USB device is accessible${NC}"
else
    echo -e "${RED}   ❌ Cannot access USB device${NC}"
    echo -e "${YELLOW}   Possible issues:${NC}"
    echo -e "      - Permission denied (user not in plugdev group)"
    echo -e "      - Device busy (wait a moment and try again)"
    echo -e "      - Wrong baud rate or device"
    echo ""
    echo -e "${YELLOW}   To fix permissions:${NC}"
    echo -e "      sudo usermod -a -G dialout,plugdev \$USER"
    echo -e "      (then logout and login again)"
fi
echo ""

# Step 7: Summary
echo -e "${GREEN}✅ Weather Station Reset Complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "   1. Start the backend: ./scripts/start_production.sh"
echo -e "   2. Wait 10 seconds for weather worker to start"
echo -e "   3. Check logs: tail -f logs/backend.log | grep -i weather"
echo -e "   4. Test API: curl http://localhost:8002/api/weather/latest"
echo ""



