import { test, expect } from '@playwright/test';
import path from 'path';

test('End-to-End Demo: Upload CSV and trigger AI', async ({ page }) => {
  // 1. Navigate to the local Next.js app
  await page.goto('/');

  // Give the page a second to load animations
  await page.waitForTimeout(1000);

  // Click "Explore a demo workspace"
  await page.getByRole('button', { name: /Explore a demo workspace/i }).click();

  // Wait for it to log in and redirect
  try {
    await page.waitForURL('**/overview', { timeout: 10000 });
  } catch (e) {
    await page.screenshot({ path: 'tests/e2e/error.png' });
    throw e;
  }

  // Go to Products page
  await page.getByRole('link', { name: /Products & stock/i }).click();

  // Click "Upload inventory" button
  await page.getByRole('button', { name: /Upload inventory/i }).click();

  // 2. Look for a file input to upload the CSV
  const fileInput = page.locator('input[type="file"]');
  
  // Resolve the path to our dummy CSV
  const csvPath = path.resolve(process.cwd(), 'demo-assets/sharma_inventory.csv');
  
  // Wait for the UI to fully load and the input to appear
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });
  await fileInput.setInputFiles(csvPath);
  console.log("CSV Uploaded successfully in the test!");

  // 3. Wait a few seconds to let the UI react (so it gets captured in the video)
  await page.waitForTimeout(3000);

  // 4. Take a screenshot of the final state
  await page.screenshot({ path: 'tests/e2e/demo-result.png' });
});
