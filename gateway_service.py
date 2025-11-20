import asyncio
import socket
import logging
import threading
import queue
import time
import sys
from typing import Dict, List, Optional, Callable
from datetime import datetime
from sqlalchemy.orm import Session
from models import Gateway as GatewayModel, Lamp, Pole
import json

# Configure logging - ensure messages go to stderr for Gunicorn to capture
import os
log_dir = os.getenv('TSIM_LOG_DIR', './logs')
os.makedirs(log_dir, exist_ok=True)

# Create dedicated file handler for gateway commands
from logging.handlers import RotatingFileHandler
gateway_file_handler = RotatingFileHandler(
    os.path.join(log_dir, 'gateway_commands.log'),
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)
gateway_file_handler.setLevel(logging.INFO)
gateway_file_formatter = logging.Formatter('%(asctime)s | %(levelname)s | %(message)s')
gateway_file_handler.setFormatter(gateway_file_formatter)

logging.basicConfig(
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stderr), gateway_file_handler],
    force=True,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Helper function for guaranteed log visibility (both print and logger)
def log_always(msg):
    """Log message that will always appear in Gunicorn error log"""
    # Write directly to stderr (captured by Gunicorn) and also use logger
    # Use logger.error() to ensure it appears in Gunicorn error log
    print(msg, file=sys.stderr, flush=True)
    logger.error(msg)  # Use error level to ensure visibility in Gunicorn error log

class ESP32GatewayService:
    def __init__(self, db: Session):
        self.db = db
        self.esp32_ip = "192.168.4.1"
        self.wifi_ssid = "ESP32_AP"
        self.tcp_port = 9000
        self.connection_status = "disconnected"
        self.last_heartbeat = None
        
        # New robust connection parameters
        self.ACK_TIMEOUT = 1.2  # 1200ms timeout (increased from 800ms per expert recommendation)
        self.RETRIES = 2
        self.INTER_FRAME_GAP = 0.025  # 25ms gap between commands
        # ACK mode enabled: ESP32 gateway now echoes 'K' from LoRa back to TCP client
        # Server will wait for 'K' acknowledgment from field device before considering success
        self.REQUIRE_ACK = True
        
        # Command queue and worker thread
        self.command_queue = queue.Queue()
        # Use re-entrant lock to avoid deadlocks when helper methods also lock
        self.socket_lock = threading.RLock()
        self.socket = None
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        log_always("GATEWAY: Command queue initialized")
        logger.info("Gateway worker thread started")
        
        # Zone assertion tracking (for critical zone activations only)
        # IMPORTANT: Only ONE zone can be active at a time
        self.active_zone = None  # {zone_name, wind_direction, commands, last_assert_time} or None
        self.zone_assertion_lock = threading.RLock()
        self.ASSERTION_INTERVAL = 15.0  # Re-assert every 15 seconds
        self.ASSERTION_RETRIES = 3  # Retry assertion 3 times
        self.ASSERTION_RETRY_DELAY = 5.0  # 5 second delay between retries
        self.ASSERTION_ENABLED = True
        self.assertion_cancel_epoch = 0  # bump to cancel in-flight cycles
        self.assertion_thread = threading.Thread(target=self._zone_assertion_loop, daemon=True)
        self.assertion_thread.start()
        logger.info("Zone assertion thread started (15s interval, single zone only)")
        
        # Device status tracking
        self.device_status = {}
        for device in 'ABCDEFGHIJKLMN':
            self.device_status[device] = {
                'last_ack_time': None,
                'last_command': None,
                'success_rate': 1.0,
                'total_commands': 0,
                'successful_commands': 0
            }
        
        # Lamp command mapping (as per specification)
        self.lamp_commands = {
            1: {"on": "b", "off": "a"},
            2: {"on": "d", "off": "c"},
            3: {"on": "f", "off": "e"},
            4: {"on": "h", "off": "g"},
            5: {"on": "j", "off": "i"},
            6: {"on": "l", "off": "k"},
            7: {"on": "n", "off": "m"},
            8: {"on": "p", "off": "o"},
            9: {"on": "r", "off": "q"}
        }
        
        # Command mapping for all system lamps (126 lamps total)
        self.command_mapping = {}
        for lamp_id in range(1, 127):  # Lamps 1-126
            pole_id = ((lamp_id - 1) // 9) + 1  # Pole 1-14
            lamp_position = ((lamp_id - 1) % 9) + 1  # Position 1-9 within pole
            device_letter = chr(ord('A') + pole_id - 1)  # Device A-N
            
            lamp_cmd = self.lamp_commands[lamp_position]
            
            self.command_mapping[lamp_id] = {
                "device": device_letter,
                "lamp": lamp_position,
                "pole": pole_id,
                "on": lamp_cmd["on"],
                "off": lamp_cmd["off"]
            }

    def _drain_socket_buffer(self):
        """Drain any stale bytes from socket buffer before sending new command"""
        try:
            with self.socket_lock:
                if self.socket:
                    # Set non-blocking mode temporarily
                    self.socket.setblocking(False)
                    try:
                        while True:
                            data = self.socket.recv(1024)
                            if not data:  # No more data available
                                break
                            logger.debug(f"Drained stale data: {data}")
                    except BlockingIOError:
                        # No more data available, this is expected
                        pass
                    except Exception as e:
                        logger.warning(f"Error draining socket: {e}")
                    finally:
                        # Restore blocking mode AND the ACK timeout
                        self.socket.setblocking(True)
                        self.socket.settimeout(self.ACK_TIMEOUT)
        except Exception as e:
            logger.warning(f"Failed to drain socket buffer: {e}")

    def _create_socket(self):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)  # Connection timeout
            sock.connect((self.esp32_ip, self.tcp_port))
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # Disable Nagle
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)  # Enable keepalive
            sock.settimeout(self.ACK_TIMEOUT)  # Set ACK timeout
            log_always(f"GATEWAY: Connected to ESP32 at {self.esp32_ip}:{self.tcp_port}")
            logger.info(f"Connected to ESP32 gateway: {self.esp32_ip}:{self.tcp_port}")
            # Also log to dedicated gateway commands log
            logger.info(f"CONN_ESTABLISHED | {self.esp32_ip}:{self.tcp_port}")
            return sock
        except Exception as e:
            logger.error(f"Failed to create socket: {str(e)}")
            return None

    def ensure_connected(self) -> bool:
        """Ensure TCP socket is established without using the queue/worker.
        Returns True if socket is ready, False otherwise.
        """
        try:
            with self.socket_lock:
                if self.socket is None:
                    self.socket = self._create_socket()
                if self.socket:
                    self.connection_status = "connected"
                    return True
                else:
                    self.connection_status = "disconnected"
                    return False
        except Exception as e:
            logger.error(f"ensure_connected error: {e}")
            self.connection_status = "disconnected"
            return False

    def is_connected(self) -> bool:
        """Lightweight check: do we have an open socket handle?"""
        with self.socket_lock:
            return self.socket is not None
    
    def clear_command_queue(self):
        """Clear all pending commands from the queue.
        
        CRITICAL: Used when switching zones to prevent old commands from executing
        after new zone activation. This ensures clean state transitions.
        """
        cleared_count = 0
        while not self.command_queue.empty():
            try:
                frame, callback = self.command_queue.get_nowait()
                # Call callback with failure to notify caller
                try:
                    callback(False, 0)
                except:
                    pass
                cleared_count += 1
            except queue.Empty:
                break
        
        if cleared_count > 0:
            logger.warning(f"Cleared {cleared_count} pending commands from queue")
        
        return cleared_count
    
    async def wait_for_zone_off(self, zone_name: str, wind_direction: str, timeout: float = 10.0) -> bool:
        """Wait for all lamps in a zone to be confirmed OFF (via ACK).
        
        SIMPLIFIED: Uses ACK confirmations to ensure old zone is really OFF.
        Returns True if all lamps confirmed OFF, False if timeout.
        This ensures old zone is fully deactivated before new activation.
        
        Args:
            zone_name: Zone name
            wind_direction: Wind direction
            timeout: Maximum time to wait (default 10s, reduced from 15s)
        
        Returns:
            True if all lamps confirmed OFF via ACK, False on timeout
        """
        zone_commands = None
        try:
            # Import here to avoid circular dependency
            from complete_backend import get_zone_activation_commands
            zone_commands = get_zone_activation_commands(zone_name, wind_direction)
        except Exception as e:
            logger.error(f"Failed to get zone commands for OFF verification: {e}")
            return False

        if not zone_commands:
            return True  # No commands means nothing to verify
        
        start_time = time.time()
        remaining_lamps = set(zone_commands.keys())
        
        logger.info(f"⏳ Waiting for zone {zone_name} {wind_direction} to be OFF ({len(remaining_lamps)} lamps, timeout={timeout}s)...")
        
        # Send OFF commands and wait for ACKs (ACK confirmation ensures real OFF state)
        deactivate_commands = {lamp_id: False for lamp_id in zone_commands.keys()}
        
        # First pass: send all OFF commands
        for lamp_id in list(remaining_lamps):
            try:
                success = await self.send_lamp_command(lamp_id, False)
                if success:  # ACK received = confirmed OFF
                    remaining_lamps.discard(lamp_id)
                    logger.debug(f"Confirmed lamp {lamp_id} is OFF (ACK received)")
            except Exception as e:
                logger.warning(f"Error sending OFF for lamp {lamp_id}: {e}")
        
        # Retry loop for remaining lamps (with ACK confirmation)
        retry_count = 0
        max_retries = 3
        while remaining_lamps and (time.time() - start_time) < timeout and retry_count < max_retries:
            retry_count += 1
            logger.info(f"Retry {retry_count}/{max_retries}: Waiting for {len(remaining_lamps)} lamps to ACK OFF...")
            
            # Re-send OFF for remaining lamps
            for lamp_id in list(remaining_lamps):
                try:
                    success = await self.send_lamp_command(lamp_id, False)
                    if success:  # ACK received = confirmed OFF
                        remaining_lamps.discard(lamp_id)
                        logger.info(f"✅ Confirmed lamp {lamp_id} is OFF (ACK received)")
                except Exception as e:
                    logger.warning(f"Retry OFF error for lamp {lamp_id}: {e}")
            
            if remaining_lamps:
                await asyncio.sleep(0.5)  # Brief pause between retries
        
        all_off = len(remaining_lamps) == 0
        if all_off:
            logger.info(f"✅ Zone {zone_name} {wind_direction} confirmed OFF ({len(zone_commands)} lamps, all ACKs received)")
        else:
            logger.warning(f"⚠️ Zone {zone_name} {wind_direction} timeout: {len(remaining_lamps)} lamps not confirmed OFF")
        
        return all_off

    def _worker_loop(self):
        """Main worker loop for processing commands - SINGLE COMMAND IN FLIGHT"""
        logger.info("Gateway worker loop is running")
        reconnect_delay = 0.05  # Start with 50ms
        
        while True:
            try:
                # Get next command from queue - ONLY ONE COMMAND IN FLIGHT
                frame, callback = self.command_queue.get()
                
                # Ensure we have a connection
                if self.socket is None:
                    while True:
                        try:
                            with self.socket_lock:
                                self.socket = self._create_socket()
                            if self.socket:
                                reconnect_delay = 0.05  # Reset delay on success
                                break
                        except Exception as e:
                            logger.error(f"Reconnection failed: {str(e)}")
                            time.sleep(reconnect_delay)
                            reconnect_delay = min(reconnect_delay * 2, 2.0)  # Exponential backoff, max 2s
                
                # CRITICAL: Ensure single-write framing
                if isinstance(frame, str):
                    frame_bytes = frame.encode('utf-8')
                    frame_str = frame
                else:
                    frame_bytes = frame
                    frame_str = frame.decode('utf-8')
                
                # Validate frame length (must be 2+ bytes for proper framing)
                if len(frame_bytes) < 2:
                    logger.error(f"Invalid frame length: {frame_str} (too short)")
                    callback(False, 0)
                    continue
                
                # RATE LIMITING: Enforce 1 cmd/sec maximum
                current_time = time.time()
                if hasattr(self, '_last_command_time'):
                    time_since_last = current_time - self._last_command_time
                    if time_since_last < 1.0:  # Less than 1 second
                        sleep_time = 1.0 - time_since_last
                        logger.info(f"Rate limiting: sleeping {sleep_time:.3f}s")
                        time.sleep(sleep_time)
                self._last_command_time = time.time()
                
                # Send command with retries - SINGLE WRITE PER FRAME
                success = False
                retries = 0
                
                for attempt in range(self.RETRIES + 1):
                    try:
                        with self.socket_lock:
                            if self.socket:
                                # CRITICAL: Drain any stale ACKs before sending
                                self._drain_socket_buffer()
                                
                                # CRITICAL: Send entire frame in ONE write operation
                                # This ensures no packet splitting over WiFi/LoRa
                                self.socket.sendall(frame_bytes)
                                logger.info(f"SENT FRAME: {frame_str} (attempt {attempt + 1}) - {len(frame_bytes)} bytes in single write")
                                # Also log to dedicated gateway commands log with structured format
                                logger.info(f"CMD_SEND | {frame_str} | attempt={attempt + 1} | bytes={len(frame_bytes)}")
                                
                                if not self.REQUIRE_ACK:
                                    # Fire-and-forget mode: consider send success
                                    success = True
                                    logger.info(f"SEND OK (no-ACK mode): {frame_str}")
                                    break
                                else:
                                    # CRITICAL: Loop reading until we get 'K' or timeout
                                    # This prevents false successes from stale ACKs
                                    ack_received = False
                                    start_ack_time = time.time()

                                    while time.time() - start_ack_time < self.ACK_TIMEOUT:
                                        try:
                                            ack = self.socket.recv(1)
                                            if ack == b'K':
                                                success = True
                                                ack_received = True
                                                wait_ms = int((time.time() - start_ack_time) * 1000)
                                                logger.info(f"RECEIVED ACK: {frame_str} - Field device confirmed")
                                                # Also log to dedicated gateway commands log with structured format
                                                logger.info(f"ACK_RECV | {frame_str} | confirmed | wait_ms={wait_ms}")
                                                break
                                            elif ack == b'':
                                                logger.warning(f"EMPTY RESPONSE: {frame_str} - Field device disconnected")
                                                break
                                            else:
                                                logger.debug(f"IGNORING JUNK BYTE: {ack} for {frame_str}")
                                        except socket.timeout:
                                            # Continue looping until overall timeout
                                            continue
                                        except Exception as e:
                                            logger.warning(f"ACK ERROR: {frame_str} - {e}")
                                            break

                                    if ack_received:
                                        break
                                    else:
                                        timeout_ms = int(self.ACK_TIMEOUT * 1000)
                                        logger.warning(f"ACK TIMEOUT: {frame_str} - Field device not responding")
                                        # Also log to dedicated gateway commands log with structured format
                                        logger.warning(f"ACK_TIMEOUT | {frame_str} | timeout_ms={timeout_ms}")

                    except Exception as e:
                        error_msg = str(e)
                        logger.error(f"SEND ERROR: {frame_str} - {error_msg}")
                        # Also log to dedicated gateway commands log with structured format
                        logger.error(f"CMD_ERROR | {frame_str} | error={error_msg}")
                        success = False
                        
                        # Handle specific error types
                        if "Broken pipe" in str(e) or "Connection reset" in str(e):
                            logger.warning(f"Connection lost for {frame_str}, forcing reconnection")
                        elif "Network is unreachable" in str(e):
                            logger.warning(f"Network unreachable for {frame_str}, check ESP32 WiFi connection")
                        
                        try:
                            with self.socket_lock:
                                if self.socket:
                                    self.socket.close()
                                    self.socket = None
                        except:
                            pass
                        time.sleep(0.1)  # Brief pause before retry
                    
                    retries += 1
                    if attempt < self.RETRIES:
                        time.sleep(0.1)  # Wait before retry
                
                # Update device status
                device = frame_str[0]
                if device in self.device_status:
                    self.device_status[device]['last_command'] = frame_str
                    self.device_status[device]['total_commands'] += 1
                    if success:
                        self.device_status[device]['last_ack_time'] = datetime.now()
                        self.device_status[device]['successful_commands'] += 1
                    
                    # Always recalculate success rate (fixes the bug)
                    self.device_status[device]['success_rate'] = (
                        self.device_status[device]['successful_commands'] / 
                        self.device_status[device]['total_commands']
                    )
                
                # Update connection status
                if success:
                    self.connection_status = "connected"
                    self.last_heartbeat = datetime.now()
                else:
                    # In no-ACK mode, a send failure doesn't necessarily mean link down
                    if not self.REQUIRE_ACK:
                        self.connection_status = "connected"
                    else:
                        self.connection_status = "disconnected"
                
                # Call callback with result
                callback(success, retries)
                
                # Inter-frame gap to prevent flooding (25ms minimum)
                time.sleep(max(self.INTER_FRAME_GAP, 0.025))
                
            except Exception as e:
                logger.error(f"Worker loop error: {str(e)}")
                time.sleep(0.1)

    def _is_valid_frame_format(self, frame_str: str) -> bool:
        """Enhanced frame validation with detailed logging"""
        if not frame_str:
            logger.error("Empty frame")
            return False
            
        if len(frame_str) < 2:
            logger.error(f"Frame too short: '{frame_str}' (length: {len(frame_str)})")
            return False
            
        if frame_str[0] not in 'ABCDEFGHIJKLMN':
            logger.error(f"Invalid device letter: '{frame_str[0]}' in '{frame_str}'")
            return False
            
        # Check command format
        if len(frame_str) == 2:
            # Simple commands: Ab, A*, A!
            if frame_str[1] not in 'abcdefghijklmnopqr!*':
                logger.error(f"Invalid 2-char command: '{frame_str[1]}' in '{frame_str}'")
                return False
        elif len(frame_str) == 3:
            # Route commands: AR2
            if frame_str[1] == 'R' and frame_str[2] in '0123456789':
                return True
            # Flashing commands: Ab# (device + lamp command + '#')
            elif frame_str[2] == '#' and frame_str[1] in 'abcdefghijklmnopqr':
                return True
            else:
                logger.error(f"Invalid 3-char command format: '{frame_str}'")
                return False
        elif len(frame_str) == 5:
            # Mask commands: AM12F
            if frame_str[1] == 'M':
                try:
                    mask_value = int(frame_str[2:], 16)
                    if mask_value > 0x1FF:  # 9-bit mask max
                        logger.error(f"Mask value too large: '{frame_str[2:]}' (0x{mask_value:X}) in '{frame_str}'")
                        return False
                    return True
                except ValueError:
                    logger.error(f"Invalid hex mask: '{frame_str[2:]}' in '{frame_str}'")
                    return False
            else:
                logger.error(f"Invalid 5-char command format: '{frame_str}'")
                return False
        else:
            logger.error(f"Invalid frame length: '{frame_str}' (length: {len(frame_str)})")
            return False

        return True

    async def send_command(self, frame: str) -> Dict:
        """Send a command frame and return result - SINGLE WRITE GUARANTEE"""
        result = {"ok": False, "retries": 0, "t_ms": 0, "error": None}
        start_time = time.time()
        
        # Enhanced frame validation with detailed logging
        if not self._is_valid_frame_format(frame):
            result["error"] = f"Invalid frame format: {frame}"
            return result
        
        # Create event for synchronization
        event = threading.Event()
        
        def callback(success, retries):
            result["ok"] = success
            result["retries"] = retries
            result["t_ms"] = int((time.time() - start_time) * 1000)
            event.set()
        
        # Queue the command - SINGLE COMMAND IN FLIGHT
        self.command_queue.put((frame, callback))
        
        # Wait for completion
        event.wait(timeout=5.0)  # 5 second overall timeout
        
        return result

    # New REST API Methods
    async def send_lamp_command_new(self, device: str, lamp: int, state: str) -> Dict:
        """Send individual lamp command"""
        if device not in 'ABCDEFGHIJKLMN':
            return {"ok": False, "error": "Invalid device", "retries": 0, "t_ms": 0}
        
        if lamp not in range(1, 10):
            return {"ok": False, "error": "Invalid lamp (1-9)", "retries": 0, "t_ms": 0}
        
        if state not in ['on', 'off']:
            return {"ok": False, "error": "Invalid state (on/off)", "retries": 0, "t_ms": 0}
        
        command_char = self.lamp_commands[lamp][state]
        frame = f"{device}{command_char}"
        
        return await self.send_command(frame)

    async def send_all_command(self, device: str, state: str) -> Dict:
        """Send all lamps command"""
        if device not in 'ABCDEFGHIJKLMN':
            return {"ok": False, "error": "Invalid device", "retries": 0, "t_ms": 0}
        
        if state not in ['on', 'off']:
            return {"ok": False, "error": "Invalid state (on/off)", "retries": 0, "t_ms": 0}
        
        command_char = '*' if state == 'on' else '!'
        frame = f"{device}{command_char}"
        
        return await self.send_command(frame)

    async def send_route_command(self, device: str, route: int) -> Dict:
        """Send route preset command"""
        if device not in 'ABCDEFGHIJKLMN':
            return {"ok": False, "error": "Invalid device", "retries": 0, "t_ms": 0}
        
        if route not in range(0, 10):
            return {"ok": False, "error": "Invalid route (0-9)", "retries": 0, "t_ms": 0}
        
        frame = f"{device}R{route}"
        
        return await self.send_command(frame)

    async def send_mask_command(self, device: str, mask: str) -> Dict:
        """Send mask command"""
        if device not in 'ABCDEFGHIJKLMN':
            return {"ok": False, "error": "Invalid device", "retries": 0, "t_ms": 0}
        
        if not mask or len(mask) != 3:
            return {"ok": False, "error": "Invalid mask (3 hex chars)", "retries": 0, "t_ms": 0}
        
        try:
            # Validate hex and range (000-1FF)
            mask_int = int(mask, 16)
            if mask_int < 0 or mask_int > 0x1FF:
                return {"ok": False, "error": "Mask out of range (000-1FF)", "retries": 0, "t_ms": 0}
        except ValueError:
            return {"ok": False, "error": "Invalid hex mask", "retries": 0, "t_ms": 0}
        
        frame = f"{device}M{mask.upper()}"
        
        return await self.send_command(frame)

    # Legacy methods for backward compatibility
    async def send_lamp_command(self, lamp_id: int, state: bool, flash: bool = False) -> bool:
        """Legacy method for backward compatibility
        
        Args:
            lamp_id: Lamp ID (1-126)
            state: True for ON, False for OFF
            flash: If True and state is ON, append '#' to make lamp flash (e.g., 'Ab' becomes 'Ab#')
        """
        if lamp_id not in self.command_mapping:
                return False
                
        mapping = self.command_mapping[lamp_id]
        device = mapping["device"]
        lamp = mapping["lamp"]
        command = mapping["on" if state else "off"]
        
        # Build frame: if flash is True and state is ON, append '#' (e.g., 'Ab' -> 'Ab#')
        frame = f"{device}{command}"
        if flash and state:
            frame += "#"
        
        result = await self.send_command(frame)
        
        return result["ok"]

    async def send_batch_commands(self, commands: Dict[int, bool]) -> bool:
        """Send batch of lamp commands with retry logic for failed commands.
        
        If a command fails (e.g., broken pipe), it will be retried after ensuring
        connection stability. This ensures critical zone activations succeed.
        
        The last lamp in the sequence (highest lamp_id with state=True) will be sent
        with flash=True to make it flash (e.g., 'Ab' becomes 'Ab#').
        """
        if not commands:
            return True
        
        # Find the last lamp in the sequence (highest lamp_id with state=True)
        on_lamps = [lamp_id for lamp_id, state in commands.items() if state]
        last_lamp_id = max(on_lamps) if on_lamps else None
        
        if last_lamp_id:
            logger.info(f"📍 Last lamp in sequence: {last_lamp_id} (will flash with '#')")
        
        success_count = 0
        total = len(commands)
        failed_commands = {}  # Track failed commands for retry
        
        # First pass: try all commands
        for lamp_id, state in commands.items():
            try:
                # Flash the last lamp if it's ON
                flash = (lamp_id == last_lamp_id and state)
                success = await self.send_lamp_command(lamp_id, state, flash=flash)
                if success:
                        success_count += 1
                else:
                    logger.warning(f"Batch command failed: Lamp {lamp_id} -> {state}, will retry")
                    failed_commands[lamp_id] = state
            except Exception as e:
                logger.error(f"Batch command error for lamp {lamp_id}: {e}, will retry")
                failed_commands[lamp_id] = state
        
        # Retry failed commands after ensuring connection is stable
        if failed_commands:
            logger.info(f"Retrying {len(failed_commands)} failed commands after ensuring connection...")
            await asyncio.sleep(0.5)  # Brief pause for connection to stabilize
            
            # Ensure connection is ready
            try:
                self.ensure_connected()
            except Exception as e:
                logger.warning(f"Failed to ensure connection before retry: {e}")
            
            # Retry failed commands
            retry_success = 0
            for lamp_id, state in failed_commands.items():
                try:
                    # Flash the last lamp if it's ON (same logic as first pass)
                    flash = (lamp_id == last_lamp_id and state)
                    success = await self.send_lamp_command(lamp_id, state, flash=flash)
                    if success:
                        success_count += 1
                        retry_success += 1
                        logger.info(f"Retry succeeded: Lamp {lamp_id} -> {state}")
                    else:
                        logger.warning(f"Retry still failed: Lamp {lamp_id} -> {state}")
                except Exception as e:
                    logger.error(f"Retry error for lamp {lamp_id}: {e}")
            
            if retry_success > 0:
                logger.info(f"Retry recovered {retry_success}/{len(failed_commands)} commands")
        
        # Return True if at least some commands succeeded
        result = success_count > 0
        logger.info(f"Batch commands: {success_count}/{total} succeeded (initial + retries)")
        return result

    def get_health_status(self) -> Dict:
        """Get gateway health status"""
        connected = self.socket is not None
        queue_depth = self.command_queue.qsize()
        
        return {
            "gateway_connected": connected,
            "queue_depth": queue_depth,
            "device_status": self.device_status,
            "connection_status": self.connection_status,
            "last_heartbeat": self.last_heartbeat.isoformat() if self.last_heartbeat else None
        }

    async def test_connection(self) -> bool:
        """Test gateway connection"""
        try:
            result = await self.send_command("A!")  # Send a safe command
            return result["ok"]
        except Exception as e:
            logger.error(f"Connection test failed: {str(e)}")
            return False

    def register_active_zone(self, zone_name: str, wind_direction: str, zone_commands: Optional[Dict[int, bool]] = None):
        """Register a zone as active - will be periodically re-asserted.
        
        IMPORTANT: Only ONE zone can be active at a time. Registering a new zone
        automatically clears any previously active zone.
        
        CRITICAL: If a previous zone is being deactivated, this immediately replaces it.
        The new zone will start assertion immediately, potentially before old zone lamps turn OFF.
        This is by design - new activation takes priority.
        
        Args:
            zone_name: Zone name (e.g., "Zone A")
            wind_direction: Wind direction (e.g., "N-S")
            zone_commands: Dict of {lamp_id: True} for this zone (cached to avoid re-computation)
        """
        zone_name = zone_name.strip()
        wind_direction = wind_direction.strip().upper()
        
        with self.zone_assertion_lock:
            # Note: By design, activation function should deactivate previous zone first
            # If we reach here with an active zone, it means previous deactivation completed
            if self.active_zone:
                old_zone = f"{self.active_zone['zone_name']} {self.active_zone['wind_direction']}"
                logger.info(f"Replacing previous zone: {old_zone} -> {zone_name} {wind_direction} (previous zone should already be deactivated)")
            
            self.active_zone = {
                'zone_name': zone_name,
                'wind_direction': wind_direction,
                'last_assert_time': time.time(),
                'commands': zone_commands  # Cache commands for assertion loop
            }
            logger.info(f"Registered active zone: {zone_name} {wind_direction} (single zone only)")
    
    def unregister_active_zone(self, zone_name: Optional[str] = None, wind_direction: Optional[str] = None):
        """Unregister the active zone - will stop being re-asserted.
        
        Args:
            zone_name: Optional - if provided, only unregister if matches
            wind_direction: Optional - if provided, only unregister if matches
        """
        with self.zone_assertion_lock:
            if not self.active_zone:
                return
            
            # If zone_name/wind provided, only unregister if they match
            if zone_name is not None or wind_direction is not None:
                match_zone = zone_name is None or self.active_zone['zone_name'].lower() == zone_name.strip().lower()
                match_wind = wind_direction is None or self.active_zone['wind_direction'].upper() == wind_direction.strip().upper()
                if not (match_zone and match_wind):
                    return  # Don't unregister if doesn't match
            
            active_info = f"{self.active_zone['zone_name']} {self.active_zone['wind_direction']}"
            self.active_zone = None
            self.assertion_cancel_epoch += 1  # abort in-flight assertion
            logger.info(f"Unregistered active zone: {active_info} and canceled assertion cycle")
    
    def pause_assertion(self, reason: str = ""):
        """Pause assertion loop and cancel any in-flight assertion cycles"""
        with self.zone_assertion_lock:
            self.ASSERTION_ENABLED = False
            # bump token so an in-progress cycle aborts
            self.assertion_cancel_epoch += 1
            logger.info(f"Assertion paused {('('+reason+')') if reason else ''}, cancel_epoch={self.assertion_cancel_epoch}")
            log_always(f"GATEWAY: Assertion paused {('('+reason+')') if reason else ''}, cancel_epoch={self.assertion_cancel_epoch}")
    
    def resume_assertion(self):
        """Resume assertion loop"""
        with self.zone_assertion_lock:
            self.ASSERTION_ENABLED = True
            logger.info("Assertion resumed")
            log_always("GATEWAY: Assertion resumed")
    
    def clear_all_active_zones(self):
        """Clear the active zone (e.g., on system deactivation)"""
        with self.zone_assertion_lock:
            if self.active_zone:
                active_info = f"{self.active_zone['zone_name']} {self.active_zone['wind_direction']}"
                self.active_zone = None
                self.assertion_cancel_epoch += 1  # abort in-flight assertion
                logger.info(f"Cleared active zone: {active_info} and canceled assertion cycle")
            else:
                logger.info("No active zone to clear")
    
    def _zone_assertion_loop(self):
        """Background thread: periodically re-assert active zone commands"""
        log_always("GATEWAY: Assertion loop started")
        logger.info("Zone assertion loop is running")
        
        while True:
            try:
                time.sleep(2.0)  # Check every 2 seconds
                
                # Skip if assertion disabled (paused)
                if not self.ASSERTION_ENABLED:
                    time.sleep(0.1)
                    continue
                
                # Check if deactivation is in progress - if so, skip assertion
                try:
                    from complete_backend import _sync_state, _sync_lock
                    with _sync_lock:
                        deactivation_in_progress = _sync_state.get("deactivationInProgress", False)
                    if deactivation_in_progress:
                        continue  # Skip assertion during deactivation
                except Exception:
                    pass  # If can't check, continue anyway
                
                current_time = time.time()
                active_zone = None
                token = 0
                
                # Get the single active zone (if any) and capture cancel token
                with self.zone_assertion_lock:
                    token = self.assertion_cancel_epoch
                    if self.active_zone:
                        last_assert_time = self.active_zone.get('last_assert_time', 0)
                        if current_time - last_assert_time >= self.ASSERTION_INTERVAL:
                            # Copy zone data for processing outside lock
                            active_zone = {
                                'zone_name': self.active_zone['zone_name'],
                                'wind_direction': self.active_zone['wind_direction'],
                                'commands': self.active_zone.get('commands')
                            }
                
                # Re-assert the active zone (only one zone active at a time)
                # Retry 3 times with 5 second delays
                if active_zone:
                    try:
                        zone_name = active_zone['zone_name']
                        wind_direction = active_zone['wind_direction']
                        zone_commands = active_zone['commands']
                        
                        if not zone_commands:
                            # Commands not cached, skip this cycle (will be cached on next activation)
                            logger.warning(f"No cached commands for zone {zone_name} {wind_direction}, skipping assertion")
                            continue
                        
                        # Find the last lamp in the sequence (highest lamp_id with state=True)
                        on_lamps = [lamp_id for lamp_id, state in zone_commands.items() if state]
                        last_lamp_id = max(on_lamps) if on_lamps else None
                        
                        # Retry loop: 3 attempts with 5 second delays
                        assertion_success = False
                        for assert_attempt in range(self.ASSERTION_RETRIES):
                            try:
                                # Send commands through normal queue (respects rate limiting)
                                sent_count = 0
                                for lamp_id, state in zone_commands.items():
                                    # ABORT mid-flight if deactivation/replace happened
                                    if not self.ASSERTION_ENABLED:
                                        break
                                    with self.zone_assertion_lock:
                                        if token != self.assertion_cancel_epoch:
                                            # deactivation/replace happened → abort immediately
                                            break
                                        # also abort if zone changed or cleared
                                        if not self.active_zone or \
                                           self.active_zone['zone_name'] != zone_name or \
                                           self.active_zone['wind_direction'] != wind_direction:
                                            break
                                    
                                    # now safe to enqueue one lamp
                                    if 1 <= lamp_id <= 126:
                                        # Flash the last lamp if it's ON
                                        flash = (lamp_id == last_lamp_id and state)
                                        # Use send_lamp_command which goes through the queue
                                        success = asyncio.run(self.send_lamp_command(lamp_id, state, flash=flash))
                                        if success:
                                            sent_count += 1
                                
                                if sent_count > 0:
                                    assertion_success = True
                                    logger.info(f"Re-asserted zone: {zone_name} {wind_direction} (attempt {assert_attempt + 1}/{self.ASSERTION_RETRIES}, {sent_count}/{len(zone_commands)} lamps)")
                                    break  # Success, exit retry loop
                                else:
                                    logger.warning(f"Re-assertion attempt {assert_attempt + 1}/{self.ASSERTION_RETRIES} failed: {zone_name} {wind_direction} (0 commands sent)")
                                    
                                    # Wait before next attempt (unless last attempt)
                                    if assert_attempt < self.ASSERTION_RETRIES - 1:
                                        time.sleep(self.ASSERTION_RETRY_DELAY)
                                        
                            except Exception as e:
                                logger.error(f"Re-assertion attempt {assert_attempt + 1}/{self.ASSERTION_RETRIES} error: {e}")
                                if assert_attempt < self.ASSERTION_RETRIES - 1:
                                    time.sleep(self.ASSERTION_RETRY_DELAY)
                        
                        # Update last assertion time only if assertion succeeded
                        if assertion_success:
                            with self.zone_assertion_lock:
                                if self.active_zone and \
                                   self.active_zone['zone_name'] == zone_name and \
                                   self.active_zone['wind_direction'] == wind_direction:
                                    self.active_zone['last_assert_time'] = current_time
                        else:
                            logger.error(f"Failed to re-assert zone after {self.ASSERTION_RETRIES} attempts: {zone_name} {wind_direction}")
                            # Don't update last_assert_time on failure - will retry next cycle
                        
                    except Exception as e:
                        logger.error(f"Error re-asserting zone {active_zone.get('zone_name', 'unknown')}: {e}")
                        # Don't update last_assert_time on error - will retry next cycle
                
            except Exception as e:
                logger.error(f"Zone assertion loop error: {e}")
                time.sleep(5.0)  # Wait longer on error
    
    def close(self):
        """Close the gateway service"""
        try:
            with self.socket_lock:
                if self.socket:
                    self.socket.close()
                    self.socket = None
        except Exception as e:
            logger.error(f"Error closing socket: {str(e)}")

