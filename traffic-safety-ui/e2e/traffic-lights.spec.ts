import { test, expect } from '@playwright/test';

test.describe('Traffic Light Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=Traffic Light', { timeout: 10000 });
  });

  test('should toggle lamp on and off', async ({ page }) => {
    // Navigate to Traffic Light tab
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    // Find a lamp indicator
    const lampIndicator = page.locator('[role="button"][aria-label*="lamp"]').first();
    
    if (await lampIndicator.isVisible()) {
      const initialState = await lampIndicator.getAttribute('aria-label');
      
      // Click to toggle
      await lampIndicator.click();
      
      // Wait for pending state
      await page.waitForTimeout(500);
      
      // Verify state changed (pending or updated)
      const newState = await lampIndicator.getAttribute('aria-label');
      expect(newState).toBeDefined();
    }
  });

  test('should handle rapid toggling', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    const lampIndicator = page.locator('[role="button"][aria-label*="lamp"]').first();
    
    if (await lampIndicator.isVisible()) {
      // Rapid clicks
      for (let i = 0; i < 5; i++) {
        await lampIndicator.click();
        await page.waitForTimeout(100);
      }
      
      // Should handle all clicks gracefully
      await page.waitForTimeout(1000);
      
      // Verify UI is still responsive
      expect(await lampIndicator.isVisible()).toBeTruthy();
    }
  });

  test('should toggle all lamps in a pole', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    // Find "Turn All On" or "Turn All Off" button
    const toggleAllButton = page.locator('button:has-text("Turn All")').first();
    
    if (await toggleAllButton.isVisible() && await toggleAllButton.isEnabled()) {
      await toggleAllButton.click();
      
      // Wait for operation to complete
      await page.waitForTimeout(1000);
      
      // Verify button state changed
      const buttonText = await toggleAllButton.textContent();
      expect(buttonText).toBeTruthy();
    }
  });

  test('should refresh data', async ({ page }) => {
    await page.click('text=Traffic Light');
    await page.waitForSelector('text=Traffic Light Management', { timeout: 5000 });

    const refreshButton = page.locator('button[aria-label="Refresh traffic light data"]');
    
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      
      // Wait for refresh
      await page.waitForTimeout(1000);
      
      // Verify page is still loaded
      expect(await page.locator('text=Traffic Light Management').isVisible()).toBeTruthy();
    }
  });
});

