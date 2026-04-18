import { test, expect } from '@playwright/test';

test.describe('Navigation & Access Control', () => {
  test('should not show dashboard to unauthorized users', async ({ page }) => {
    await page.goto('/');
    
    // Auth-only elements should not be visible
    await expect(page.locator('nav')).not.toBeVisible();
    await expect(page.locator('text=Total Balance')).not.toBeVisible();
  });

  test('should have a clean responsive mobile menu target', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // On landing page, mobile constraints should hold
    const landingContainer = page.locator('div.lg\\:grid-cols-2');
    await expect(landingContainer).toBeVisible();
  });
});
