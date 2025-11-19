#!/usr/bin/env python3
"""
Test script to verify ESP32 gateway connection
Run this when connected to ESP32_AP WiFi network
"""

import socket
import time

def test_esp32_connection():
    """Test TCP connection to ESP32 gateway"""
    esp32_ip = "192.168.4.1"
    esp32_port = 9000
    
    print(f"Testing connection to ESP32 at {esp32_ip}:{esp32_port}")
    
    try:
        # Create socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        
        # Try to connect
        result = sock.connect_ex((esp32_ip, esp32_port))
        
        if result == 0:
            print("✅ SUCCESS: Connected to ESP32 gateway!")
            
            # Test sending a command
            test_command = "a"  # OFF command for switch 1
            sock.send(test_command.encode('utf-8'))
            print(f"✅ Sent test command: '{test_command}'")
            
            # Wait a bit
            time.sleep(0.5)
            
            # Send another command
            test_command = "b"  # ON command for switch 1
            sock.send(test_command.encode('utf-8'))
            print(f"✅ Sent test command: '{test_command}'")
            
            sock.close()
            return True
        else:
            print(f"❌ FAILED: Could not connect to ESP32 gateway (error code: {result})")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False
    finally:
        try:
            sock.close()
        except:
            pass

def test_available_switches():
    """Test all available switch commands"""
    esp32_ip = "192.168.4.1"
    esp32_port = 9000
    
    # Command mapping for first 18 switches
    commands = [
        ("a", "b"), ("c", "d"), ("e", "f"), ("g", "h"), ("i", "j"),
        ("k", "l"), ("m", "n"), ("o", "p"), ("q", "r"), ("s", "t"),
        ("u", "v"), ("w", "x"), ("y", "z"), ("A", "B"), ("C", "D"),
        ("E", "F"), ("G", "H"), ("I", "J")
    ]
    
    print(f"\nTesting all available switch commands...")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((esp32_ip, esp32_port))
        
        for i, (off_cmd, on_cmd) in enumerate(commands, 1):
            print(f"Switch {i}: OFF='{off_cmd}', ON='{on_cmd}'")
            sock.send(off_cmd.encode('utf-8'))
            time.sleep(0.2)
            sock.send(on_cmd.encode('utf-8'))
            time.sleep(0.2)
        
        sock.close()
        print("✅ All switch commands sent successfully!")
        return True
        
    except Exception as e:
        print(f"❌ ERROR testing switches: {str(e)}")
        return False

if __name__ == "__main__":
    print("ESP32 Gateway Connection Test")
    print("=" * 40)
    
    # Test basic connection
    if test_esp32_connection():
        print("\n" + "=" * 40)
        # Test all switches
        test_available_switches()
    
    print("\n" + "=" * 40)
    print("Test completed!")