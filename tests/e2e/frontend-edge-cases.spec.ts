import { test, expect, type Page } from '@playwright/test';
import type { Data, Item } from '../../lib/ui/workspace';
import { MAX_CSV_BYTES } from '../../lib/core/csv';

// Isolated browser fixtures: these HTTP responses never enter an inventory database.
const units: Item[] = ['A', 'B'].map((suffix) => ({
  id: `browser-unit-${suffix}`,
  assetTag: `BROWSER-${suffix}`,
  title: `Browser regression unit ${suffix}`,
  brand: 'Browser test',
  model: `UNIT-${suffix}`,
  quarantined: false,
  acknowledged: false,
  assessment: null,
}));
const workspace: Data = {
  demo: { enabled: false, sampleCount: 0, subject: '', monitoringReady: false },
  inventory: units,
  tasks: [],
  sources: [],
  monitors: [],
  events: [],
  runs: [],
  audit: [],
  imports: [],
  health: {
    keyConfigured: true,
    webhookConfigured: false,
    coverage: 'Coverage returned by the test server.',
    approvedHosts: ['cpsc.gov'],
    investigationLimits: { groups: 3, sourcesPerGroup: 1, items: 20 },
  },
};
async function mockSession(page: Page) {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        authenticated: route.request().method() !== 'DELETE',
        mode: 'operator',
      },
    }),
  );
}

test('disabled test-replay deep links recover to Overview and investigation uses server policy', async ({
  page,
}) => {
  await mockSession(page);
  await page.route('**/api/workspace', (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.goto('/workspace#view=judge');
  await expect(
    page.getByRole('heading', { name: 'Your safety workspace.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=overview/);
  await expect(
    page.getByRole('button', { name: 'Judge Mode', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Investigation', exact: true })
    .click();
  await expect(
    page.getByText(/process up to 3 product groups per run/),
  ).toBeVisible();
  await expect(page.getByText(/Approved domains: cpsc.gov/)).toBeVisible();
  await expect(
    page.getByText(/Only CPSC and INIU official domains/),
  ).toHaveCount(0);
});

test('a listing draft is scoped to its unit and cannot enrich another unit by accident', async ({
  page,
}) => {
  await mockSession(page);
  await page.route('**/api/workspace', (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.goto(`/workspace#view=case&item=${units[0].id}`);
  await page.getByRole('button', { name: 'Enrich this unit' }).click();
  await page.getByRole('textbox', { name: 'Amazon ASIN' }).fill('B012345678');
  await expect(
    page.getByRole('button', { name: 'Enrich with Anakin Wire' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page
    .getByRole('button', { name: units[1].assetTag, exact: true })
    .click();
  await page.getByRole('button', { name: 'Enrich this unit' }).click();
  await expect(page.getByRole('textbox', { name: 'Amazon ASIN' })).toHaveValue(
    '',
  );
  await expect(
    page.getByRole('button', { name: 'Enrich with Anakin Wire' }),
  ).toBeDisabled();
});

test('choosing an invalid CSV discards the previous reviewed import', async ({
  page,
}) => {
  await mockSession(page);
  await page.route('**/api/workspace', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'POST' ? { rows: [units[0]] } : workspace,
    }),
  );
  await page.goto('/workspace#view=import');
  await page
    .getByLabel('Or paste CSV')
    .fill('assetTag,title\nBROWSER-A,Browser regression unit A');
  await page
    .getByRole('button', { name: 'Review import', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Import 1 units', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Choose CSV file').setInputFiles({
    name: 'oversized.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(MAX_CSV_BYTES + 1, 'x'),
  });
  await expect(page.getByRole('alert')).toContainText('CSV exceeds');
  await expect(
    page.getByRole('button', { name: 'Import 1 units', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Or paste CSV')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Review import', exact: true }),
  ).toBeDisabled();
});

test('an action from an ended session cannot repopulate private drafts after signing in again', async ({
  page,
}) => {
  await mockSession(page);
  let releaseAction!: () => void;
  const actionHeld = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });
  let actionFinished = false;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'POST') {
      await actionHeld;
      await route.fulfill({
        json: {
          rows: [units[0]],
          message: 'Old session validation completed.',
        },
      });
      actionFinished = true;
    } else await route.fulfill({ json: workspace });
  });
  try {
    await page.goto('/workspace#view=import');
    await page
      .getByLabel('Or paste CSV')
      .fill('assetTag,title\nBROWSER-A,Private previous-session draft');
    await page
      .getByRole('button', { name: 'Review import', exact: true })
      .click();
    await expect(page.getByLabel('Or paste CSV')).toBeDisabled();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await page
      .getByLabel('Owner access key', { exact: true })
      .fill('isolated-browser-session-key');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your safety workspace.' }),
    ).toBeVisible();
    releaseAction();
    await expect.poll(() => actionFinished).toBe(true);
    await page
      .getByRole('button', { name: 'Import review', exact: true })
      .click();
    await expect(page.getByLabel('Or paste CSV')).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Import 1 units', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Old session validation completed.', { exact: true }),
    ).toHaveCount(0);
  } finally {
    releaseAction();
  }
});
