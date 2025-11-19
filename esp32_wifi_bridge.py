"""
ESP32 WiFi Bridge - Interface between Web App and ESP32 Master via WiFi
Connects Python backend to ESP32 traffic light controller over WiFi
"""

import requests
import time
import json
from typing import Dict, Optional, List
import logging
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ESP32WiFiBridge:
    def __init__(self, esp32_ip: str = "192.168.1.100", port: int = 6377):
        """
        Initialize ESP32 WiFi Bridge
        
        Args:
            esp32_ip: ESP32 IP address on local network
            port: RemoteXY server port (6377 by default)
        """
        self.esp32_ip = esp32_ip
        self.port = port
        self.base_url = f"http://{esp32_ip}:{port}"
        self.is_connected = False
        
        # Traffic light switch mapping (based on your ESP32 RemoteXY code)
        # pushSwitch_01 -> TL1, pushSwitch_02 -> TL2, etc.
        self.switch_mapping = {
            'TL1': 'pushSwitch_01',   # Switch 1 -> commands 'a'/'b'
            'TL2': 'pushSwitch_02',   # Switch 2 -> commands 'c'/'d'  
            'TL3': 'pushSwitch_03',   # Switch 3 -> commands 'e'/'f'
            'TL4': 'pushSwitch_04',   # Switch 4 -> commands 'g'/'h'
            'TL5': 'pushSwitch_05',   # Switch 5 -> commands 'i'/'j'
            'TL6': 'pushSwitch_06',   # Switch 6 -> commands 'k'/'l'
            'TL7': 'pushSwitch_07',   # Switch 7 -> commands 'm'/'n'
            'TL8': 'pushSwitch_08',   # Switch 8 -> commands 'o'/'p'
            'TL9': 'pushSwitch_09',   # Switch 9 -> commands 'q'/'r'
            'TL10': 'pushSwitch_10',  # Switch 10 -> commands 's'/'t'
            'TL11': 'pushSwitch_11',  # Switch 11 -> commands 'u'/'v'
            'TL12': 'pushSwitch_12',  # Switch 12 -> commands 'w'/'x'
            'TL13': 'pushSwitch_13',  # Switch 13 -> commands 'y'/'z'
            'TL14': 'pushSwitch_14',  # Switch 14 -> commands 'A'/'B'
            'TL15': 'pushSwitch_15',  # Switch 15 -> commands 'C'/'D'
            'TL16': 'pushSwitch_16',  # Switch 16 -> commands 'E'/'F'
            'TL17': 'pushSwitch_17',  # Switch 17 -> commands 'G'/'H'
            'TL18': 'pushSwitch_18',  # Switch 18 -> commands 'I'/'J'
            # Add more as needed up to pushSwitch_30
        }
        
        # Current device states
        self.device_states: Dict[str, bool] = {}
        
        # Session for HTTP requests
        self.session = requests.Session()
        self.session.timeout = 5  # 5 second timeout
    
    async def test_connection(self) -> bool:
        """Async wrapper around synchronous connection test using requests."""
        return await asyncio.to_thread(self.test_connection_sync)
    
    def test_connection_sync(self) -> bool:
        """Synchronous version of connection test"""
        try:
            response = self.session.get(f"{self.base_url}/", timeout=3)
            if response.status_code == 200:
                self.is_connected = True
                logger.info(f"Connected to ESP32 at {self.esp32_ip}:{self.port}")
                return True
            else:
                logger.warning(f"ESP32 responded with status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Failed to connect to ESP32: {e}")
            self.is_connected = False
            return False
    
    def send_switch_command(self, device_id: str, is_on: bool) -> bool:
        """
        Send switch command to ESP32 via RemoteXY web interface
        
        Args:
            device_id: Traffic light ID (e.g., 'TL1', 'TL2')
            is_on: True for ON (GREEN), False for OFF (RED)
            
        Returns:
            bool: True if command sent successfully
        """
        if not self.is_connected:
            logger.error("Cannot send command - not connected to ESP32")
            return False
        
        # Get switch name from device ID
        switch_name = self.switch_mapping.get(device_id)
        if not switch_name:
            logger.error(f"Unknown device ID: {device_id}")
            return False
        
        try:
            # RemoteXY uses HTTP GET with parameters to control switches
            # Format: GET /?pushSwitch_01=1 or /?pushSwitch_01=0
            switch_value = 1 if is_on else 0
            
            response = self.session.get(
                f"{self.base_url}/?{switch_name}={switch_value}",
                timeout=3
            )
            
            if response.status_code == 200:
                # Update local state
                self.device_states[device_id] = is_on
                logger.info(f"Set {device_id} ({switch_name}) to {'ON' if is_on else 'OFF'} via RemoteXY")
                return True
            else:
                logger.error(f"ESP32 RemoteXY returned error: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send command to ESP32 RemoteXY: {e}")
            return False
    
    def send_multiple_commands(self, commands: Dict[str, bool]) -> bool:
        """
        Send multiple switch commands to RemoteXY
        
        Args:
            commands: Dictionary of {device_id: is_on} mappings
            
        Returns:
            bool: True if all commands sent successfully
        """
        if not self.is_connected:
            logger.error("Cannot send commands - not connected to ESP32")
            return False
        
        try:
            # Build URL parameters for all switches
            params = []
            valid_commands = 0
            
            for device_id, is_on in commands.items():
                switch_name = self.switch_mapping.get(device_id)
                if switch_name:
                    switch_value = 1 if is_on else 0
                    params.append(f"{switch_name}={switch_value}")
                    valid_commands += 1
            
            if not params:
                logger.error("No valid device IDs found in commands")
                return False
            
            # Send all commands in one GET request
            # Format: GET /?pushSwitch_01=1&pushSwitch_02=0&pushSwitch_03=1
            url = f"{self.base_url}/?{'&'.join(params)}"
            
            response = self.session.get(url, timeout=5)
            
            if response.status_code == 200:
                # Update local states
                for device_id, is_on in commands.items():
                    self.device_states[device_id] = is_on
                
                logger.info(f"Sent {valid_commands} commands to ESP32 RemoteXY")
                return True
            else:
                logger.error(f"ESP32 RemoteXY returned error: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send commands to ESP32 RemoteXY: {e}")
            return False
    
    def get_esp32_status(self) -> Optional[Dict]:
        """
        Get current status from ESP32 RemoteXY
        
        Returns:
            dict: ESP32 status including switch states, or None if failed
        """
        if not self.is_connected:
            return None
        
        try:
            # RemoteXY main page contains current switch states
            response = self.session.get(f"{self.base_url}/", timeout=3)
            if response.status_code == 200:
                # Parse HTML to extract switch states (basic implementation)
                content = response.text
                
                status_data = {
                    "connected": True,
                    "server": "RemoteXY",
                    "switches": {},
                    "content_length": len(content)
                }
                
                # Try to extract switch states from HTML content
                # This is a simplified parser - RemoteXY HTML structure may vary
                for device_id, switch_name in self.switch_mapping.items():
                    if switch_name in content:
                        # Look for switch state indicators in HTML
                        # This is basic - you may need to adjust based on actual HTML
                        status_data["switches"][switch_name] = self.device_states.get(device_id, False)
                
                logger.debug(f"ESP32 RemoteXY status: {status_data}")
                return status_data
            else:
                logger.error(f"Failed to get ESP32 status: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error getting ESP32 status: {e}")
            return None
    
    def send_zone_activation(self, zone_config: Dict[str, bool]) -> bool:
        """
        Send zone activation commands to ESP32
        
        Args:
            zone_config: Dictionary of {device_id: is_green} mappings
            
        Returns:
            bool: True if zone activation successful
        """
        logger.info(f"Activating zone with {len(zone_config)} traffic lights")
        
        # Send all commands at once for better performance
        success = self.send_multiple_commands(zone_config)
        
        if success:
            logger.info("Zone activation successful")
        else:
            logger.error("Zone activation failed")
        
        return success
    
    def get_device_status(self, device_id: str) -> Optional[bool]:
        """
        Get current state of a traffic light device
        
        Args:
            device_id: Traffic light ID
            
        Returns:
            bool: Current state (True=GREEN, False=RED) or None if unknown
        """
        return self.device_states.get(device_id)
    
    def get_all_device_states(self) -> Dict[str, bool]:
        """Get all current device states"""
        return self.device_states.copy()
    
    def disconnect(self):
        """Clean up connection"""
        if self.session:
            self.session.close()
        self.is_connected = False
        logger.info("Disconnected from ESP32")


# Global bridge instance
esp32_wifi_bridge = ESP32WiFiBridge()

async def discover_esp32_on_network() -> str:
    """
    Discover ESP32 on Aramco_EES network by scanning common IP ranges
    
    Returns:
        str: ESP32 IP address if found, None otherwise
    """
    import subprocess
    import re
    
    # Get current network info
    try:
        # Try to get network interface and subnet
        result = subprocess.run(['ip', 'route', 'show', 'default'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Extract gateway IP to determine subnet
            gateway_match = re.search(r'via (\d+\.\d+\.\d+\.\d+)', result.stdout)
            if gateway_match:
                gateway_ip = gateway_match.group(1)
                # Assume /24 subnet
                base_ip = '.'.join(gateway_ip.split('.')[:-1]) + '.'
                logger.info(f"Scanning subnet {base_ip}0/24 for ESP32")
                
                # Common IP ranges for ESP32 on corporate networks
                ips_to_try = [
                    f"{base_ip}{i}" for i in range(100, 150)  # .100-.149
                ] + [
                    f"{base_ip}{i}" for i in range(200, 220)  # .200-.219
                ] + [
                    f"{base_ip}{i}" for i in range(50, 80)    # .50-.79
                ]
            else:
                # Fallback to common corporate network ranges
                ips_to_try = []
                for subnet in ['192.168.1.', '192.168.0.', '10.0.0.', '172.16.0.']:
                    ips_to_try.extend([f"{subnet}{i}" for i in range(100, 150)])
        else:
            # Fallback IP ranges
            ips_to_try = []
            for subnet in ['192.168.1.', '192.168.0.', '10.0.0.', '172.16.0.']:
                ips_to_try.extend([f"{subnet}{i}" for i in range(100, 150)])
                
    except Exception as e:
        logger.warning(f"Could not determine network subnet: {e}")
        # Use common corporate network IP ranges
        ips_to_try = []
        for subnet in ['192.168.1.', '192.168.0.', '10.0.0.', '172.16.0.']:
            ips_to_try.extend([f"{subnet}{i}" for i in range(100, 150)])
    
    # Test each IP for RemoteXY server on port 6377
    logger.info(f"Scanning {len(ips_to_try)} IP addresses for ESP32...")
    
    # Requests-based quick scan (sequential, short timeouts)
    for ip in ips_to_try:
        try:
            resp = requests.get(f"http://{ip}:6377/", timeout=1.5)
            if resp.status_code == 200 and ('RemoteXY' in resp.text or 'pushSwitch' in resp.text):
                logger.info(f"Found ESP32 RemoteXY server at {ip}:6377")
                return ip
        except Exception:
            continue
    
    logger.error("ESP32 not found on network")
    return None

async def initialize_esp32_wifi_bridge(esp32_ip: str = None) -> bool:
    """
    Initialize and connect to ESP32 via WiFi on Aramco_EES network
    
    Args:
        esp32_ip: ESP32 IP address (optional, will auto-discover if None)
        
    Returns:
        bool: True if initialization successful
    """
    global esp32_wifi_bridge
    
    target_ip = esp32_ip
    
    # If no IP provided, try to discover ESP32 on network
    if not target_ip:
        logger.info("Auto-discovering ESP32 on Aramco_EES network...")
        target_ip = await discover_esp32_on_network()
        
        if not target_ip:
            logger.error("Could not discover ESP32 on network")
            return False
    
    # Initialize bridge with discovered/provided IP
    try:
        esp32_wifi_bridge = ESP32WiFiBridge(target_ip)
        if await esp32_wifi_bridge.test_connection():
            logger.info(f"ESP32 WiFi bridge initialized at {target_ip}:6377")
            return True
        else:
            logger.error(f"Failed to connect to ESP32 at {target_ip}:6377")
            return False
    except Exception as e:
        logger.error(f"Error initializing ESP32 WiFi bridge: {e}")
        return False

def send_traffic_light_wifi_command(device_id: str, is_green: bool) -> bool:
    """
    Send traffic light command to ESP32 via WiFi
    
    Args:
        device_id: Traffic light ID (e.g., 'TL1')
        is_green: True for GREEN, False for RED
        
    Returns:
        bool: True if command sent successfully
    """
    global esp32_wifi_bridge
    
    if not esp32_wifi_bridge.is_connected:
        logger.error("ESP32 not connected via WiFi")
        return False
    
    return esp32_wifi_bridge.send_switch_command(device_id, is_green)

def send_zone_wifi_command(traffic_lights: Dict[str, bool]) -> bool:
    """
    Send zone activation commands to ESP32 via WiFi
    
    Args:
        traffic_lights: Dictionary of {device_id: is_green}
        
    Returns:
        bool: True if all commands sent successfully
    """
    global esp32_wifi_bridge
    
    if not esp32_wifi_bridge.is_connected:
        logger.error("ESP32 not connected via WiFi")
        return False
    
    return esp32_wifi_bridge.send_zone_activation(traffic_lights)

# Example usage and testing
if __name__ == "__main__":
    import asyncio
    
    async def test_wifi_bridge():
        # Initialize connection
        if await initialize_esp32_wifi_bridge():
            print("ESP32 WiFi bridge ready!")
            
            # Test individual commands
            send_traffic_light_wifi_command('TL1', True)   # TL1 GREEN
            await asyncio.sleep(1)
            send_traffic_light_wifi_command('TL1', False)  # TL1 RED
            await asyncio.sleep(1)
            send_traffic_light_wifi_command('TL2', True)   # TL2 GREEN
            
            # Test zone activation (multiple lights at once)
            zone_config = {
                'TL1': False,  # RED
                'TL2': True,   # GREEN
                'TL3': False,  # RED
                'TL4': True    # GREEN
            }
            send_zone_wifi_command(zone_config)
            
            # Get status
            status = esp32_wifi_bridge.get_esp32_status()
            print(f"ESP32 Status: {status}")
            
        else:
            print("Failed to initialize ESP32 WiFi bridge")
    
    # Run test
    asyncio.run(test_wifi_bridge())
