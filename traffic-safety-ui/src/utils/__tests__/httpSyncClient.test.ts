// Mock apiClient before importing HttpSyncClient
jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    defaults: {
      baseURL: 'http://localhost:8000/api',
    },
  },
}));

import { HttpSyncClient } from '../httpSyncClient';

// Mock fetch
global.fetch = jest.fn();

describe('HttpSyncClient', () => {
  let client: HttpSyncClient;
  let mockOnStateChange: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new HttpSyncClient('http://test');
    mockOnStateChange = jest.fn();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    client.stopPolling();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should initialize with base URL', () => {
    expect(client).toBeDefined();
  });

  it('should start polling and call onStateChange', async () => {
    const mockState = {
      isActivated: true,
      zoneName: 'Zone A',
      windDirection: 'N-S',
      activationTime: new Date().toISOString(),
      deactivationInProgress: false,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockState,
    });

    client.startPolling(mockOnStateChange);
    
    // Poll happens immediately, advance timers to let promises resolve
    await Promise.resolve(); // Let the fetch promise start
    jest.advanceTimersByTime(1);
    await Promise.resolve(); // Let the json() promise resolve
    
    expect(global.fetch).toHaveBeenCalledWith('http://test/api/sync/state');
    expect(mockOnStateChange).toHaveBeenCalledWith(mockState);
  });

  it('should stop polling', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        isActivated: false,
        zoneName: null,
        windDirection: null,
        activationTime: null,
      }),
    });

    client.startPolling(mockOnStateChange);
    
    // Wait for initial poll
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    
    // Clear previous calls
    (global.fetch as jest.Mock).mockClear();
    
    client.stopPolling();
    
    // Advance time - should not poll
    jest.advanceTimersByTime(70000);
    await Promise.resolve();
    
    // Should not poll after stop
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle polling errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    client.startPolling(mockOnStateChange);
    
    // Wait for error handling
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should activate emergency', async () => {
    const mockResponse = { success: true };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.activateEmergency('Zone A', 'N-S');
    
    expect(global.fetch).toHaveBeenCalledWith('http://test/api/sync/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zoneName: 'Zone A',
        windDirection: 'N-S',
      }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('should deactivate emergency', async () => {
    const mockResponse = { success: true };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.deactivateEmergency();
    
    expect(global.fetch).toHaveBeenCalledWith('http://test/api/sync/deactivate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(result).toEqual(mockResponse);
  });

  it('should handle activation errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    await client.activateEmergency('Zone A', 'N-S');
    
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should poll at correct interval', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        isActivated: false,
        zoneName: null,
        windDirection: null,
        activationTime: null,
      }),
    });

    client.startPolling(mockOnStateChange);
    
    // First poll should happen immediately
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Second poll should happen after interval
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

