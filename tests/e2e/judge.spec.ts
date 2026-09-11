import { test, expect } from '@playwright/test';
test('complete Judge workflow, case evidence, exports and change reassessment', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Run RecallOps Judge Demo', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Eligibility decision table' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'All mandatory inclusion conditions match and no explicit exclusion applies.',
    ),
  ).toBeVisible();
  await expect(page.getByText('000G21', { exact: true })).toBeVisible();
  await expect(page.getByText('7 / 7 fields verified')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect source version' }).click();
  await expect(page.locator('pre.source-text')).toContainText('000G21');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search inventory' })
    .fill('INIU-002');
  await page.getByRole('button', { name: 'INIU-002', exact: true }).click();
  await expect(page.locator('.badge.excluded_by_notice')).toBeVisible();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search inventory' })
    .fill('INIU-003');
  await page.getByRole('button', { name: 'INIU-003', exact: true }).click();
  await expect(page.locator('.badge.needs_review')).toBeVisible();
  await expect(page.getByText('Not recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search inventory' })
    .fill('INIU-001');
  await page.getByRole('button', { name: 'INIU-001', exact: true }).click();
  await page
    .getByRole('button', { name: 'Acknowledge case', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Acknowledged', exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Action packet', exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('recallops-packet.html');
  const holds = await page.request.get('/api/export?type=holds');
  expect(await holds.text()).toContain('INIU-001');
  expect(await holds.text()).not.toContain('INIU-002');
  const approved = await page.request.get('/api/export?type=approved');
  expect(await approved.text()).not.toContain('INIU-001');
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await page
    .getByRole('button', { name: 'Run controlled change A → B', exact: true })
    .click();
  await expect(
    page
      .getByText(
        'Serial inclusion changes from MON200 to MON100; new mandatory batch B is missing.',
      )
      .first(),
  ).toBeVisible();
  const state = await (await page.request.get('/api/workspace')).json();
  expect(
    state.inventory.find((x: { assetTag: string }) => x.assetTag === 'MON-001')
      .assessment.status,
  ).toBe('needs_review');
  await page
    .getByRole('button', { name: 'Anakin health', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'See what actually ran.' }),
  ).toBeVisible();
});
test('CSV review and import through the UI', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Import review', exact: true })
    .click();
  await page
    .getByLabel('Or paste CSV')
    .fill(
      'assetTag,title,brand,model\nE2E-IMPORT-1,USB adapter,Example,USB-001',
    );
  await page
    .getByRole('button', { name: 'Review import', exact: true })
    .click();
  await expect(page.getByText('1 valid rows')).toBeVisible();
  await page
    .getByRole('button', { name: 'Import 1 units', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'E2E-IMPORT-1', exact: true }),
  ).toBeVisible();
});
test('selected product group sends only its inventory IDs (mocked provider workflow)', async ({
  page,
}) => {
  const state = await (await page.request.get('/api/workspace')).json();
  const expected = state.inventory
    .filter(
      (item: { brand: string; model: string }) =>
        item.brand === 'INIU' && item.model === 'BI-B41',
    )
    .map((item: { id: string }) => item.id)
    .sort();
  expect(expected).toHaveLength(4);
  let submitted: string[] | undefined;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'scan') {
        submitted = body.itemIds;
        await route.fulfill({ json: { groups: 1, errors: [] } });
        return;
      }
    }
    await route.continue();
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Investigation', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Investigation product group' })
    .click();
  await page.getByRole('option', { name: /INIU.*BI-B41.*4 units/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Investigate 4 inventory units' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Run live Anakin investigation', exact: true })
    .click();
  await expect.poll(() => submitted?.slice().sort()).toEqual(expected);
});
test('mobile navigation and accessible viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Run RecallOps Judge Demo', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A change starts a new investigation.' }),
  ).toBeVisible();
});
test('API rejects oversized input and invalid webhook signatures', async ({
  request,
}) => {
  const big = await request.post('/api/workspace', {
    data: 'x'.repeat(300001),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(big.status()).toBe(400);
  const hook = await request.post('/api/webhook', {
    data: { type: 'monitor.change', monitorId: 'invalid', changeId: 'bad' },
    headers: { 'X-Anakin-Signature': 'sha256=' + '0'.repeat(64) },
  });
  expect(hook.status()).toBe(401);
});
