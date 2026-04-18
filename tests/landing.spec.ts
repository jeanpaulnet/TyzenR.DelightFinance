import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display correctly for unauthenticated users', async ({ page }) => {
    await page.goto('/');

    // Check for the brand name
    await expect(page.locator('text=Delight Finance')).toBeVisible();
    
    // Check for version display
    await expect(page.locator('text=v2.0')).toBeVisible();

    // Check for login button presence
    await expect(page.locator('button:has-text("Sign in with Google")')).toBeVisible();
    
    // Check for marketing sections
    await expect(page.locator('text=Professional Health AI Engine')).toBeVisible();
    await expect(page.locator('text=Zero-Knowledge Architecture')).toBeVisible();
  });

  test('should show encryption disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Secure your intelligence with client-side zero-knowledge encryption.')).toBeVisible();
  });
});
