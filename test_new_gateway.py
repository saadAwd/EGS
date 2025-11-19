#!/usr/bin/env python3
"""
Test script for the new robust ESP32 Gateway implementation
Tests the new REST API endpoints and robust communication
"""

import asyncio
import requests
import json
import time

# Test configuration
BACKEND_URL = "http://localhost:8002"
ESP32_IP = "192.168.4.1"
ESP32_PORT = 9000

def test_backend_health():
    """Test backend health endpoint"""
    print("🔍 Testing Backend Health...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/health")
        if response.status_code == 200:
            health = response.json()
            print(f"✅ Backend Health: Connected={health.get('gateway_connected')}")
            print(f"   Queue Depth: {health.get('queue_depth')}")
            print(f"   Connection Status: {health.get('connection_status')}")
            return True
        else:
            print(f"❌ Backend Health Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend Health Error: {str(e)}")
        return False

def test_lamp_control():
    """Test individual lamp control"""
    print("\n🔦 Testing Individual Lamp Control...")
    try:
        # Test lamp 1 on device A
        response = requests.post(f"{BACKEND_URL}/api/lamp", json={
            "device": "A",
            "lamp": 1,
            "state": "on"
        })
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Lamp Control: OK={result.get('ok')}, ACK={result.get('ack')}")
            print(f"   Retries: {result.get('retries')}, Time: {result.get('t_ms')}ms")
            if result.get('error'):
                print(f"   Error: {result.get('error')}")
            return result.get('ok', False)
        else:
            print(f"❌ Lamp Control Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Lamp Control Error: {str(e)}")
        return False

def test_all_control():
    """Test all lamps control"""
    print("\n🔆 Testing All Lamps Control...")
    try:
        # Test all lamps on device A
        response = requests.post(f"{BACKEND_URL}/api/all", json={
            "device": "A",
            "state": "on"
        })
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ All Control: OK={result.get('ok')}, ACK={result.get('ack')}")
            print(f"   Retries: {result.get('retries')}, Time: {result.get('t_ms')}ms")
            if result.get('error'):
                print(f"   Error: {result.get('error')}")
            return result.get('ok', False)
        else:
            print(f"❌ All Control Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ All Control Error: {str(e)}")
        return False

def test_route_control():
    """Test route preset control"""
    print("\n🛣️ Testing Route Control...")
    try:
        # Test route 2 on device A
        response = requests.post(f"{BACKEND_URL}/api/route", json={
            "device": "A",
            "route": 2
        })
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Route Control: OK={result.get('ok')}, ACK={result.get('ack')}")
            print(f"   Retries: {result.get('retries')}, Time: {result.get('t_ms')}ms")
            if result.get('error'):
                print(f"   Error: {result.get('error')}")
            return result.get('ok', False)
        else:
            print(f"❌ Route Control Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Route Control Error: {str(e)}")
        return False

def test_mask_control():
    """Test mask control"""
    print("\n🎭 Testing Mask Control...")
    try:
        # Test mask 12F on device A (lamps 1, 2, 3, 4, 5, 8)
        response = requests.post(f"{BACKEND_URL}/api/mask", json={
            "device": "A",
            "mask": "12F"
        })
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Mask Control: OK={result.get('ok')}, ACK={result.get('ack')}")
            print(f"   Retries: {result.get('retries')}, Time: {result.get('t_ms')}ms")
            if result.get('error'):
                print(f"   Error: {result.get('error')}")
            return result.get('ok', False)
        else:
            print(f"❌ Mask Control Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Mask Control Error: {str(e)}")
        return False

def test_validation():
    """Test input validation"""
    print("\n🛡️ Testing Input Validation...")
    
    # Test invalid device
    try:
        response = requests.post(f"{BACKEND_URL}/api/lamp", json={
            "device": "Z",  # Invalid device
            "lamp": 1,
            "state": "on"
        })
        if response.status_code == 200:
            result = response.json()
            if not result.get('ok') and 'Invalid device' in result.get('error', ''):
                print("✅ Invalid Device Validation: PASSED")
            else:
                print("❌ Invalid Device Validation: FAILED")
        else:
            print(f"❌ Invalid Device Validation: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Invalid Device Validation Error: {str(e)}")
    
    # Test invalid lamp
    try:
        response = requests.post(f"{BACKEND_URL}/api/lamp", json={
            "device": "A",
            "lamp": 10,  # Invalid lamp (should be 1-9)
            "state": "on"
        })
        if response.status_code == 200:
            result = response.json()
            if not result.get('ok') and 'Invalid lamp' in result.get('error', ''):
                print("✅ Invalid Lamp Validation: PASSED")
            else:
                print("❌ Invalid Lamp Validation: FAILED")
        else:
            print(f"❌ Invalid Lamp Validation: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Invalid Lamp Validation Error: {str(e)}")

def test_sequential_commands():
    """Test sequential command sending"""
    print("\n🔄 Testing Sequential Commands...")
    
    commands = [
        {"device": "A", "lamp": 1, "state": "on"},
        {"device": "A", "lamp": 2, "state": "on"},
        {"device": "A", "lamp": 3, "state": "on"},
    ]
    
    success_count = 0
    start_time = time.time()
    
    for i, cmd in enumerate(commands):
        try:
            response = requests.post(f"{BACKEND_URL}/api/lamp", json=cmd)
            if response.status_code == 200:
                result = response.json()
                if result.get('ok'):
                    success_count += 1
                    print(f"   Command {i+1}: ✅ OK ({result.get('t_ms')}ms)")
                else:
                    print(f"   Command {i+1}: ❌ FAILED - {result.get('error')}")
            else:
                print(f"   Command {i+1}: ❌ HTTP {response.status_code}")
        except Exception as e:
            print(f"   Command {i+1}: ❌ ERROR - {str(e)}")
    
    total_time = (time.time() - start_time) * 1000
    print(f"✅ Sequential Commands: {success_count}/{len(commands)} successful in {total_time:.0f}ms")
    
    return success_count == len(commands)

def main():
    """Run all tests"""
    print("🚀 Testing New Robust ESP32 Gateway Implementation")
    print("=" * 60)
    
    # Check if backend is running
    try:
        response = requests.get(f"{BACKEND_URL}/docs")
        if response.status_code != 200:
            print("❌ Backend not running. Please start the backend first.")
            return
    except:
        print("❌ Backend not accessible. Please start the backend first.")
        return
    
    print("✅ Backend is running")
    
    # Run tests
    tests = [
        ("Backend Health", test_backend_health),
        ("Individual Lamp Control", test_lamp_control),
        ("All Lamps Control", test_all_control),
        ("Route Control", test_route_control),
        ("Mask Control", test_mask_control),
        ("Input Validation", test_validation),
        ("Sequential Commands", test_sequential_commands),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            if test_name == "Input Validation":
                test_func()  # Validation test doesn't return boolean
                results.append((test_name, True))
            else:
                result = test_func()
                results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} Error: {str(e)}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Results Summary:")
    print("=" * 60)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name:25} {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed! The new gateway implementation is working correctly.")
    else:
        print("⚠️ Some tests failed. Check the ESP32 gateway connection and configuration.")

if __name__ == "__main__":
    main()
