# ESP32 Gateway Protocol Update

## Overview

Updated the gateway service to match the latest ESP32 firmware protocol changes.

## ESP32 Firmware Changes

### 1. TCP Heartbeat Mechanism
- **Backend sends**: `'?'` (HEARTBEAT_Q)
- **ESP32 replies**: `'P'` (HEARTBEAT_A)
- **Important**: Heartbeat is TCP-only, NOT forwarded to LoRa
- **Purpose**: Keep TCP connection alive and verify gateway responsiveness

### 2. CR/LF Handling
- **ESP32 behavior**: CR/LF characters are ignored and NOT forwarded to LoRa
- **Backend impact**: No changes needed (we don't send CR/LF in commands)
- **Benefit**: TCP keepalive friendly, prevents accidental LoRa commands

### 3. Persistent Connection
- **ESP32 behavior**: Removed 5s idle disconnect - TCP session stays up until client leaves
- **Backend impact**: Connection now persists between commands
- **Benefit**: Faster command execution, no reconnection overhead

### 4. ACK Echo
- **ESP32 behavior**: Any byte from LoRa (e.g., 'K') is echoed to TCP client
- **Backend impact**: Already handled - we wait for 'K' ACK responses
- **Benefit**: Confirms field device received and processed command

## Gateway Service Updates

### Changes Made

1. **Added TCP Heartbeat Thread** (`_heartbeat_loop`):
   - Sends `'?'` every 30 seconds
   - Waits for `'P'` response (3 second timeout)
   - Updates `last_heartbeat` timestamp on success
   - Logs heartbeat activity for debugging

2. **Enhanced Socket Buffer Draining**:
   - Filters out heartbeat responses (`'P'`) during drain
   - Handles heartbeat responses gracefully during ACK wait
   - Prevents heartbeat responses from interfering with command ACKs

3. **ACK Handling**:
   - Already correctly handles `'K'` responses from LoRa (echoed by ESP32)
   - Now also filters out `'P'` heartbeat responses during ACK wait
   - Maintains backward compatibility with existing ACK logic

### Protocol Flow

```
Backend → ESP32 → LoRa → Field Device
   |        |       |          |
   |        |       |          |
   |        |       |    [Processes command]
   |        |       |          |
   |        |    [Sends 'K']  |
   |        |       |          |
   |    [Echoes 'K']|          |
   |        |       |          |
[Receives 'K']      |          |
   |        |       |          |
[ACK Confirmed]     |          |
```

**Heartbeat Flow (TCP-only, not forwarded to LoRa)**:
```
Backend → ESP32
   |        |
[Send '?']  |
   |        |
   |    [Reply 'P']
   |        |
[Receive 'P']
   |        |
[Connection OK]
```

## Configuration

### Heartbeat Parameters
- **Interval**: 30 seconds (configurable via `HEARTBEAT_INTERVAL`)
- **Timeout**: 3 seconds (configurable via `HEARTBEAT_TIMEOUT`)
- **Purpose**: Verify TCP connection is alive without affecting LoRa

### Connection Parameters
- **IP**: `192.168.4.1` (ESP32 AP mode)
- **Port**: `9000` (TCP server)
- **SSID**: `ESP32_AP`
- **Password**: `12345678`

### Command Protocol
- **Format**: Device letter (A-N) + command character
- **Examples**: 
  - `Ab` = Device A, lamp 1 ON
  - `A!` = Device A, all OFF
  - `A*` = Device A, all ON
  - `AR2` = Device A, route 2
  - `AM12F` = Device A, mask 0x12F

## Testing

1. **Heartbeat Test**:
   - Monitor logs for heartbeat messages every 30 seconds
   - Verify `last_heartbeat` timestamp updates
   - Check connection status remains "connected"

2. **Command Test**:
   - Send lamp command (e.g., `Ab`)
   - Verify `'K'` ACK is received
   - Confirm command succeeds

3. **Connection Persistence**:
   - Send multiple commands in sequence
   - Verify no reconnection between commands
   - Check connection stays open

## Files Modified

- `gateway_service.py`:
  - Added `_heartbeat_loop()` method
  - Enhanced `_drain_socket_buffer()` to filter heartbeat responses
  - Updated ACK handling to ignore heartbeat responses
  - Added heartbeat thread initialization

## Compatibility

- ✅ Backward compatible with existing command protocol
- ✅ Works with persistent TCP connections
- ✅ Handles both heartbeat and ACK responses correctly
- ✅ No changes needed to frontend or other components

## Notes

- Heartbeat is purely for TCP connection monitoring
- Heartbeat responses (`'P'`) are filtered out and don't affect command flow
- LoRa ACKs (`'K'`) are still the primary confirmation mechanism
- Connection persistence reduces latency and improves reliability

