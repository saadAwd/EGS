# TSIM Expert Fixes Validation Script

## Quick Start

Run the validation script to test all expert-recommended fixes:

```bash
cd /path/to/tsim_production
./scripts/validate_expert_fixes.sh
```

The script will:
1. Check environment baseline (workers, DB, gateway, serial port)
2. Test gateway connectivity and command path
3. Verify zone deactivation ordering
4. Check weather worker single owner and freshness
5. Verify logging visibility
6. Analyze command success rate

## Output

The script produces:
- **Console output**: Real-time test results with color coding
- **Report file**: `validation_report_YYYYMMDD_HHMMSS.txt` with detailed results

## Manual Tests Required

Some tests require manual interaction via the UI:

### Gateway Resilience Test
1. Power off ESP32 for ~20s while clicking a control once
2. Power on ESP32
3. Confirm queued command executes

### Zone Deactivation Test
1. Activate a known zone (e.g., Zone A)
2. Deactivate immediately
3. Check logs for correct sequence:
   - `deactivationInProgress=1`
   - OFF commands sent
   - ACK received
   - `sync_state` cleared (after OFF)
   - `deactivationInProgress=0`
   - No assertion loop actions during deactivation

### Multi-User Consistency Test
1. Open 3-5 browsers on the same dashboard
2. Perform: activate zone, toggle lamps, deactivate
3. Verify all clients show same state within 2s

## Configuration

Set environment variables before running if needed:

```bash
export BACKEND_URL="http://localhost:8000"
export TSIM_DB_PATH="tsim.db"
export TSIM_LOG_DIR="./logs"
export GATEWAY_IP="192.168.4.1"
export GATEWAY_PORT="9000"
```

## Troubleshooting

### Script fails with "command not found"
- Ensure you're in the correct directory
- Check that `sqlite3`, `curl`, `grep` are installed
- On macOS, install sqlite3: `brew install sqlite`

### Gateway not reachable
- Verify ESP32 is powered on
- Check WiFi connection to ESP32_AP network
- Verify IP address: `ping 192.168.4.1`

### Weather worker not running
- Check lock file: `cat /tmp/tsim_weather.lock`
- Verify serial port: `ls -l /dev/ttyUSB*`
- Check user in dialout group: `groups | grep dialout`

## Post-Deployment Monitoring

After deployment, monitor these metrics:

```bash
# Command success rate
grep -E "ACK K|ack_failed" logs/backend_error.log | tail -n 200

# Deactivation sequence
grep -E "deactivation start|OFF sent|ACK K|sync_state cleared" logs/backend_error.log

# Weather cadence
grep -E "WEATHER: poll ok|WEATHER: error" logs/backend_error.log | tail -n 200
```

## Expected Results

- **Gunicorn Workers**: Exactly 1
- **Database WAL Mode**: `wal`
- **Gateway Reachability**: Connected
- **Command Success Rate**: ≥99%
- **Weather Updates**: Every ~60s
- **Deactivation Order**: OFF sent before sync_state cleared

