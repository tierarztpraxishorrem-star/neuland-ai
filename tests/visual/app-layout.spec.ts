import { expect, test } from '@playwright/test';

const waitForApp = async (page: Parameters<typeof test>[0]['page']) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
};

test('patient list visual baseline', async ({ page }) => {
  await page.goto('/patienten');
  await waitForApp(page);
  await expect(page).toHaveScreenshot('patienten-list.png', { fullPage: true, maxDiffPixels: 120 });
});

test('patient detail visual baseline (first available)', async ({ page }) => {
  await page.goto('/patienten');
  await waitForApp(page);

  const firstPatientRow = page.locator('text=Letzte Konsultation').first();
  const hasRow = (await firstPatientRow.count()) > 0;

  if (!hasRow) {
    test.skip(true, 'No patient available for detail-page visual snapshot.');
    return;
  }

  await firstPatientRow.click();
  await waitForApp(page);
  await expect(page).toHaveScreenshot('patienten-detail.png', { fullPage: true, maxDiffPixels: 160 });
});

test('vetmind visual baseline', async ({ page }) => {
  await page.goto('/vetmind');
  await waitForApp(page);
  await expect(page).toHaveScreenshot('vetmind.png', { fullPage: true, maxDiffPixels: 180 });
});

test('consultation start visual baseline', async ({ page }) => {
  await page.goto('/konsultation/start');
  await waitForApp(page);
  await expect(page).toHaveScreenshot('konsultation-start.png', { fullPage: true, maxDiffPixels: 160 });
});
