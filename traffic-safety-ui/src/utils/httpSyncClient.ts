// httpSyncClient.ts
import apiClient from '../api/client';

export interface SyncState {
  isActivated: boolean;
  zoneName: string | null;
  windDirection: string | null;
  activationTime: string | null;
  deactivationInProgress?: boolean;
}

export class HttpSyncClient {
  private baseUrl: string;
  private isPolling: boolean = false;
  private pollInterval: number = 60000; // 60 seconds - lazy fallback for WebSocket
  private pollTimer: NodeJS.Timeout | null = null;
  private onStateChange: ((state: SyncState) => void) | null = null;

  constructor(baseUrl?: string) {
    // Use provided URL or derive from API client (same backend)
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else {
      // Get base URL from API client (removes /api suffix and uses same host)
      const apiBaseUrl = (apiClient.defaults.baseURL || '').replace(/\/api\/?$/, '');
      this.baseUrl = apiBaseUrl || window.location.origin;
    }
    console.log('HTTP Sync Client initialized with URL:', this.baseUrl);
  }

  public startPolling(onStateChange: (state: SyncState) => void) {
    this.onStateChange = onStateChange;
    this.isPolling = true;
    this.poll();
  }

  public stopPolling() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll() {
    if (!this.isPolling) return;

    try {
      const response = await fetch(`${this.baseUrl}/api/sync/state`);
      if (response.ok) {
        const state: SyncState = await response.json();
        if (this.onStateChange) {
          this.onStateChange(state);
        }
      }
    } catch (error) {
      console.error('Sync polling error:', error);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
  }

  public async activateEmergency(zoneName: string, windDirection: string) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zoneName,
          windDirection
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Emergency activated via HTTP sync:', result);
        return result;
      }
    } catch (error) {
      console.error('Failed to activate emergency:', error);
    }
  }

  public async deactivateEmergency() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Emergency deactivated via HTTP sync:', result);
        return result;
      }
    } catch (error) {
      console.error('Failed to deactivate emergency:', error);
    }
  }

  public async registerClient() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/register`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Client registered:', result);
        return result;
      }
    } catch (error) {
      console.error('Failed to register client:', error);
    }
  }

  public async heartbeat() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/heartbeat`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        return result;
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }
}
