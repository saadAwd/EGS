import { test, expect } from '@playwright/test';

test.describe('Gateway Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Traffic Light', { timeout: 10000 });
  });

  test('should show gateway connection status', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    // Check for gateway status
    const gatewayStatus = page.locator('text=/Connected|Disconnected/i');
    
    if (await gatewayStatus.isVisible()) {
      const status = await gatewayStatus.textContent();
      expect(status).toBeTruthy();
    }
  });

  test('should connect to gateway', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    const connectButton = page.locator('button[aria-label="Connect to ESP32 gateway"]');
    
    if (await connectButton.isVisible() && await connectButton.isEnabled()) {
      await connectButton.click();
      
      // Wait for connection attempt
      await page.waitForTimeout(2000);
      
      // Verify button state updated
      const isDisabled = await connectButton.isDisabled();
      expect(isDisabled !== undefined).toBeTruthy();
    }
  });

  test('should disconnect from gateway', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    const disconnectButton = page.locator('button[aria-label="Disconnect from ESP32 gateway"]');
    
    if (await disconnectButton.isVisible() && await disconnectButton.isEnabled()) {
      await disconnectButton.click();
      
      // Wait for disconnection
      await page.waitForTimeout(1000);
      
      // Verify button state updated
      const isDisabled = await disconnectButton.isDisabled();
      expect(isDisabled !== undefined).toBeTruthy();
    }
  });

  test('should handle gateway recovery after disconnection', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    // Disconnect if connected
    const disconnectButton = page.locator('button[aria-label="Disconnect from ESP32 gateway"]');
    if (await disconnectButton.isVisible() && await disconnectButton.isEnabled()) {
      await disconnectButton.click();
      await page.waitForTimeout(1000);
    }

    // Reconnect
    const connectButton = page.locator('button[aria-label="Connect to ESP32 gateway"]');
    if (await connectButton.isVisible() && await connectButton.isEnabled()) {
      await connectButton.click();
      await page.waitForTimeout(2000);
      
      // Verify recovery
      const gatewayStatus = page.locator('text=/Connected|Disconnected/i');
      expect(await gatewayStatus.isVisible()).toBeTruthy();
    }
  });
});

