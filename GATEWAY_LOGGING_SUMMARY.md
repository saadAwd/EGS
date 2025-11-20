# Gateway Command Logging Summary

## ✅ Yes, Gateway Commands Are Logged

### Log Files

1. **`logs/gateway_commands.log`** (Dedicated Gateway Command Log)
   - **Size**: 139KB (2,314 lines)
   - **Format**: Structured format for easy parsing
   - **Rotation**: 10MB max, keeps 5 backups
   - **Location**: `./logs/gateway_commands.log` (or `$TSIM_LOG_DIR/gateway_commands.log`)

2. **`logs/backend_error.log`** (Gunicorn Error Log)
   - **Contains**: All gateway logs (via stderr)
   - **Format**: Standard Python logging format
   - **Location**: `./logs/backend_error.log`

### Logged Events

The following gateway events are logged:

1. **CONN_ESTABLISHED**
   - When TCP connection to ESP32 gateway is established
   - Format: `CONN_ESTABLISHED | 192.168.4.1:9000`

2. **CMD_SEND**
   - When a command frame is sent to the gateway
   - Format: `CMD_SEND | {frame} | attempt={N} | bytes={N}`
   - Example: `CMD_SEND | Ah | attempt=1 | bytes=2`

3. **ACK_RECV**
   - When ACK 'K' is received from field device
   - Format: `ACK_RECV | {frame} | confirmed | wait_ms={N}`
   - Example: `ACK_RECV | Ah | confirmed | wait_ms=410`

4. **ACK_TIMEOUT**
   - When ACK timeout occurs (device not responding)
   - Format: `ACK_TIMEOUT | {frame} | timeout_ms={N}`
   - Example: `ACK_TIMEOUT | Ag | timeout_ms=2000`

5. **CMD_ERROR**
   - When send error occurs
   - Format: `CMD_ERROR | {frame} | error={error_message}`
   - Example: `CMD_ERROR | Ah | error=Connection reset`

### Log Format

**gateway_commands.log** (Structured Format):
```
YYYY-MM-DD HH:MM:SS.%f | LEVEL | EVENT | frame | details
```

**Examples**:
```
2025-11-17 14:58:41.123 | INFO | CMD_SEND | Ah | attempt=1 | bytes=2
2025-11-17 14:58:41.533 | INFO | ACK_RECV | Ah | confirmed | wait_ms=410
2025-11-17 14:58:42.456 | WARNING | ACK_TIMEOUT | Ag | timeout_ms=2000
2025-11-17 14:58:43.789 | ERROR | CMD_ERROR | Bh | error=Connection reset
```

**backend_error.log** (Standard Format):
```
2025-11-17 14:58:41 - gateway_service - INFO - SENT FRAME: Ah (attempt 1) - 2 bytes in single write
2025-11-17 14:58:41 - gateway_service - INFO - RECEIVED ACK: Ah - Field device confirmed
2025-11-17 14:58:42 - gateway_service - WARNING - ACK TIMEOUT: Ag - Field device not responding
```

### Configuration

**File**: `gateway_service.py`
- **Lines 14-36**: Logging configuration
- **Dedicated Handler**: `RotatingFileHandler` for `gateway_commands.log`
- **Dual Output**: Logs to both file and stderr (captured by Gunicorn)
- **Structured Format**: Easy to parse for analysis

### What Gets Logged

✅ **Command Sending**:
- Frame string (e.g., "Ah", "Bj", "Ck")
- Attempt number
- Bytes sent

✅ **ACK Reception**:
- Frame string
- Wait time (milliseconds)
- Confirmation status

✅ **Timeouts**:
- Frame string
- Timeout duration (milliseconds)

✅ **Errors**:
- Frame string
- Error message
- Connection issues

✅ **Connection Events**:
- TCP connection establishment
- Connection failures

### Viewing Logs

**View gateway commands log**:
```bash
tail -f logs/gateway_commands.log
```

**View recent gateway commands**:
```bash
tail -50 logs/gateway_commands.log
```

**Search for specific commands**:
```bash
grep "CMD_SEND.*Ah" logs/gateway_commands.log
```

**View ACK timeouts**:
```bash
grep "ACK_TIMEOUT" logs/gateway_commands.log
```

**View in backend error log**:
```bash
grep -i "gateway\|SENT FRAME\|RECEIVED ACK" logs/backend_error.log | tail -50
```

### Log Analysis

The structured format makes it easy to:
- Track command success rates
- Identify problematic devices
- Monitor ACK response times
- Debug connection issues
- Analyze command patterns

### Recent Logs

From `logs/gateway_commands.log`:
- **Total entries**: 2,314 lines
- **Last entry**: November 17, 2025
- **Format**: Structured with timestamps
- **Events**: CMD_SEND, ACK_RECV, ACK_TIMEOUT

## ✅ Summary

**Gateway commands ARE logged** in two places:
1. ✅ **Dedicated log**: `logs/gateway_commands.log` (structured format)
2. ✅ **Backend log**: `logs/backend_error.log` (standard format)

**All command events are logged**:
- ✅ Command sending
- ✅ ACK reception
- ✅ Timeouts
- ✅ Errors
- ✅ Connection events

**Logging is properly configured** with:
- ✅ File rotation (10MB max, 5 backups)
- ✅ Structured format for parsing
- ✅ Dual output (file + stderr)

