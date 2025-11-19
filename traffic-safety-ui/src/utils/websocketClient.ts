// websocketClient.ts
import { useActivationContext } from '../contexts/ActivationContext';

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export class EmergencyWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  public messageHandlers: Map<string, (data: any) => void> = new Map();
  private activationContext: any = null;

  constructor(activationContext: any) {
    this.activationContext = activationContext;
  }

  connect(serverUrl: string = 'ws://192.168.100.1:8003') {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      this.ws = new WebSocket(serverUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected to emergency portal');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.sendPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
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
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
      
      this.reconnectDelay *= 2; // Exponential backoff
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private sendPing() {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
      // Send ping every 30 seconds
      setTimeout(() => this.sendPing(), 30000);
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
      case 'pong':
        // Server responded to ping
        break;
      default:
        console.log('Unknown message type:', message.type);
    }

    // Call registered handlers
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.data);
    }
  }

  private handleStateSync(data: any) {
    console.log('Syncing emergency state:', data);
    if (this.activationContext) {
      if (data.isActivated) {
        this.activationContext.setZoneActivation({
          isActivated: true,
          zoneName: data.zoneName,
          windDirection: data.windDirection,
          activationTime: data.activationTime
        });
      } else {
        this.activationContext.clearZoneActivation();
      }
    }
  }

  private handleEmergencyActivated(data: any) {
    console.log('Emergency activated remotely:', data);
    if (this.activationContext) {
      this.activationContext.setZoneActivation({
        isActivated: true,
        zoneName: data.zoneName,
        windDirection: data.windDirection,
        activationTime: data.activationTime
      });
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: this.ws?.readyState,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}
