"""
ESP32 Configuration
Set your ESP32 master device network settings here
"""

# ESP32 Master Device Network Configuration
ESP32_CONFIG = {
    # ESP32 IP Address - Will be discovered on Aramco_EES network
    "ip": None,  # Will be auto-discovered
    
    # RemoteXY Server Port (from your ESP32 code)
    "port": 6377,
    
    # WiFi Network Settings (from your ESP32 code)
    "wifi_ssid": "Aramco_EES",
    "wifi_password": "22882288",
    
    # Connection Settings
    "timeout": 5,           # HTTP request timeout in seconds
    "retry_attempts": 3,    # Number of retry attempts
    "retry_delay": 1,       # Delay between retries in seconds
}

# Traffic Light Device Mapping
# Maps your database device names to ESP32 RemoteXY switches
TRAFFIC_LIGHT_MAPPING = {
    'TL1': 'pushSwitch_01',   # Traffic Light 1 -> Switch 1
    'TL2': 'pushSwitch_02',   # Traffic Light 2 -> Switch 2
    'TL3': 'pushSwitch_03',   # Traffic Light 3 -> Switch 3
    'TL4': 'pushSwitch_04',   # Traffic Light 4 -> Switch 4
    'TL5': 'pushSwitch_05',   # Traffic Light 5 -> Switch 5
    'TL6': 'pushSwitch_06',   # Traffic Light 6 -> Switch 6
    'TL7': 'pushSwitch_07',   # Traffic Light 7 -> Switch 7
    'TL8': 'pushSwitch_08',   # Traffic Light 8 -> Switch 8
    'TL9': 'pushSwitch_09',   # Traffic Light 9 -> Switch 9
    'TL10': 'pushSwitch_10',  # Traffic Light 10 -> Switch 10
    'TL11': 'pushSwitch_11',  # Traffic Light 11 -> Switch 11
    'TL12': 'pushSwitch_12',  # Traffic Light 12 -> Switch 12
    'TL13': 'pushSwitch_13',  # Traffic Light 13 -> Switch 13
    'TL14': 'pushSwitch_14',  # Traffic Light 14 -> Switch 14
    # Add more traffic lights as needed (up to 30 switches)
}

# Command Protocol Documentation
COMMAND_PROTOCOL = {
    "description": "ESP32 sends serial commands to field devices based on RemoteXY switch states",
    "switch_01": {"off_command": "a", "on_command": "b", "device": "TL1"},
    "switch_02": {"off_command": "c", "on_command": "d", "device": "TL2"},
    "switch_03": {"off_command": "e", "on_command": "f", "device": "TL3"},
    "switch_04": {"off_command": "g", "on_command": "h", "device": "TL4"},
    "switch_05": {"off_command": "i", "on_command": "j", "device": "TL5"},
    "switch_06": {"off_command": "k", "on_command": "l", "device": "TL6"},
    "switch_07": {"off_command": "m", "on_command": "n", "device": "TL7"},
    "switch_08": {"off_command": "o", "on_command": "p", "device": "TL8"},
    "switch_09": {"off_command": "q", "on_command": "r", "device": "TL9"},
    "switch_10": {"off_command": "s", "on_command": "t", "device": "TL10"},
    "switch_11": {"off_command": "u", "on_command": "v", "device": "TL11"},
    "switch_12": {"off_command": "w", "on_command": "x", "device": "TL12"},
    "switch_13": {"off_command": "y", "on_command": "z", "device": "TL13"},
    "switch_14": {"off_command": "A", "on_command": "B", "device": "TL14"},
    # Extended per lamp maps (physically installed up to 18)
    "switch_15": {"off_command": "C", "on_command": "D", "device": "L15"},
    "switch_16": {"off_command": "E", "on_command": "F", "device": "L16"},
    "switch_17": {"off_command": "G", "on_command": "H", "device": "L17"},
    "switch_18": {"off_command": "I", "on_command": "J", "device": "L18"},
    # Add more as needed...
}

def get_esp32_ip() -> str:
    """Get ESP32 IP address from config"""
    return ESP32_CONFIG["ip"]

def get_esp32_port() -> int:
    """Get ESP32 port from config"""
    return ESP32_CONFIG["port"]

def get_device_mapping() -> dict:
    """Get traffic light to switch mapping"""
    return TRAFFIC_LIGHT_MAPPING

# Instructions for setup
SETUP_INSTRUCTIONS = """
ESP32 RemoteXY Setup Instructions:

Your ESP32 is already configured with:
- WiFi SSID: "Aramco_EES"
- WiFi Password: "22882288"
- RemoteXY Server Port: 6377

Setup Steps:
1. Ensure your Python backend computer is connected to "Aramco_EES" WiFi network
2. Power on your ESP32 master device
3. ESP32 will automatically connect to "Aramco_EES" and start RemoteXY server
4. Python backend will auto-discover ESP32 IP address on startup
5. Test connection using the /api/esp32/status endpoint

Network Requirements:
- Both ESP32 and Python backend on "Aramco_EES" network
- Port 6377 should be accessible (no firewall blocking)

Manual IP Discovery:
- Check your router's DHCP client list for ESP32 device
- Use network scanner app to find devices on port 6377
- ESP32 serial monitor will show assigned IP address

RemoteXY Interface:
- Access web interface: http://ESP32_IP:6377
- Control switches manually for testing
- Monitor switch states and responses

Command Protocol:
- Web App → Python Backend → ESP32 RemoteXY → Serial Commands → Field Devices
- Each pushSwitch_XX controls specific traffic light via serial commands
- Switch ON/OFF states trigger corresponding serial characters (a/b, c/d, etc.)
"""
