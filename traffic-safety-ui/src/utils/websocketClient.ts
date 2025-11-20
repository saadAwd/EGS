// websocketClient.ts

export interface WebSocketMessage {
  type: string;
  data?: any;
}

// New message types from plan
export interface ZoneStateMessage {
  type: 'zone_state';
  status: 'activated' | 'deactivating' | 'cleared';
  zone: string;
  windDirection: string;
  ts: number;
}

export interface CommandStatusMessage {
  type: 'command_status';
  scope: 'lamp' | 'zone';
  device_id?: number;
  cmd: 'ON' | 'OFF';
  state: 'queued' | 'sent' | 'ack' | 'retry' | 'failed';
  ts: number;
}

export interface GatewayStatusMessage {
  type: 'gateway_status';
  state: 'READY' | 'CONNECTING' | 'DISCONNECTED';
  ts: number;
}

export interface WeatherUpdateMessage {
  type: 'weather_update';
  temp: number;
  wind_dir: string;
  wind_speed: number;
  ts: number;
}

export interface LampUpdateMessage {
  type: 'lamp_update';
  lamp_id: number;
  is_on: boolean;
  ts: number;
}

export class EmergencyWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity; // Never give up - keep trying to reconnect
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000; // Cap at 30 seconds max delay
  private isConnected = false;
  public messageHandlers: Map<string, (data: any) => void> = new Map();
  private activationContext: any = null;
  private connectionStatusCallbacks: Set<(status: { isConnected: boolean; reconnectAttempts: number }) => void> = new Set();
  private serverUrl: string = ''; // Store URL for reconnections
  private pingInterval: number | null = null; // Store ping interval ID
  private reconnectTimeout: number | null = null; // Store reconnect timeout ID

  constructor(activationContext?: any) {
    this.activationContext = activationContext;
  }

  connect(serverUrl: string = 'ws://localhost:8002/ws') {
    // Store URL for reconnections
    this.serverUrl = serverUrl;
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      this.ws = new WebSocket(serverUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected to emergency portal');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay on successful connection
        this.notifyConnectionStatus();
        
        // Clear any pending reconnection
        if (this.reconnectTimeout !== null) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        
        // Start ping interval (every 25 seconds to keep connection alive)
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Handle pong response (don't process as regular message)
          if (message.type === 'pong') {
            console.debug('🏓 Received WebSocket pong - connection alive');
            return;
          }
          
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        this.isConnected = false;
        this.stopPingInterval();
        this.notifyConnectionStatus();
        
        // Only reconnect if not a normal closure (code 1000) or intentional close
        if (event.code !== 1000 && event.code !== 1001) {
          this.scheduleReconnect();
        } else {
          console.log('WebSocket closed normally, not reconnecting');
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // Never give up - keep trying to reconnect
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay, this.maxReconnectDelay);
    console.log(`🔄 Attempting to reconnect (attempt ${this.reconnectAttempts}) in ${delay}ms`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      // Use stored URL for reconnection (CRITICAL: prevents defaulting to localhost)
      if (this.serverUrl) {
        this.connect(this.serverUrl);
      } else {
        console.error('No server URL stored, cannot reconnect');
      }
    }, delay);
    
    // Exponential backoff with cap
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  private startPingInterval() {
    // Stop any existing ping interval
    this.stopPingInterval();
    
    // Send ping every 25 seconds to keep connection alive
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.send({ type: 'ping' });
          console.debug('🏓 Sent WebSocket ping');
        } catch (error) {
          console.error('Failed to send ping:', error);
          // Connection might be dead, trigger reconnection
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.stopPingInterval();
            this.scheduleReconnect();
          }
        }
      } else {
        // Connection not open, stop pinging
        this.stopPingInterval();
      }
    }, 25000); // 25 seconds
  }
  
  private stopPingInterval() {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('Received WebSocket message:', message.type);
    
    switch (message.type) {
      case 'state_sync':
        this.handleStateSync(message.data);
        break;
      case 'emergency_activated':
        this.handleEmergencyActivated(message.data);
        break;
      case 'emergency_deactivated':
        this.handleEmergencyDeactivated(message.data);
        break;
      case 'alarm_acknowledged':
        this.handleAlarmAcknowledged(message.data);
        break;
      case 'alarm_reset':
        this.handleAlarmReset(message.data);
        break;
      // New message types from plan
      case 'zone_state':
        this.handleZoneState(message as ZoneStateMessage);
        break;
      case 'command_status':
        this.handleCommandStatus(message as CommandStatusMessage);
        break;
      case 'gateway_status':
        this.handleGatewayStatus(message as GatewayStatusMessage);
        break;
      case 'weather_update':
        this.handleWeatherUpdate(message as WeatherUpdateMessage);
        break;
      case 'lamp_update':
        this.handleLampUpdate(message as LampUpdateMessage);
        break;
      case 'pong':
        // Server responded to ping
        break;
      default:
        console.log('Unknown message type:', message.type);
    }

    // Call registered handlers
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.data || message);
    }
  }
  
  // New handlers for plan message types
  private handleZoneState(message: ZoneStateMessage) {
    console.log('Zone state update:', message);
    const handler = this.messageHandlers.get('zone_state');
    if (handler) {
      handler(message);
    }
  }
  
  private handleCommandStatus(message: CommandStatusMessage) {
    console.log('Command status update:', message);
    const handler = this.messageHandlers.get('command_status');
    if (handler) {
      handler(message);
    }
  }
  
  private handleGatewayStatus(message: GatewayStatusMessage) {
    console.log('Gateway status update:', message);
    const handler = this.messageHandlers.get('gateway_status');
    if (handler) {
      handler(message);
    }
  }
  
  private handleWeatherUpdate(message: WeatherUpdateMessage) {
    console.log('Weather update:', message);
    const handler = this.messageHandlers.get('weather_update');
    if (handler) {
      handler(message);
    }
  }
  
  private handleLampUpdate(message: LampUpdateMessage) {
    console.log('Lamp update:', message);
    const handler = this.messageHandlers.get('lamp_update');
    if (handler) {
      handler(message);
    }
  }

  private handleStateSync(data: any) {
    console.log('📡 [WebSocket] Syncing emergency state (UI update only, no activation):', data);
    // CRITICAL: Only update UI state, do NOT trigger activation
    // This is just syncing the display state from backend
    if (this.activationContext) {
      if (data.isActivated) {
        // Update UI state only - this does NOT send commands to gateway
        this.activationContext.setZoneActivation({
          isActivated: true,
          zoneName: data.zoneName,
          windDirection: data.windDirection,
          activationTime: data.activationTime
        });
        console.log('✅ [WebSocket] UI state updated (display only)');
      } else {
        this.activationContext.clearZoneActivation();
        console.log('✅ [WebSocket] UI state cleared');
      }
    }
  }

  private handleEmergencyActivated(data: any) {
    console.log('📡 [WebSocket] Emergency activated remotely (UI update only, no activation):', data);
    // CRITICAL: Only update UI state, do NOT trigger activation
    // This message indicates another client activated a zone - we just sync the display
    if (this.activationContext) {
      this.activationContext.setZoneActivation({
        isActivated: true,
        zoneName: data.zoneName,
        windDirection: data.windDirection,
        activationTime: data.activationTime
      });
      console.log('✅ [WebSocket] UI state updated from remote activation (display only)');
    }
  }

  private handleEmergencyDeactivated(data: any) {
    console.log('Emergency deactivated remotely');
    if (this.activationContext) {
      this.activationContext.clearZoneActivation();
    }
  }

  private handleAlarmAcknowledged(data: any) {
    console.log('Alarm acknowledged remotely');
    // This will be handled by the alarm context
  }

  private handleAlarmReset(data: any) {
    console.log('Alarm reset remotely');
    // This will be handled by the alarm context
  }

  send(message: WebSocketMessage) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  sendEmergencyActivate(data: { zoneName: string; windDirection: string; volume?: number }) {
    this.send({
      type: 'emergency_activate',
      data
    });
  }

  sendEmergencyDeactivate() {
    this.send({
      type: 'emergency_deactivate',
      data: {}
    });
  }

  sendAlarmAcknowledge(data: { duration?: number } = {}) {
    this.send({
      type: 'alarm_acknowledge',
      data
    });
  }

  sendAlarmReset() {
    this.send({
      type: 'alarm_reset',
      data: {}
    });
  }

  onMessage(type: string, handler: (data: any) => void) {
    this.messageHandlers.set(type, handler);
  }

  disconnect() {
    // Stop ping interval
    this.stopPingInterval();
    
    // Clear reconnect timeout
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close WebSocket connection
    if (this.ws) {
      // Close with code 1000 (normal closure) to prevent auto-reconnect
      try {
        this.ws.close(1000, 'Client disconnecting');
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyConnectionStatus();
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: this.ws?.readyState,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  
  onConnectionStatusChange(callback: (status: { isConnected: boolean; reconnectAttempts: number }) => void) {
    this.connectionStatusCallbacks.add(callback);
    return () => {
      this.connectionStatusCallbacks.delete(callback);
    };
  }
  
  private notifyConnectionStatus() {
    const status = {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
    this.connectionStatusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in connection status callback:', error);
      }
    });
  }
}
