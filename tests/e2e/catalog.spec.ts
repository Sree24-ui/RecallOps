import { test, expect } from '@playwright/test';
test('official catalogue searches, expands sources and provides a blank inventory template', async ({
  page,
}) => {
  await page.goto('/');
  const data = await (await page.request.get('/api/recalls')).json();
  await expect(page.locator('.catalog-card')).toHaveCount(data.records.length);
  await page.getByRole('searchbox').fill('INIU BI-B41');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.getByText('Product details & remedy', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Official description', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Read official notice', exact: false }),
  ).toHaveAttribute('href', /https:\/\/www.cpsc.gov\/Recalls\/2026\//);
  await page.getByRole('searchbox').fill('no-matching-notice-in-selection');
  await expect(
    page.getByRole('heading', { name: 'No notice in this selection matches' }),
  ).toBeVisible();
  const template = await (
    await page.request.get('/inventory-template.csv')
  ).text();
  expect(template.trim().split('\n')).toHaveLength(1);
});
test('catalogue mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Recall notices', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test('cross-origin operator mutations are rejected', async ({ request }) => {
  const response = await request.post('/api/workspace', {
    headers: { Origin: 'https://unrelated.example' },
    data: { action: 'judge' },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('Cross-origin');
});
