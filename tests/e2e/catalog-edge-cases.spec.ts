import { test, expect } from '@playwright/test';
test('formatted recall number leads to the original remedy and never the mismatched API remedy', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('CPSC 26-135');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.getByText('Product details & remedy', { exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'View remedy on CPSC' }),
  ).toHaveAttribute('href', /cpsc\.gov\/Recalls\/2026\/INIU-/);
  await expect(page.getByText(/Grizzly|recalled planers/)).toHaveCount(0);
  const data = await (await page.request.get('/api/recalls')).json();
  expect(
    data.records.every(
      (r: Record<string, unknown>) => !Object.hasOwn(r, 'remedies'),
    ),
  ).toBe(true);
});
