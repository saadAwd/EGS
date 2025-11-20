import { EmergencyWebSocketClient } from '../websocketClient';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

(global as any).WebSocket = MockWebSocket;

describe('EmergencyWebSocketClient', () => {
  let client: EmergencyWebSocketClient;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new EmergencyWebSocketClient();
    mockHandler = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    client.disconnect();
  });

  it('should connect to WebSocket server', () => {
    client.connect('ws://test:8003');
    
    expect(client['ws']).toBeDefined();
  });

  it('should handle connection open', () => {
    const onOpenSpy = jest.spyOn(console, 'log');
    client.connect('ws://test:8003');
    
    jest.advanceTimersByTime(20);
    
    expect(client['isConnected']).toBe(true);
    expect(client['reconnectAttempts']).toBe(0);
  });

  it('should handle messages', () => {
    client.connect('ws://test:8003');
    client.onMessage('zone_state', mockHandler);
    
    jest.advanceTimersByTime(20);
    
    const message = {
      type: 'zone_state',
      status: 'activated',
      zone: 'Zone A',
      windDirection: 'N-S',
      ts: Date.now(),
    };
    
    if (client['ws']) {
      (client['ws'] as any).onmessage({
        data: JSON.stringify(message),
      });
    }
    
    expect(mockHandler).toHaveBeenCalledWith(message);
  });

  it('should handle command_status messages', () => {
    client.connect('ws://test:8003');
    client.onMessage('command_status', mockHandler);
    
    jest.advanceTimersByTime(20);
    
    const message = {
      type: 'command_status',
      scope: 'lamp',
      device_id: 1,
      cmd: 'ON',
      state: 'ack',
      ts: Date.now(),
    };
    
    if (client['ws']) {
      (client['ws'] as any).onmessage({
        data: JSON.stringify(message),
      });
    }
    
    expect(mockHandler).toHaveBeenCalledWith(message);
  });

  it('should reconnect on connection close', () => {
    client.connect('ws://test:8003');
    jest.advanceTimersByTime(20);
    
    const connectSpy = jest.spyOn(client, 'connect');
    
    if (client['ws']) {
      (client['ws'] as any).onclose(new CloseEvent('close'));
    }
    
    jest.advanceTimersByTime(1100);
    
    expect(connectSpy).toHaveBeenCalled();
  });

  it('should send ping messages', () => {
    client.connect('ws://test:8003');
    jest.advanceTimersByTime(20);
    
    const sendSpy = jest.spyOn(client['ws']!, 'send');
    
    jest.advanceTimersByTime(30000);
    
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should disconnect properly', () => {
    client.connect('ws://test:8003');
    jest.advanceTimersByTime(20);
    
    const closeSpy = jest.spyOn(client['ws']!, 'close');
    
    client.disconnect();
    
    expect(closeSpy).toHaveBeenCalled();
    expect(client['ws']).toBeNull();
  });

  it('should notify connection status callbacks', () => {
    const callback = jest.fn();
    client.onConnectionStatusChange(callback);
    
    client.connect('ws://test:8003');
    jest.advanceTimersByTime(20);
    
    expect(callback).toHaveBeenCalledWith({
      isConnected: true,
      reconnectAttempts: 0,
    });
  });
});

