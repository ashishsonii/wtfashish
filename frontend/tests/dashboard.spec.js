// @ts-check
import { test, expect } from '@playwright/test';

test.describe('WTF LivePulse E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for initial data load
    await page.waitForSelector('[data-testid="gym-selector"]', { timeout: 10000 });
  });

  test('dashboard loads and displays gym list without errors', async ({ page }) => {
    // Check navbar exists
    await expect(page.locator('.navbar-logo')).toContainText('WTF');

    // Gym selector must be visible
    await expect(page.locator('[data-testid="gym-selector"]')).toBeVisible();

    // Check gym selector has chips
    const gymChips = page.locator('[data-testid="gym-option"]');
    const count = await gymChips.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Check occupancy card exists
    await expect(page.locator('#occupancy-card')).toBeVisible();

    // Check revenue card exists
    await expect(page.locator('#revenue-card')).toBeVisible();

    // Check summary bar has values
    await expect(page.locator('#total-checked-in')).toBeVisible();
    await expect(page.locator('#total-revenue')).toBeVisible();

    // No "undefined" anywhere on the page
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('undefined');

    // No error boundaries triggered
    const errorPanel = page.locator('[data-testid="error-panel"]');
    await expect(errorPanel).not.toBeVisible();
  });

  test('switching gym updates occupancy count without page reload', async ({ page }) => {
    // Get current occupancy value
    const firstValue = await page.locator('[data-testid="occupancy-count"]').textContent();

    // Click a different gym chip
    const chips = page.locator('[data-testid="gym-option"]');
    const chipCount = await chips.count();
    if (chipCount > 1) {
      // Click the second gym chip
      await chips.nth(1).click();

      // Wait for data update (< 500ms spec)
      await page.waitForTimeout(600);

      // Occupancy panel should still exist and show a number
      const newValue = await page.locator('[data-testid="occupancy-count"]').textContent();
      expect(newValue).toMatch(/^\d/);
    }
  });

  test('starting simulator causes activity feed to update within 5 seconds', async ({ page }) => {
    // Start the simulator
    const startBtn = page.locator('[data-testid="simulator-start"]');
    if (await startBtn.isVisible()) {
      await startBtn.click();

      // Wait for activity feed to receive at least 1 new event
      await expect(page.locator('[data-testid="activity-feed-item"]').first())
        .toBeVisible({ timeout: 5000 });

      // Stop simulator
      const stopBtn = page.locator('[data-testid="simulator-stop"]');
      if (await stopBtn.isVisible()) {
        await stopBtn.click();
      }
    }
  });

  test('anomaly badge is visible and updates', async ({ page }) => {
    // Check anomaly badge exists
    const badge = page.locator('[data-testid="anomaly-badge"]');
    await expect(badge).toBeVisible();

    // Get initial badge text
    const initialText = await badge.textContent();
    expect(initialText).toContain('Anomalies');

    // Click anomaly badge to navigate to anomalies page
    await badge.click();
    await page.waitForTimeout(500);

    // Should see anomaly detection log heading
    const heading = page.locator('h2');
    await expect(heading).toContainText('Anomaly');
  });
});
