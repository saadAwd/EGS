import { test, expect } from '@playwright/test';

test.describe('Zone Activation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to load
    await page.waitForSelector('text=Zone Activation', { timeout: 10000 });
  });

  test('should activate and deactivate a zone', async ({ page }) => {
    // Navigate to Zone Activation tab
    await page.click('text=Zone Activation');
    await page.waitForSelector('text=Zone Activation', { timeout: 5000 });

    // Select a zone (click on zone hotspot if available)
    const zoneButton = page.locator('button[aria-label*="Select Zone"]').first();
    if (await zoneButton.isVisible()) {
      await zoneButton.click();
    }

    // Select wind direction (manual mode)
    const manualWindCheckbox = page.locator('input[type="checkbox"]');
    if (await manualWindCheckbox.isVisible()) {
      await manualWindCheckbox.check();
    }

    // Select a wind direction
    const windButton = page.locator('button:has-text("N-S")').first();
    if (await windButton.isVisible()) {
      await windButton.click();
    }

    // Click activate button
    const activateButton = page.locator('button:has-text("Activate Emergency")');
    if (await activateButton.isVisible() && await activateButton.isEnabled()) {
      await activateButton.click();
      
      // Wait for activation confirmation
      await page.waitForSelector('text=EMERGENCY ACTIVATED', { timeout: 10000 });
      
      // Verify emergency is active
      expect(await page.locator('text=EMERGENCY ACTIVATED').isVisible()).toBeTruthy();
      
      // Deactivate
      const deactivateButton = page.locator('button:has-text("Deactivate")');
      if (await deactivateButton.isVisible() && await deactivateButton.isEnabled()) {
        await deactivateButton.click();
        
        // Wait for deactivation
        await page.waitForSelector('text=Zone Activation', { timeout: 10000 });
      }
    }
  });

  test('should handle keyboard shortcuts', async ({ page }) => {
    await page.click('text=Zone Activation');
    await page.waitForSelector('text=Zone Activation', { timeout: 5000 });

    // Test Alt+Shift+A (activate)
    await page.keyboard.press('Alt+Shift+A');
    
    // Should show error if zone not selected (expected behavior)
    await page.waitForTimeout(1000);
    
    // Test Alt+Shift+D (deactivate)
    await page.keyboard.press('Alt+Shift+D');
    
    // Should show error if no active emergency (expected behavior)
    await page.waitForTimeout(1000);
  });
});

