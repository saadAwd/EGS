#!/bin/bash
# Weather Station (CR1000) Troubleshooting Script for Raspberry Pi
# Run this script on the Pi to diagnose connectivity issues

set -e

echo "=========================================="
echo "Weather Station (CR1000) Troubleshooting"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Step 1: Check USB serial devices
echo "Step 1: Checking USB Serial Devices"
echo "-----------------------------------"
USB_DEVICES=$(ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || echo "")
if [ -z "$USB_DEVICES" ]; then
    print_error "No USB serial devices found (/dev/ttyUSB*, /dev/ttyACM*)"
    echo "  → Make sure the weather station is connected via USB"
    echo "  → Try: lsusb (to see if USB device is detected)"
else
    print_status "Found USB serial device(s):"
    for dev in $USB_DEVICES; do
        echo "  - $dev ($(ls -l $dev | awk '{print $1, $3, $4}'))"
    done
fi
echo ""

# Step 2: Check user permissions
echo "Step 2: Checking User Permissions"
echo "-----------------------------------"
CURRENT_USER=$(whoami)
if groups | grep -q dialout; then
    print_status "User '$CURRENT_USER' is in 'dialout' group"
else
    print_error "User '$CURRENT_USER' is NOT in 'dialout' group"
    echo "  → Fix: sudo usermod -aG dialout $CURRENT_USER"
    echo "  → Then: logout and login again (or reboot)"
fi
echo ""

# Step 3: Check serial port permissions
echo "Step 3: Checking Serial Port Permissions"
echo "-----------------------------------"
if [ -n "$USB_DEVICES" ]; then
    FIRST_DEV=$(echo $USB_DEVICES | awk '{print $1}')
    if [ -r "$FIRST_DEV" ] && [ -w "$FIRST_DEV" ]; then
        print_status "Port $FIRST_DEV is readable and writable"
    else
        print_error "Port $FIRST_DEV is NOT readable/writable"
        echo "  → Check permissions: ls -l $FIRST_DEV"
        echo "  → Fix: sudo chmod 666 $FIRST_DEV (temporary)"
        echo "  → Or: sudo usermod -aG dialout $CURRENT_USER (permanent)"
    fi
else
    print_warning "Skipping (no USB devices found)"
fi
echo ""

# Step 4: Check Python environment
echo "Step 4: Checking Python Environment"
echo "-----------------------------------"
if [ -d "$HOME/TSIM/venv" ]; then
    print_status "Virtual environment found at ~/TSIM/venv"
    source ~/TSIM/venv/bin/activate 2>/dev/null || true
else
    print_warning "Virtual environment not found at ~/TSIM/venv"
    echo "  → Using system Python"
fi

# Check if pycampbellcr1000 is installed
if python3 -c "import pycampbellcr1000" 2>/dev/null; then
    print_status "pycampbellcr1000 is installed"
    PY_VERSION=$(python3 -c "import pycampbellcr1000; print(pycampbellcr1000.__version__)" 2>/dev/null || echo "unknown")
    echo "  → Version: $PY_VERSION"
else
    print_error "pycampbellcr1000 is NOT installed"
    echo "  → Fix: pip install pycampbellcr1000"
fi

# Check if pyserial is installed
if python3 -c "import serial" 2>/dev/null; then
    print_status "pyserial is installed"
else
    print_error "pyserial is NOT installed"
    echo "  → Fix: pip install pyserial"
fi
echo ""

# Step 5: Test serial port access
echo "Step 5: Testing Serial Port Access"
echo "-----------------------------------"
if [ -n "$USB_DEVICES" ]; then
    FIRST_DEV=$(echo $USB_DEVICES | awk '{print $1}')
    echo "Testing access to $FIRST_DEV..."
    
    python3 <<PYTHON_EOF
import sys
import serial
import time

port = "$FIRST_DEV"
try:
    print(f"  → Attempting to open {port}...")
    ser = serial.Serial(port, 9600, timeout=2)
    print(f"  → Successfully opened {port}")
    print(f"  → Port settings: {ser.baudrate} baud, {ser.bytesize} bits, {ser.parity} parity")
    ser.close()
    print(f"  → Port closed successfully")
except PermissionError as e:
    print(f"  → PERMISSION ERROR: {e}")
    print(f"  → User needs to be in 'dialout' group")
    sys.exit(1)
except Exception as e:
    print(f"  → ERROR: {e}")
    sys.exit(1)
PYTHON_EOF
    
    if [ $? -eq 0 ]; then
        print_status "Serial port access test PASSED"
    else
        print_error "Serial port access test FAILED"
    fi
else
    print_warning "Skipping (no USB devices found)"
fi
echo ""

# Step 6: Check CR1000 service file
echo "Step 6: Checking CR1000 Service Configuration"
echo "-----------------------------------"
if [ -f "$HOME/TSIM/cr1000_service.py" ]; then
    print_status "cr1000_service.py found"
else
    print_error "cr1000_service.py NOT found"
    echo "  → Expected location: ~/TSIM/cr1000_service.py"
fi
echo ""

# Step 7: Check environment variables
echo "Step 7: Checking Environment Variables"
echo "-----------------------------------"
if [ -n "$CR1000_SERIAL_PORT" ]; then
    print_status "CR1000_SERIAL_PORT is set: $CR1000_SERIAL_PORT"
    if [ -e "$CR1000_SERIAL_PORT" ]; then
        print_status "Port $CR1000_SERIAL_PORT exists"
    else
        print_error "Port $CR1000_SERIAL_PORT does NOT exist"
    fi
else
    print_warning "CR1000_SERIAL_PORT is NOT set"
    if [ -n "$USB_DEVICES" ]; then
        FIRST_DEV=$(echo $USB_DEVICES | awk '{print $1}')
        echo "  → Suggested: export CR1000_SERIAL_PORT=$FIRST_DEV"
    fi
fi

if [ -n "$CR1000_BAUD" ]; then
    print_status "CR1000_BAUD is set: $CR1000_BAUD"
else
    print_warning "CR1000_BAUD is NOT set (default: 9600)"
    echo "  → Suggested: export CR1000_BAUD=9600"
fi
echo ""

# Step 8: Test CR1000 connection
echo "Step 8: Testing CR1000 Connection"
echo "-----------------------------------"
if [ -n "$USB_DEVICES" ] && [ -f "$HOME/TSIM/cr1000_service.py" ]; then
    FIRST_DEV=$(echo $USB_DEVICES | awk '{print $1}')
    export CR1000_SERIAL_PORT=${CR1000_SERIAL_PORT:-$FIRST_DEV}
    export CR1000_BAUD=${CR1000_BAUD:-9600}
    
    echo "Attempting to connect to CR1000 at $CR1000_SERIAL_PORT ($CR1000_BAUD baud)..."
    
    python3 <<PYTHON_EOF
import sys
import os
sys.path.insert(0, os.path.expanduser('~/TSIM'))

try:
    from cr1000_service import CR1000Client
    print("  → CR1000Client imported successfully")
    
    try:
        client = CR1000Client()
        print("  → CR1000Client initialized successfully")
        
        # Try to read latest data
        print("  → Attempting to read latest data...")
        latest = client.latest()
        if latest:
            print("  → SUCCESS: Received data from CR1000")
            print(f"  → Sample fields: {list(latest.keys())[:5]}...")
        else:
            print("  → WARNING: No data returned (may be normal if logger is idle)")
            print("  → Trying range query (last 15 minutes)...")
            try:
                rows = client.range(15)
                if rows:
                    print(f"  → SUCCESS: Retrieved {len(rows)} records from last 15 minutes")
                    print(f"  → Latest record fields: {list(rows[-1].keys())[:5]}...")
                else:
                    print("  → WARNING: No records in last 15 minutes")
            except Exception as e2:
                print(f"  → ERROR in range query: {e2}")
    except Exception as e:
        print(f"  → ERROR initializing CR1000Client: {e}")
        print(f"  → Error type: {type(e).__name__}")
        import traceback
        print("  → Traceback:")
        for line in traceback.format_exc().split('\n'):
            if line.strip():
                print(f"    {line}")
        sys.exit(1)
except ImportError as e:
    print(f"  → ERROR importing CR1000Client: {e}")
    sys.exit(1)
PYTHON_EOF
    
    if [ $? -eq 0 ]; then
        print_status "CR1000 connection test PASSED"
    else
        print_error "CR1000 connection test FAILED"
    fi
else
    print_warning "Skipping (missing USB device or cr1000_service.py)"
fi
echo ""

# Step 9: Check backend logs
echo "Step 9: Checking Backend Logs"
echo "-----------------------------------"
if [ -f "$HOME/TSIM/logs/backend.log" ]; then
    print_status "Backend log found"
    echo "  → Recent CR1000-related messages:"
    tail -n 200 ~/TSIM/logs/backend.log | grep -i cr1000 -A2 -B2 | tail -n 20 || echo "    (no CR1000 messages found)"
else
    print_warning "Backend log not found at ~/TSIM/logs/backend.log"
fi
echo ""

# Step 10: Check API endpoint
echo "Step 10: Testing API Endpoint"
echo "-----------------------------------"
if pgrep -f "uvicorn.*complete_backend" > /dev/null; then
    print_status "Backend is running"
    echo "  → Testing /api/weather/latest endpoint..."
    API_RESPONSE=$(curl -s http://localhost:8002/api/weather/latest 2>/dev/null || echo "")
    if [ -n "$API_RESPONSE" ]; then
        echo "  → Response received:"
        echo "$API_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$API_RESPONSE"
    else
        print_error "No response from API endpoint"
    fi
else
    print_warning "Backend is NOT running"
    echo "  → Start it with: cd ~/TSIM && ./start_tsim_complete.sh"
fi
echo ""

# Summary
echo "=========================================="
echo "Troubleshooting Summary"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. If user is not in dialout group:"
echo "   sudo usermod -aG dialout $CURRENT_USER"
echo "   (then logout/login or reboot)"
echo ""
echo "2. If CR1000_SERIAL_PORT is not set:"
if [ -n "$USB_DEVICES" ]; then
    FIRST_DEV=$(echo $USB_DEVICES | awk '{print $1}')
    echo "   export CR1000_SERIAL_PORT=$FIRST_DEV"
    echo "   export CR1000_BAUD=9600"
fi
echo ""
echo "3. If backend is not running:"
echo "   cd ~/TSIM && ./start_tsim_complete.sh"
echo ""
echo "4. To test weather station manually:"
echo "   cd ~/TSIM"
echo "   source venv/bin/activate"
echo "   export CR1000_SERIAL_PORT=$FIRST_DEV"
echo "   export CR1000_BAUD=9600"
echo "   python3 -c \"from cr1000_service import CR1000Client; c=CR1000Client(); print(c.latest())\""
echo ""
echo "=========================================="

